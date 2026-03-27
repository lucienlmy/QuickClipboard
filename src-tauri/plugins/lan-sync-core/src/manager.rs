use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use futures_util::future::{AbortHandle, Abortable};
use futures_util::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration, Instant};
use tokio_tungstenite::{accept_async, connect_async, tungstenite::{Bytes, Message}};
use url::Url;

use crate::protocol::{AuthChallenge, AuthResponse, ClipboardItem, ClipboardRecord, HelloMessage, LanSyncMessage};
use crate::types::{ConnectionState, CoreEvent, LanSyncConfig, LanSyncError, Snapshot};

const CLIENT_SEND_QUEUE_MAX: usize = 200;
const ATTACH_MAGIC: &[u8; 5] = b"QCAT1";
const ATTACH_CHUNK_TYPE: u8 = 1;
const ATTACH_REQ_TYPE: u8 = 2;
const ATTACH_CHUNK_TO_TYPE: u8 = 3;

const PAIR_CODE_TTL: Duration = Duration::from_secs(5 * 60);
const KICK_TTL: Duration = Duration::from_secs(10);
const AUTH_TS_SKEW: Duration = Duration::from_secs(30);

#[derive(Debug, Clone)]
enum OutgoingFrame {
    Json(LanSyncMessage),
    Binary(Vec<u8>),
}

#[derive(Clone)]
pub struct LanSyncManager {
    inner: Arc<tokio::sync::Mutex<Inner>>,
}

fn gen_pair_secret() -> String {
    let mut out = String::with_capacity(64);
    for _ in 0..32 {
        let b: u8 = fastrand::u8(..);
        out.push_str(&format!("{:02x}", b));
    }
    out
}

fn gen_nonce() -> String {
    let mut out = String::with_capacity(32);
    for _ in 0..16 {
        let b: u8 = fastrand::u8(..);
        out.push_str(&format!("{:02x}", b));
    }
    out
}

fn current_time_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

fn compute_auth_sig(pair_secret: &str, device_id: &str, nonce: &str, ts_ms: u64) -> String {
    let msg = format!("{}:{}:{}", device_id, nonce, ts_ms);
    let mut mac = Hmac::<Sha256>::new_from_slice(pair_secret.as_bytes()).unwrap_or_else(|_| {
        Hmac::<Sha256>::new_from_slice(b"invalid").expect("hmac init")
    });
    mac.update(msg.as_bytes());
    let out = mac.finalize().into_bytes();
    hex::encode(out)
}

fn record_to_clipboard_item(record: &ClipboardRecord) -> ClipboardItem {
    ClipboardItem {
        uuid: record.uuid.clone(),
        source_device_id: record.source_device_id.clone(),
        content: record.content.clone(),
        html_content: record.html_content.clone(),
        content_type: record.content_type.clone(),
        image_id: record.image_id.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn should_send_clipboard_item(record: &ClipboardRecord) -> bool {
    let ct = record.content_type.trim().to_lowercase();
    if ct == "file" {
        return false;
    }
    if ct == "image" || ct.starts_with("image/") {
        return false;
    }
    true
}

fn clipboard_item_to_record(item: ClipboardItem) -> ClipboardRecord {
    ClipboardRecord {
        uuid: item.uuid,
        source_device_id: item.source_device_id,
        is_remote: true,
        content: item.content,
        html_content: item.html_content,
        content_type: item.content_type,
        image_id: item.image_id,
        source_app: None,
        source_icon_hash: None,
        char_count: None,
        raw_formats: Vec::new(),
        created_at: item.created_at,
        updated_at: item.updated_at,
    }
}

fn encode_attachment_chunk_to_frame(
    target_device_id: &str,
    image_id: &str,
    total_len: u64,
    offset: u64,
    data: &[u8],
) -> Vec<u8> {
    let target_bytes = target_device_id.as_bytes();
    let id_bytes = image_id.as_bytes();
    let mut out = Vec::with_capacity(
        5 + 1 + 4 + target_bytes.len() + 4 + id_bytes.len() + 8 + 8 + 4 + data.len(),
    );
    out.extend_from_slice(ATTACH_MAGIC);
    out.push(ATTACH_CHUNK_TO_TYPE);
    out.extend_from_slice(&(target_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(target_bytes);
    out.extend_from_slice(&(id_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(id_bytes);
    out.extend_from_slice(&total_len.to_le_bytes());
    out.extend_from_slice(&offset.to_le_bytes());
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(data);
    out
}

fn encode_attachment_request_frame(
    requester_device_id: &str,
    preferred_provider_device_id: Option<&str>,
    image_id: &str,
) -> Vec<u8> {
    let requester_bytes = requester_device_id.as_bytes();
    let preferred_bytes = preferred_provider_device_id.map(|s| s.as_bytes());
    let id_bytes = image_id.as_bytes();
    let mut out = Vec::with_capacity(
        5 + 1
            + 4 + requester_bytes.len()
            + 4 + preferred_bytes.as_ref().map(|b| b.len()).unwrap_or(0)
            + 4 + id_bytes.len(),
    );
    out.extend_from_slice(ATTACH_MAGIC);
    out.push(ATTACH_REQ_TYPE);
    out.extend_from_slice(&(requester_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(requester_bytes);
    if let Some(pb) = preferred_bytes {
        out.extend_from_slice(&(pb.len() as u32).to_le_bytes());
        out.extend_from_slice(pb);
    } else {
        out.extend_from_slice(&0u32.to_le_bytes());
    }
    out.extend_from_slice(&(id_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(id_bytes);
    out
}

fn read_u32_le(buf: &[u8], offset: &mut usize) -> Option<u32> {
    if *offset + 4 > buf.len() {
        return None;
    }
    let mut a = [0u8; 4];
    a.copy_from_slice(&buf[*offset..*offset + 4]);
    *offset += 4;
    Some(u32::from_le_bytes(a))
}

fn read_u64_le(buf: &[u8], offset: &mut usize) -> Option<u64> {
    if *offset + 8 > buf.len() {
        return None;
    }
    let mut a = [0u8; 8];
    a.copy_from_slice(&buf[*offset..*offset + 8]);
    *offset += 8;
    Some(u64::from_le_bytes(a))
}

fn encode_attachment_chunk_frame(image_id: &str, total_len: u64, offset: u64, data: &[u8]) -> Vec<u8> {
    let id_bytes = image_id.as_bytes();
    let mut out = Vec::with_capacity(5 + 1 + 4 + id_bytes.len() + 8 + 8 + 4 + data.len());
    out.extend_from_slice(ATTACH_MAGIC);
    out.push(ATTACH_CHUNK_TYPE);
    out.extend_from_slice(&(id_bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(id_bytes);
    out.extend_from_slice(&total_len.to_le_bytes());
    out.extend_from_slice(&offset.to_le_bytes());
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(data);
    out
}

fn decode_attachment_chunk_frame(frame: &[u8]) -> Option<(String, u64, u64, Vec<u8>)> {
    if frame.len() < 6 {
        return None;
    }
    if &frame[0..5] != ATTACH_MAGIC {
        return None;
    }
    if frame[5] != ATTACH_CHUNK_TYPE {
        return None;
    }
    let mut p: usize = 6;
    let id_len = read_u32_le(frame, &mut p)? as usize;
    if p + id_len > frame.len() {
        return None;
    }
    let image_id = std::str::from_utf8(&frame[p..p + id_len]).ok()?.to_string();
    p += id_len;
    let total_len = read_u64_le(frame, &mut p)?;
    let offset = read_u64_le(frame, &mut p)?;
    let data_len = read_u32_le(frame, &mut p)? as usize;
    if p + data_len > frame.len() {
        return None;
    }
    let data = frame[p..p + data_len].to_vec();
    Some((image_id, total_len, offset, data))
}

fn decode_attachment_chunk_to_frame(frame: &[u8]) -> Option<(String, String, u64, u64, Vec<u8>)> {
    if frame.len() < 6 {
        return None;
    }
    if &frame[0..5] != ATTACH_MAGIC {
        return None;
    }
    if frame[5] != ATTACH_CHUNK_TO_TYPE {
        return None;
    }

    let mut p: usize = 6;
    let target_len = read_u32_le(frame, &mut p)? as usize;
    if p + target_len > frame.len() {
        return None;
    }
    let target_device_id = std::str::from_utf8(&frame[p..p + target_len]).ok()?.to_string();
    p += target_len;

    let id_len = read_u32_le(frame, &mut p)? as usize;
    if p + id_len > frame.len() {
        return None;
    }
    let image_id = std::str::from_utf8(&frame[p..p + id_len]).ok()?.to_string();
    p += id_len;

    let total_len = read_u64_le(frame, &mut p)?;
    let offset = read_u64_le(frame, &mut p)?;
    let data_len = read_u32_le(frame, &mut p)? as usize;
    if p + data_len > frame.len() {
        return None;
    }
    let data = frame[p..p + data_len].to_vec();
    Some((target_device_id, image_id, total_len, offset, data))
}

fn decode_attachment_request_frame(frame: &[u8]) -> Option<(String, Option<String>, String)> {
    if frame.len() < 6 {
        return None;
    }
    if &frame[0..5] != ATTACH_MAGIC {
        return None;
    }
    if frame[5] != ATTACH_REQ_TYPE {
        return None;
    }

    let mut p: usize = 6;
    let requester_len = read_u32_le(frame, &mut p)? as usize;
    if p + requester_len > frame.len() {
        return None;
    }
    let requester_device_id = std::str::from_utf8(&frame[p..p + requester_len]).ok()?.to_string();
    p += requester_len;

    let preferred_len = read_u32_le(frame, &mut p)? as usize;
    let preferred_provider_device_id = if preferred_len == 0 {
        None
    } else {
        if p + preferred_len > frame.len() {
            return None;
        }
        let s = std::str::from_utf8(&frame[p..p + preferred_len]).ok()?.to_string();
        p += preferred_len;
        Some(s)
    };

    let id_len = read_u32_le(frame, &mut p)? as usize;
    if p + id_len > frame.len() {
        return None;
    }
    let image_id = std::str::from_utf8(&frame[p..p + id_len]).ok()?.to_string();
    Some((requester_device_id, preferred_provider_device_id, image_id))
}

struct Inner {
    config: LanSyncConfig,
    snapshot: Snapshot,
    server_task: Option<JoinHandle<()>>,
    client_task: Option<JoinHandle<()>>,
    event_tx: tokio::sync::broadcast::Sender<CoreEvent>,
    client_out_tx: Option<tokio::sync::mpsc::UnboundedSender<OutgoingFrame>>,
    client_send_queue: VecDeque<OutgoingFrame>,
    server_peer_out_txs: HashMap<String, tokio::sync::mpsc::UnboundedSender<OutgoingFrame>>,

    active_by_device_id: HashMap<String, (u64, AbortHandle)>,
    next_conn_id: u64,

    kicked_until_by_device_id: HashMap<String, Instant>,
    banned_pair_code_by_device_id: HashMap<String, String>,

    trusted_pair_secret_by_device_id: HashMap<String, String>,

    client_auto_reconnect: bool,
    client_manual_disconnect: bool,

    server_pair_code: Option<String>,
    server_pair_code_expires_at: Option<Instant>,

    client_pair_code: Option<String>,
}

impl LanSyncManager {
    pub fn new(config: LanSyncConfig) -> Self {
        let (event_tx, _) = tokio::sync::broadcast::channel::<CoreEvent>(128);
        let inner = Inner {
            config,
            snapshot: Snapshot::default(),
            server_task: None,
            client_task: None,
            event_tx,
            client_out_tx: None,
            client_send_queue: VecDeque::new(),
            server_peer_out_txs: HashMap::new(),

            active_by_device_id: HashMap::new(),
            next_conn_id: 1,

            kicked_until_by_device_id: HashMap::new(),
            banned_pair_code_by_device_id: HashMap::new(),

            trusted_pair_secret_by_device_id: HashMap::new(),

            client_auto_reconnect: false,
            client_manual_disconnect: false,

            server_pair_code: None,
            server_pair_code_expires_at: None,

            client_pair_code: None,
        };

        Self {
            inner: Arc::new(tokio::sync::Mutex::new(inner)),
        }
    }

    pub async fn set_server_pair_code(&self, code: Option<String>) {
        let mut inner = self.inner.lock().await;
        inner.server_pair_code = code;
        inner.banned_pair_code_by_device_id.clear();
        inner.server_pair_code_expires_at = inner
            .server_pair_code
            .as_ref()
            .map(|_| Instant::now() + PAIR_CODE_TTL);
    }

    pub async fn get_server_pair_code(&self) -> Option<(String, u64)> {
        let inner = self.inner.lock().await;
        let code = inner.server_pair_code.clone()?;
        let expires_at = inner.server_pair_code_expires_at?;
        let now = Instant::now();
        if now >= expires_at {
            return None;
        }
        let remaining_ms = expires_at.saturating_duration_since(now).as_millis() as u64;
        Some((code, remaining_ms))
    }

    pub async fn broadcast_attachment_chunk(
        &self,
        image_id: &str,
        total_len: u64,
        offset: u64,
        data: &[u8],
    ) -> Result<(), LanSyncError> {
        self.broadcast_attachment_chunk_excluding(image_id, total_len, offset, data, None)
            .await
    }

    pub async fn broadcast_attachment_chunk_to(
        &self,
        target_device_id: &str,
        image_id: &str,
        total_len: u64,
        offset: u64,
        data: &[u8],
    ) -> Result<(), LanSyncError> {
        let inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }
        if inner.server_task.is_none() {
            return Err(LanSyncError::Ws("服务端未启动".to_string()));
        }

        let Some(tx) = inner.server_peer_out_txs.get(target_device_id) else {
            return Err(LanSyncError::Ws("目标客户端未连接".to_string()));
        };

        let frame = encode_attachment_chunk_to_frame(target_device_id, image_id, total_len, offset, data);
        tx.send(OutgoingFrame::Binary(frame))
            .map_err(|_| LanSyncError::Ws("发送失败".to_string()))
    }

    pub async fn broadcast_attachment_request_excluding(
        &self,
        requester_device_id: &str,
        preferred_provider_device_id: Option<&str>,
        image_id: &str,
        exclude_device_id: Option<&str>,
    ) -> Result<(), LanSyncError> {
        let inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }
        if inner.server_task.is_none() {
            return Err(LanSyncError::Ws("服务端未启动".to_string()));
        }
        if inner.server_peer_out_txs.is_empty() {
            return Err(LanSyncError::Ws("没有已连接的客户端".to_string()));
        }

        let frame = encode_attachment_request_frame(
            requester_device_id,
            preferred_provider_device_id,
            image_id,
        );
        let msg = OutgoingFrame::Binary(frame);

        let mut ok_any = false;
        for (device_id, tx) in inner.server_peer_out_txs.iter() {
            if exclude_device_id.is_some_and(|x| x == device_id.as_str()) {
                continue;
            }
            if tx.send(msg.clone()).is_ok() {
                ok_any = true;
            }
        }

        if ok_any {
            Ok(())
        } else {
            Err(LanSyncError::Ws("发送失败".to_string()))
        }
    }

    pub async fn send_attachment_request(
        &self,
        preferred_provider_device_id: Option<&str>,
        image_id: &str,
    ) -> Result<(), LanSyncError> {
        let mut inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }

        let requester_device_id = inner.config.device_id.clone();
        let frame = encode_attachment_request_frame(
            &requester_device_id,
            preferred_provider_device_id,
            image_id,
        );
        let msg = OutgoingFrame::Binary(frame);

        if let Some(tx) = inner.client_out_tx.clone() {
            tx.send(msg)
                .map_err(|_| LanSyncError::Ws("发送失败".to_string()))?;
            return Ok(());
        }

        if inner.client_send_queue.len() >= CLIENT_SEND_QUEUE_MAX {
            inner.client_send_queue.pop_front();
        }
        inner.client_send_queue.push_back(msg);
        Ok(())
    }

    pub async fn send_attachment_chunk_to(
        &self,
        target_device_id: &str,
        image_id: &str,
        total_len: u64,
        offset: u64,
        data: &[u8],
    ) -> Result<(), LanSyncError> {
        let mut inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }

        let frame = encode_attachment_chunk_to_frame(target_device_id, image_id, total_len, offset, data);
        let msg = OutgoingFrame::Binary(frame);

        if let Some(tx) = inner.client_out_tx.clone() {
            tx.send(msg)
                .map_err(|_| LanSyncError::Ws("发送失败".to_string()))?;
            return Ok(());
        }

        if inner.client_send_queue.len() >= CLIENT_SEND_QUEUE_MAX {
            inner.client_send_queue.pop_front();
        }
        inner.client_send_queue.push_back(msg);
        Ok(())
    }

    pub async fn broadcast_attachment_chunk_excluding(
        &self,
        image_id: &str,
        total_len: u64,
        offset: u64,
        data: &[u8],
        exclude_device_id: Option<&str>,
    ) -> Result<(), LanSyncError> {
        let inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }
        if inner.server_task.is_none() {
            return Err(LanSyncError::Ws("服务端未启动".to_string()));
        }
        if inner.server_peer_out_txs.is_empty() {
            return Err(LanSyncError::Ws("没有已连接的客户端".to_string()));
        }

        let frame = encode_attachment_chunk_frame(image_id, total_len, offset, data);
        let msg = OutgoingFrame::Binary(frame);
        let mut ok_any = false;
        for (device_id, tx) in inner.server_peer_out_txs.iter() {
            if exclude_device_id.is_some_and(|x| x == device_id.as_str()) {
                continue;
            }
            if tx.send(msg.clone()).is_ok() {
                ok_any = true;
            }
        }

        if ok_any {
            Ok(())
        } else {
            Err(LanSyncError::Ws("发送失败".to_string()))
        }
    }

    pub async fn set_enabled(&self, enabled: bool) {
        let mut inner = self.inner.lock().await;
        inner.snapshot.enabled = enabled;
        if !enabled {
            for (_device_id, (_conn_id, abort_handle)) in inner.active_by_device_id.drain() {
                abort_handle.abort();
            }
            inner.server_peer_out_txs.clear();
            inner.snapshot.server_connected_count = 0;
            inner.snapshot.server_connected_device_ids.clear();

            inner.client_manual_disconnect = true;
            if let Some(h) = inner.client_task.take() {
                h.abort();
            }
            if let Some(h) = inner.server_task.take() {
                h.abort();
            }
            inner.client_out_tx = None;
            inner.client_send_queue.clear();
            inner.snapshot.state = ConnectionState::Stopped;
            inner.snapshot.server_port = None;
            inner.snapshot.peer_url = None;
            inner.snapshot.reconnecting = false;
            inner.snapshot.reconnect_attempt = 0;
            inner.snapshot.next_retry_in_ms = None;
        }
    }

    pub async fn subscribe(&self) -> tokio::sync::broadcast::Receiver<CoreEvent> {
        self.inner.lock().await.event_tx.subscribe()
    }

    pub async fn get_snapshot(&self) -> Snapshot {
        self.inner.lock().await.snapshot.clone()
    }

    pub async fn start_server(&self, port: u16) -> Result<u16, LanSyncError> {
        {
            let mut inner = self.inner.lock().await;
            if !inner.snapshot.enabled {
                return Err(LanSyncError::NotEnabled);
            }
            if let Some(h) = inner.server_task.take() {
                h.abort();
            }
            inner.snapshot.server_port = None;
            inner.snapshot.state = ConnectionState::Listening;
            inner.snapshot.server_connected_count = 0;
            inner.snapshot.server_connected_device_ids.clear();
            inner.server_peer_out_txs.clear();
        }

        let listener = TcpListener::bind(("0.0.0.0", port))
            .await
            .map_err(|e| LanSyncError::Ws(e.to_string()))?;

        let bound_port = listener
            .local_addr()
            .map(|a| a.port())
            .map_err(|e| LanSyncError::Ws(e.to_string()))?;

        let this = self.clone();
        let handle = tokio::spawn(async move {
            loop {
                let Ok((stream, _addr)) = listener.accept().await else {
                    break;
                };
                let mgr = this.clone();
                let (abort_handle, abort_reg) = AbortHandle::new_pair();
                tokio::spawn(async move {
                    let fut = mgr.handle_incoming(stream, abort_handle);
                    let _ = Abortable::new(fut, abort_reg).await;
                });
            }
        });

        let mut inner = self.inner.lock().await;
        inner.server_task = Some(handle);
        inner.snapshot.server_port = Some(bound_port);
        Ok(bound_port)
    }

    pub async fn disconnect_device(&self, device_id: &str) -> bool {
        let abort_handle = {
            let mut inner = self.inner.lock().await;
            let Some((_conn_id, abort_handle)) = inner.active_by_device_id.remove(device_id) else {
                return false;
            };

            inner.server_peer_out_txs.remove(device_id);
            inner
                .kicked_until_by_device_id
                .insert(device_id.to_string(), Instant::now() + KICK_TTL);
            Self::refresh_server_snapshot_locked(&mut inner);
            abort_handle
        };

        abort_handle.abort();
        true
    }

    pub async fn ban_device_for_current_pair_code(&self, device_id: &str) -> bool {
        let mut inner = self.inner.lock().await;
        let Some(code) = inner.server_pair_code.clone() else {
            return false;
        };
        inner
            .banned_pair_code_by_device_id
            .insert(device_id.to_string(), code);
        true
    }

    pub async fn set_trusted_device_pair_secret(&self, device_id: &str, pair_secret: &str) {
        let mut inner = self.inner.lock().await;
        inner
            .trusted_pair_secret_by_device_id
            .insert(device_id.to_string(), pair_secret.to_string());
    }

    pub async fn remove_trusted_device_pair_secret(&self, device_id: &str) {
        let mut inner = self.inner.lock().await;
        inner.trusted_pair_secret_by_device_id.remove(device_id);
    }

    pub async fn set_trusted_devices_pair_secrets(&self, devices: Vec<(String, String)>) {
        let mut inner = self.inner.lock().await;
        inner.trusted_pair_secret_by_device_id.clear();
        for (device_id, pair_secret) in devices {
            inner
                .trusted_pair_secret_by_device_id
                .insert(device_id, pair_secret);
        }
    }

    pub async fn connect_peer(
        &self,
        peer_url: &str,
        auto_reconnect: bool,
        pair_code: Option<String>,
    ) -> Result<(), LanSyncError> {
        let _ = Url::parse(peer_url).map_err(|_| LanSyncError::InvalidUrl)?;

        {
            let mut inner = self.inner.lock().await;
            if !inner.snapshot.enabled {
                return Err(LanSyncError::NotEnabled);
            }
            if let Some(h) = inner.client_task.take() {
                h.abort();
            }
            inner.snapshot.peer_url = Some(peer_url.to_string());
            inner.snapshot.state = ConnectionState::Connecting;
            inner.snapshot.reconnecting = auto_reconnect;
            inner.snapshot.reconnect_attempt = 0;
            inner.snapshot.next_retry_in_ms = None;
            inner.client_auto_reconnect = auto_reconnect;
            inner.client_manual_disconnect = false;
            inner.client_pair_code = pair_code;
        }

        let this = self.clone();
        let peer_url_owned = peer_url.to_string();
        let handle = tokio::spawn(async move {
            let mut backoff = Duration::from_millis(200);
            let max_backoff = Duration::from_secs(5);
            let mut attempt: u32 = 0;

            loop {
                attempt = attempt.saturating_add(1);
                {
                    let mut inner = this.inner.lock().await;
                    if inner.snapshot.enabled {
                        inner.snapshot.state = ConnectionState::Connecting;
                        inner.snapshot.reconnecting = inner.client_auto_reconnect;
                        inner.snapshot.reconnect_attempt = attempt;
                        inner.snapshot.next_retry_in_ms = None;
                    }
                }

                let res = this.connect_and_run(peer_url_owned.clone()).await;

                {
                    let mut inner = this.inner.lock().await;
                    if inner.snapshot.enabled {
                        inner.snapshot.state = ConnectionState::Disconnected;
                        inner.snapshot.reconnecting = inner.client_auto_reconnect && !inner.client_manual_disconnect;
                    }

                    let should_reconnect = inner.snapshot.enabled
                        && inner.client_auto_reconnect
                        && !inner.client_manual_disconnect;

                    if !should_reconnect {
                        inner.snapshot.next_retry_in_ms = None;
                        break;
                    }
                }

                if res.is_err() {
                    {
                        let mut inner = this.inner.lock().await;
                        inner.snapshot.next_retry_in_ms = Some(backoff.as_millis() as u64);
                    }
                    tokio::time::sleep(backoff).await;
                    backoff = std::cmp::min(backoff.saturating_mul(2), max_backoff);
                } else {
                    attempt = 0;
                    backoff = Duration::from_millis(200);
                    {
                        let mut inner = this.inner.lock().await;
                        inner.snapshot.next_retry_in_ms = Some(200);
                    }
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
            }
        });

        let mut inner = self.inner.lock().await;
        inner.client_task = Some(handle);
        Ok(())
    }

    pub async fn send_attachment_chunk(
        &self,
        image_id: &str,
        total_len: u64,
        offset: u64,
        data: &[u8],
    ) -> Result<(), LanSyncError> {
        let mut inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }

        let frame = encode_attachment_chunk_frame(image_id, total_len, offset, data);
        let msg = OutgoingFrame::Binary(frame);
        if let Some(tx) = inner.client_out_tx.clone() {
            tx.send(msg)
                .map_err(|_| LanSyncError::Ws("发送失败".to_string()))?;
            return Ok(());
        }

        if inner.client_send_queue.len() >= CLIENT_SEND_QUEUE_MAX {
            inner.client_send_queue.pop_front();
        }
        inner.client_send_queue.push_back(msg);
        Ok(())
    }

    pub async fn disconnect_peer(&self) {
        let mut inner = self.inner.lock().await;
        inner.client_manual_disconnect = true;
        inner.snapshot.state = ConnectionState::Disconnected;
        inner.snapshot.reconnecting = false;
        inner.snapshot.reconnect_attempt = 0;
        inner.snapshot.next_retry_in_ms = None;
        inner.client_out_tx = None;
        inner.client_send_queue.clear();
        if let Some(h) = inner.client_task.take() {
            h.abort();
        }
    }

    pub async fn broadcast_clipboard_record(&self, record: ClipboardRecord) -> Result<(), LanSyncError> {
        self.broadcast_clipboard_record_excluding(record, None).await
    }

    pub async fn broadcast_clipboard_record_excluding(
        &self,
        record: ClipboardRecord,
        exclude_device_id: Option<&str>,
    ) -> Result<(), LanSyncError> {
        let inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }
        if inner.server_task.is_none() {
            return Err(LanSyncError::Ws("服务端未启动".to_string()));
        }
        if inner.server_peer_out_txs.is_empty() {
            return Err(LanSyncError::Ws("没有已连接的客户端".to_string()));
        }

        let msg_record = OutgoingFrame::Json(LanSyncMessage::ClipboardRecord { record: record.clone() });
        let msg_item = if should_send_clipboard_item(&record) {
            Some(OutgoingFrame::Json(LanSyncMessage::ClipboardItem(record_to_clipboard_item(&record))))
        } else {
            None
        };

        let mut ok_any = false;
        for (device_id, tx) in inner.server_peer_out_txs.iter() {
            if exclude_device_id.is_some_and(|x| x == device_id.as_str()) {
                continue;
            }
            if tx.send(msg_record.clone()).is_ok() {
                ok_any = true;
            }
            if let Some(m) = msg_item.clone() {
                let _ = tx.send(m);
            }
        }

        if ok_any {
            Ok(())
        } else {
            Err(LanSyncError::Ws("发送失败".to_string()))
        }
    }

    pub async fn send_clipboard_record(&self, record: ClipboardRecord) -> Result<(), LanSyncError> {
        let mut inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }

        let msg_record = OutgoingFrame::Json(LanSyncMessage::ClipboardRecord { record: record.clone() });
        let msg_item = if should_send_clipboard_item(&record) {
            Some(OutgoingFrame::Json(LanSyncMessage::ClipboardItem(record_to_clipboard_item(&record))))
        } else {
            None
        };

        if let Some(tx) = inner.client_out_tx.clone() {
            tx.send(msg_record)
                .map_err(|_| LanSyncError::Ws("发送失败".to_string()))?;
            if let Some(m) = msg_item {
                let _ = tx.send(m);
            }
            return Ok(());
        }

        if inner.client_send_queue.len() >= CLIENT_SEND_QUEUE_MAX {
            inner.client_send_queue.pop_front();
        }
        inner.client_send_queue.push_back(msg_record);
        if let Some(m) = msg_item {
            if inner.client_send_queue.len() >= CLIENT_SEND_QUEUE_MAX {
                inner.client_send_queue.pop_front();
            }
            inner.client_send_queue.push_back(m);
        }
        Ok(())
    }

    async fn handle_incoming(
        &self,
        stream: tokio::net::TcpStream,
        abort_handle: AbortHandle,
    ) -> Result<(), LanSyncError> {
        let ws = accept_async(stream)
            .await
            .map_err(|e| LanSyncError::Ws(e.to_string()))?;
        let (mut write, mut read) = ws.split();

        let (device_id, version) = {
            let inner = self.inner.lock().await;
            (inner.config.device_id.clone(), inner.config.protocol_version)
        };

        let hello = LanSyncMessage::Hello(HelloMessage {
            device_id,
            version,
            pair_code: None,
        });
        let hello_text = serde_json::to_string(&hello).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
        write
            .send(Message::Text(hello_text.into()))
            .await
            .map_err(|e| LanSyncError::Ws(e.to_string()))?;

        let remote = timeout(Duration::from_secs(5), read.next())
            .await
            .map_err(|_| LanSyncError::Timeout)?;

        let Some(Ok(Message::Text(text))) = remote else {
            return Err(LanSyncError::Protocol("缺少 Hello 握手".to_string()));
        };

        let remote_hello: LanSyncMessage =
            serde_json::from_str(&text).map_err(|e| LanSyncError::Protocol(e.to_string()))?;

        let (remote_device_id, remote_pair_code) = match remote_hello {
            LanSyncMessage::Hello(h) => (h.device_id, h.pair_code),
            LanSyncMessage::ClipboardRecord { .. }
            | LanSyncMessage::ClipboardItem(_)
            | LanSyncMessage::AuthChallenge(_)
            | LanSyncMessage::AuthResponse(_)
            | LanSyncMessage::PairAccepted { .. }
            | LanSyncMessage::PairDenied { .. } => {
                return Err(LanSyncError::Protocol("握手阶段收到了非 Hello 消息".to_string()));
            }
        };

        {
            let denied_reason = {
                let mut inner = self.inner.lock().await;

                let now = Instant::now();
                inner.kicked_until_by_device_id.retain(|_, until| *until > now);

                if let Some(until) = inner.kicked_until_by_device_id.get(&remote_device_id) {
                    if now < *until {
                        Some("设备已被断开，请稍后重试".to_string())
                    } else {
                        None
                    }
                } else {
                    None
                }
            };

            if let Some(reason) = denied_reason {
                let denied = LanSyncMessage::PairDenied { reason };
                let payload = serde_json::to_string(&denied).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                let _ = write.send(Message::Text(payload.into())).await;
                return Err(LanSyncError::Protocol("设备已被断开".to_string()));
            }
        }

        {
            let denied_reason = {
                let inner = self.inner.lock().await;
                let expected = inner.server_pair_code.as_ref();
                let banned_code = inner.banned_pair_code_by_device_id.get(&remote_device_id);
                match (expected, banned_code) {
                    (Some(expected), Some(banned_code)) if banned_code.trim() == expected.trim() => {
                        let provided = remote_pair_code.clone().unwrap_or_default();
                        if provided.trim() == banned_code.trim() {
                            Some("该设备已被移除，需要刷新配对码后重新配对".to_string())
                        } else {
                            None
                        }
                    }
                    _ => None,
                }
            };

            if let Some(reason) = denied_reason {
                let denied = LanSyncMessage::PairDenied { reason };
                let payload = serde_json::to_string(&denied).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                let _ = write.send(Message::Text(payload.into())).await;
                return Err(LanSyncError::Protocol("设备已被移除".to_string()));
            }
        }

        // 服务端：已信任设备优先免配对码鉴权（pair_code 有无都不影响）
        let mut authed = false;
        {
            let maybe_secret = {
                let inner = self.inner.lock().await;
                inner
                    .trusted_pair_secret_by_device_id
                    .get(&remote_device_id)
                    .cloned()
            };

            if let Some(pair_secret) = maybe_secret {
                let nonce = gen_nonce();
                let ts_ms = current_time_ms();
                let challenge = LanSyncMessage::AuthChallenge(AuthChallenge { nonce: nonce.clone(), ts_ms });
                let payload = serde_json::to_string(&challenge).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                write
                    .send(Message::Text(payload.into()))
                    .await
                    .map_err(|e| LanSyncError::Ws(e.to_string()))?;

                let res = timeout(Duration::from_secs(5), read.next())
                    .await
                    .map_err(|_| LanSyncError::Timeout)?;

                if let Some(Ok(Message::Text(text))) = res {
                    if let Ok(msg) = serde_json::from_str::<LanSyncMessage>(&text) {
                        if let LanSyncMessage::AuthResponse(AuthResponse { nonce: n2, ts_ms: t2, sig }) = msg {
                            let now_ms = current_time_ms();
                            let skew_ok = if now_ms >= t2 {
                                (now_ms - t2) <= AUTH_TS_SKEW.as_millis() as u64
                            } else {
                                (t2 - now_ms) <= AUTH_TS_SKEW.as_millis() as u64
                            };

                            if skew_ok && n2 == nonce {
                                let expected = compute_auth_sig(&pair_secret, &remote_device_id, &nonce, ts_ms);
                                if sig.trim().eq_ignore_ascii_case(expected.trim()) {
                                    authed = true;
                                    let accepted = LanSyncMessage::PairAccepted { pair_secret: None };
                                    let payload = serde_json::to_string(&accepted).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                                    write
                                        .send(Message::Text(payload.into()))
                                        .await
                                        .map_err(|e| LanSyncError::Ws(e.to_string()))?;
                                }
                            }
                        }
                    }
                }
            }
        }

        if !authed {
            // 服务端：配对码校验
            {
                let inner = self.inner.lock().await;
                if let Some(expected) = inner.server_pair_code.as_ref() {
                    let Some(expire_at) = inner.server_pair_code_expires_at else {
                        let denied = LanSyncMessage::PairDenied { reason: "配对码已过期".to_string() };
                        let payload = serde_json::to_string(&denied).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                        let _ = write.send(Message::Text(payload.into())).await;
                        return Err(LanSyncError::Protocol("配对码已过期".to_string()));
                    };
                    if Instant::now() > expire_at {
                        let denied = LanSyncMessage::PairDenied { reason: "配对码已过期".to_string() };
                        let payload = serde_json::to_string(&denied).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                        let _ = write.send(Message::Text(payload.into())).await;
                        return Err(LanSyncError::Protocol("配对码已过期".to_string()));
                    }

                    let provided = remote_pair_code.unwrap_or_default();
                    if provided.trim() != expected.trim() {
                        let denied = LanSyncMessage::PairDenied { reason: "配对码错误".to_string() };
                        let payload = serde_json::to_string(&denied).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                        let _ = write.send(Message::Text(payload.into())).await;
                        return Err(LanSyncError::Protocol("配对码错误".to_string()));
                    }
                }
            }

            // 服务端：配对通过
            {
                let pair_secret = gen_pair_secret();
                let accepted = LanSyncMessage::PairAccepted {
                    pair_secret: Some(pair_secret.clone()),
                };
                let payload = serde_json::to_string(&accepted).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                write
                    .send(Message::Text(payload.into()))
                    .await
                    .map_err(|e| LanSyncError::Ws(e.to_string()))?;

                let event_tx = { self.inner.lock().await.event_tx.clone() };
                let _ = event_tx.send(CoreEvent::Paired {
                    device_id: remote_device_id.clone(),
                    pair_secret: pair_secret.clone(),
                });
                self.set_trusted_device_pair_secret(&remote_device_id, &pair_secret)
                    .await;
            }
        }

        let conn_id = self
            .register_connection(remote_device_id.clone(), abort_handle)
            .await;

        let (peer_out_tx, mut peer_out_rx) = tokio::sync::mpsc::unbounded_channel::<OutgoingFrame>();
        {
            let mut inner = self.inner.lock().await;
            inner.server_peer_out_txs.insert(remote_device_id.clone(), peer_out_tx);
        }

        let (ping_interval, idle_timeout, respond_to_ping) = {
            let inner = self.inner.lock().await;
            (
                inner.config.ping_interval,
                inner.config.idle_timeout,
                inner.config.respond_to_ping,
            )
        };

        {
            let mut inner = self.inner.lock().await;
            inner.snapshot.state = ConnectionState::Connected;
            inner.snapshot.next_retry_in_ms = None;
            inner.snapshot.reconnecting = false;
        }

        let mut last_rx = Instant::now();
        let mut ping = tokio::time::interval_at(Instant::now() + ping_interval, ping_interval);

        let event_tx = { self.inner.lock().await.event_tx.clone() };

        let res: Result<(), LanSyncError> = loop {
            tokio::select! {
                outgoing = peer_out_rx.recv() => {
                    if let Some(m) = outgoing {
                        match m {
                            OutgoingFrame::Json(m) => {
                                if let Ok(payload) = serde_json::to_string(&m) {
                                    if write.send(Message::Text(payload.into())).await.is_err() {
                                        break Err(LanSyncError::Ws("连接已断开".to_string()));
                                    }
                                }
                            }
                            OutgoingFrame::Binary(b) => {
                                if write.send(Message::Binary(Bytes::from(b))).await.is_err() {
                                    break Err(LanSyncError::Ws("连接已断开".to_string()));
                                }
                            }
                        }
                    }
                }
                _ = ping.tick() => {
                    if last_rx.elapsed() > idle_timeout {
                        break Err(LanSyncError::Timeout);
                    }

                    if write.send(Message::Ping(Bytes::new())).await.is_err() {
                        break Err(LanSyncError::Ws("连接已断开".to_string()));
                    }
                }
                incoming = read.next() => {
                    match incoming {
                        Some(Ok(msg)) => {
                            match msg {
                                Message::Close(_) => break Ok(()),
                                Message::Ping(v) => {
                                    last_rx = Instant::now();
                                    if respond_to_ping {
                                        if write.send(Message::Pong(v)).await.is_err() {
                                            break Err(LanSyncError::Ws("连接已断开".to_string()));
                                        }
                                    }
                                }
                                Message::Pong(_) => {
                                    last_rx = Instant::now();
                                }
                                Message::Text(t) => {
                                    last_rx = Instant::now();
                                    if let Ok(m) = serde_json::from_str::<LanSyncMessage>(&t) {
                                        match m {
                                            LanSyncMessage::ClipboardRecord { record } => {
                                                let _ = event_tx.send(CoreEvent::RemoteClipboardRecord { record: record.clone() });
                                                let _ = self
                                                    .broadcast_clipboard_record_excluding(record, Some(&remote_device_id))
                                                    .await;
                                            }
                                            LanSyncMessage::ClipboardItem(item) => {
                                                let record = clipboard_item_to_record(item);
                                                let _ = event_tx.send(CoreEvent::RemoteClipboardRecord { record: record.clone() });
                                                let _ = self
                                                    .broadcast_clipboard_record_excluding(record, Some(&remote_device_id))
                                                    .await;
                                            }
                                            LanSyncMessage::PairAccepted { .. }
                                            | LanSyncMessage::PairDenied { .. }
                                            | LanSyncMessage::Hello(_) => {}
                                            _ => {}
                                        }
                                    }
                                }
                                Message::Binary(b) => {
                                    last_rx = Instant::now();
                                    if let Some((requester_device_id, preferred_provider_device_id, image_id)) = decode_attachment_request_frame(&b) {
                                        let _ = event_tx.send(CoreEvent::AttachmentRequest {
                                            requester_device_id: requester_device_id.clone(),
                                            preferred_provider_device_id: preferred_provider_device_id.clone(),
                                            image_id: image_id.clone(),
                                        });

                                        if let Some(preferred) = preferred_provider_device_id.as_deref() {
                                            let inner = self.inner.lock().await;
                                            if let Some(tx) = inner.server_peer_out_txs.get(preferred) {
                                                let frame = encode_attachment_request_frame(
                                                    &requester_device_id,
                                                    Some(preferred),
                                                    &image_id,
                                                );
                                                let _ = tx.send(OutgoingFrame::Binary(frame));
                                                continue;
                                            }
                                        }

                                        let _ = self
                                            .broadcast_attachment_request_excluding(
                                                &requester_device_id,
                                                preferred_provider_device_id.as_deref(),
                                                &image_id,
                                                Some(&remote_device_id),
                                            )
                                            .await;
                                    } else if let Some((target_device_id, image_id, total_len, offset, data)) = decode_attachment_chunk_to_frame(&b) {
                                        if target_device_id == self.inner.lock().await.config.device_id {
                                            let _ = event_tx.send(CoreEvent::RemoteAttachmentChunk {
                                                image_id: image_id.clone(),
                                                total_len,
                                                offset,
                                                data: data.clone(),
                                            });
                                        }
                                        // 服务端收到定向分片：只转发给目标客户端
                                        let _ = self
                                            .broadcast_attachment_chunk_to(&target_device_id, &image_id, total_len, offset, &data)
                                            .await;
                                    } else if let Some((image_id, total_len, offset, data)) = decode_attachment_chunk_frame(&b) {
                                        let _ = event_tx.send(CoreEvent::RemoteAttachmentChunk { image_id: image_id.clone(), total_len, offset, data: data.clone() });
                                        let _ = self
                                            .broadcast_attachment_chunk_excluding(&image_id, total_len, offset, &data, Some(&remote_device_id))
                                            .await;
                                    } else if let Ok(t) = String::from_utf8(b.to_vec()) {
                                        if let Ok(m) = serde_json::from_str::<LanSyncMessage>(&t) {
                                            if let LanSyncMessage::ClipboardRecord { record } = m {
                                                let _ = event_tx
                                                    .send(CoreEvent::RemoteClipboardRecord { record: record.clone() });
                                                let _ = self
                                                    .broadcast_clipboard_record_excluding(record, Some(&remote_device_id))
                                                    .await;
                                            }
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                        Some(Err(_)) | None => break Ok(()),
                    }
                }
            }
        };

        let remote_id = remote_device_id.clone();
        self.unregister_connection(remote_device_id, conn_id).await;
        {
            let mut inner = self.inner.lock().await;
            inner.server_peer_out_txs.remove(&remote_id);
        }

        res
    }

    async fn connect_and_run(&self, peer_url: String) -> Result<(), LanSyncError> {
        let connect_timeout = {
            let inner = self.inner.lock().await;
            inner.config.connect_timeout
        };

        let (ws, _resp) = timeout(connect_timeout, connect_async(peer_url.as_str()))
            .await
            .map_err(|_| LanSyncError::Timeout)?
            .map_err(|e| LanSyncError::Ws(e.to_string()))?;

        let (mut write, mut read) = ws.split();

        let (device_id, version) = {
            let inner = self.inner.lock().await;
            (inner.config.device_id.clone(), inner.config.protocol_version)
        };

        let pair_code = { self.inner.lock().await.client_pair_code.clone() };
        let hello = LanSyncMessage::Hello(HelloMessage {
            device_id,
            version,
            pair_code,
        });
        let hello_text = serde_json::to_string(&hello).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
        write
            .send(Message::Text(hello_text.into()))
            .await
            .map_err(|e| LanSyncError::Ws(e.to_string()))?;

        let remote = timeout(Duration::from_secs(5), read.next())
            .await
            .map_err(|_| LanSyncError::Timeout)?;

        let Some(Ok(Message::Text(text))) = remote else {
            return Err(LanSyncError::Protocol("缺少 Hello 握手".to_string()));
        };
        let remote_hello: LanSyncMessage =
            serde_json::from_str(&text).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
        let server_device_id = match remote_hello {
            LanSyncMessage::Hello(h) => h.device_id,
            LanSyncMessage::ClipboardRecord { .. }
            | LanSyncMessage::ClipboardItem(_)
            | LanSyncMessage::AuthChallenge(_)
            | LanSyncMessage::AuthResponse(_)
            | LanSyncMessage::PairAccepted { .. }
            | LanSyncMessage::PairDenied { .. } => {
                return Err(LanSyncError::Protocol("握手阶段收到了非 Hello 消息".to_string()));
            }
        };

        // 客户端：等待鉴权挑战或配对结果
        let pair_res = timeout(Duration::from_secs(5), read.next())
            .await
            .map_err(|_| LanSyncError::Timeout)?;

        let Some(Ok(Message::Text(pair_text))) = pair_res else {
            return Err(LanSyncError::Protocol("缺少配对结果".to_string()));
        };

        let pair_msg: LanSyncMessage =
            serde_json::from_str(&pair_text).map_err(|e| LanSyncError::Protocol(e.to_string()))?;

        let pair_secret_opt = match pair_msg {
            LanSyncMessage::AuthChallenge(AuthChallenge { nonce, ts_ms }) => {
                let (self_device_id, maybe_secret) = {
                    let inner = self.inner.lock().await;
                    (
                        inner.config.device_id.clone(),
                        inner
                            .trusted_pair_secret_by_device_id
                            .get(&server_device_id)
                            .cloned(),
                    )
                };

                let Some(pair_secret) = maybe_secret else {
                    return Err(LanSyncError::Protocol("缺少配对密钥，请重新配对".to_string()));
                };

                let sig = compute_auth_sig(&pair_secret, &self_device_id, &nonce, ts_ms);
                let resp = LanSyncMessage::AuthResponse(AuthResponse { nonce, ts_ms, sig });
                let payload = serde_json::to_string(&resp).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                write
                    .send(Message::Text(payload.into()))
                    .await
                    .map_err(|e| LanSyncError::Ws(e.to_string()))?;

                let final_res = timeout(Duration::from_secs(5), read.next())
                    .await
                    .map_err(|_| LanSyncError::Timeout)?;
                let Some(Ok(Message::Text(final_text))) = final_res else {
                    return Err(LanSyncError::Protocol("缺少鉴权结果".to_string()));
                };
                let final_msg: LanSyncMessage =
                    serde_json::from_str(&final_text).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                match final_msg {
                    LanSyncMessage::PairAccepted { pair_secret } => pair_secret,
                    LanSyncMessage::PairDenied { reason } => {
                        return Err(LanSyncError::Protocol(format!("鉴权失败: {}", reason)));
                    }
                    _ => {
                        return Err(LanSyncError::Protocol("鉴权阶段收到了非结果消息".to_string()));
                    }
                }
            }
            LanSyncMessage::PairAccepted { pair_secret } => pair_secret,
            LanSyncMessage::PairDenied { reason } => {
                return Err(LanSyncError::Protocol(format!("配对失败: {}", reason)));
            }
            _ => {
                return Err(LanSyncError::Protocol("配对阶段收到了非配对结果消息".to_string()));
            }
        };

        if let Some(pair_secret) = pair_secret_opt.clone() {
            let event_tx = { self.inner.lock().await.event_tx.clone() };
            let _ = event_tx.send(CoreEvent::Paired {
                device_id: server_device_id.clone(),
                pair_secret: pair_secret.clone(),
            });
            self.set_trusted_device_pair_secret(&server_device_id, &pair_secret).await;
        }

        {
            let mut inner = self.inner.lock().await;
            inner.snapshot.state = ConnectionState::Connected;
            Self::refresh_server_snapshot_locked(&mut inner);
        }

        let (ping_interval, idle_timeout, respond_to_ping) = {
            let inner = self.inner.lock().await;
            (
                inner.config.ping_interval,
                inner.config.idle_timeout,
                inner.config.respond_to_ping,
            )
        };

        let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<OutgoingFrame>();
        {
            let mut inner = self.inner.lock().await;
            inner.client_out_tx = Some(out_tx);

            while let Some(m) = inner.client_send_queue.pop_front() {
                if let Some(tx) = inner.client_out_tx.clone() {
                    let _ = tx.send(m);
                }
            }
        }

        let mut last_rx = Instant::now();
        let mut ping = tokio::time::interval_at(Instant::now() + ping_interval, ping_interval);

        let event_tx = { self.inner.lock().await.event_tx.clone() };

        loop {
            tokio::select! {
                outgoing = out_rx.recv() => {
                    match outgoing {
                        Some(m) => {
                            match m {
                                OutgoingFrame::Json(m) => {
                                    if let Ok(payload) = serde_json::to_string(&m) {
                                        if write.send(Message::Text(payload.into())).await.is_err() {
                                            return Err(LanSyncError::Ws("连接已断开".to_string()));
                                        }
                                    }
                                }
                                OutgoingFrame::Binary(b) => {
                                    if write.send(Message::Binary(Bytes::from(b))).await.is_err() {
                                        return Err(LanSyncError::Ws("连接已断开".to_string()));
                                    }
                                }
                            }
                        }
                        None => {}
                    }
                }
                _ = ping.tick() => {
                    if last_rx.elapsed() > idle_timeout {
                        return Err(LanSyncError::Timeout);
                    }
                    if write.send(Message::Ping(Bytes::new())).await.is_err() {
                        return Err(LanSyncError::Ws("连接已断开".to_string()));
                    }
                }
                incoming = read.next() => {
                    match incoming {
                        Some(Ok(msg)) => {
                            match msg {
                                Message::Close(_) => break,
                                Message::Ping(v) => {
                                    last_rx = Instant::now();
                                    if respond_to_ping {
                                        if write.send(Message::Pong(v)).await.is_err() {
                                            return Err(LanSyncError::Ws("连接已断开".to_string()));
                                        }
                                    }
                                }
                                Message::Pong(_) => {
                                    last_rx = Instant::now();
                                }
                                Message::Text(t) => {
                                    last_rx = Instant::now();
                                    if let Ok(m) = serde_json::from_str::<LanSyncMessage>(&t) {
                                        match m {
                                            LanSyncMessage::ClipboardRecord { record } => {
                                                let _ = event_tx.send(CoreEvent::RemoteClipboardRecord { record });
                                            }
                                            LanSyncMessage::ClipboardItem(item) => {
                                                let record = clipboard_item_to_record(item);
                                                let _ = event_tx.send(CoreEvent::RemoteClipboardRecord { record });
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                                Message::Binary(b) => {
                                    last_rx = Instant::now();
                                    if let Some((requester_device_id, preferred_provider_device_id, image_id)) = decode_attachment_request_frame(&b) {
                                        let _ = event_tx.send(CoreEvent::AttachmentRequest { requester_device_id, preferred_provider_device_id, image_id });
                                    } else if let Some((target_device_id, image_id, total_len, offset, data)) = decode_attachment_chunk_to_frame(&b) {
                                        // 直连模式：如果不是发给自己，则忽略
                                        let my_id = { self.inner.lock().await.config.device_id.clone() };
                                        if target_device_id == my_id {
                                            let _ = event_tx.send(CoreEvent::RemoteAttachmentChunk { image_id, total_len, offset, data });
                                        }
                                    } else if let Some((image_id, total_len, offset, data)) = decode_attachment_chunk_frame(&b) {
                                        let _ = event_tx.send(CoreEvent::RemoteAttachmentChunk { image_id, total_len, offset, data });
                                    } else if let Ok(t) = String::from_utf8(b.to_vec()) {
                                        if let Ok(m) = serde_json::from_str::<LanSyncMessage>(&t) {
                                            match m {
                                                LanSyncMessage::ClipboardRecord { record } => {
                                                    let _ = event_tx.send(CoreEvent::RemoteClipboardRecord { record });
                                                }
                                                LanSyncMessage::ClipboardItem(item) => {
                                                    let record = clipboard_item_to_record(item);
                                                    let _ = event_tx.send(CoreEvent::RemoteClipboardRecord { record });
                                                }
                                                _ => {}
                                            }
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                        Some(Err(_)) | None => break,
                    }
                }
            }
        }

        {
            let mut inner = self.inner.lock().await;
            inner.client_out_tx = None;
        }

        Ok(())
    }

    async fn register_connection(&self, device_id: String, abort_handle: AbortHandle) -> u64 {
        let mut inner = self.inner.lock().await;
        let conn_id = inner.next_conn_id;
        inner.next_conn_id = inner.next_conn_id.saturating_add(1);

        if let Some((_old_id, old_handle)) = inner.active_by_device_id.insert(device_id, (conn_id, abort_handle)) {
            old_handle.abort();
        }

        Self::refresh_server_snapshot_locked(&mut inner);

        conn_id
    }

    async fn unregister_connection(&self, device_id: String, conn_id: u64) {
        let mut inner = self.inner.lock().await;
        if let Some((cur_id, _)) = inner.active_by_device_id.get(&device_id) {
            if *cur_id == conn_id {
                inner.active_by_device_id.remove(&device_id);
            }
        }

        Self::refresh_server_snapshot_locked(&mut inner);
    }

    fn refresh_server_snapshot_locked(inner: &mut Inner) {
        if inner.server_task.is_none() {
            inner.snapshot.server_connected_count = 0;
            inner.snapshot.server_connected_device_ids.clear();
            return;
        }

        inner.snapshot.server_connected_count = inner.active_by_device_id.len() as u32;
        inner.snapshot.server_connected_device_ids = inner.active_by_device_id.keys().cloned().collect();

        if inner.snapshot.server_connected_count == 0 {
            inner.snapshot.state = ConnectionState::Listening;
        } else {
            inner.snapshot.state = ConnectionState::Connected;
        }
    }
}

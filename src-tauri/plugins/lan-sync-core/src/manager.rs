use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use futures_util::future::{AbortHandle, Abortable};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration, Instant};
use tokio_tungstenite::{accept_async, connect_async, tungstenite::{Bytes, Message}};
use url::Url;

use crate::protocol::{ClipboardRecord, LanSyncMessage};
use crate::types::{ConnectionState, CoreEvent, LanSyncConfig, LanSyncError, Snapshot};

const CLIENT_SEND_QUEUE_MAX: usize = 200;
const ATTACH_MAGIC: &[u8; 5] = b"QCAT1";
const ATTACH_CHUNK_TYPE: u8 = 1;
const ATTACH_REQ_TYPE: u8 = 2;
const ATTACH_CHUNK_TO_TYPE: u8 = 3;

#[derive(Debug, Clone)]
enum OutgoingFrame {
    Json(LanSyncMessage),
    Binary(Vec<u8>),
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
    client_auto_reconnect: bool,
    client_manual_disconnect: bool,
}

#[derive(Clone)]
pub struct LanSyncManager {
    inner: Arc<tokio::sync::Mutex<Inner>>,
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
            client_auto_reconnect: false,
            client_manual_disconnect: false,
        };

        Self {
            inner: Arc::new(tokio::sync::Mutex::new(inner)),
        }
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

    pub async fn connect_peer(&self, peer_url: &str, auto_reconnect: bool) -> Result<(), LanSyncError> {
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

        let msg = OutgoingFrame::Json(LanSyncMessage::ClipboardRecord { record });
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

    pub async fn send_clipboard_record(&self, record: ClipboardRecord) -> Result<(), LanSyncError> {
        let mut inner = self.inner.lock().await;
        if !inner.snapshot.enabled {
            return Err(LanSyncError::NotEnabled);
        }

        let msg = OutgoingFrame::Json(LanSyncMessage::ClipboardRecord { record });
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

        let hello = LanSyncMessage::Hello { device_id, version };
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

        let remote_device_id = match remote_hello {
            LanSyncMessage::Hello { device_id, .. } => device_id,
            LanSyncMessage::ClipboardRecord { .. } => {
                return Err(LanSyncError::Protocol("握手阶段收到了非 Hello 消息".to_string()));
            }
        };

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
                                        if let LanSyncMessage::ClipboardRecord { record } = m {
                                            let _ = event_tx
                                                .send(CoreEvent::RemoteClipboardRecord { record: record.clone() });
                                            let _ = self
                                                .broadcast_clipboard_record_excluding(record, Some(&remote_device_id))
                                                .await;
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

        let hello = LanSyncMessage::Hello { device_id, version };
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
        match remote_hello {
            LanSyncMessage::Hello { .. } => {}
            LanSyncMessage::ClipboardRecord { .. } => {
                return Err(LanSyncError::Protocol("握手阶段收到了非 Hello 消息".to_string()));
            }
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
                                        if let LanSyncMessage::ClipboardRecord { record } = m {
                                            let _ = event_tx.send(CoreEvent::RemoteClipboardRecord { record });
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
                                            if let LanSyncMessage::ClipboardRecord { record } = m {
                                                let _ = event_tx.send(CoreEvent::RemoteClipboardRecord { record });
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

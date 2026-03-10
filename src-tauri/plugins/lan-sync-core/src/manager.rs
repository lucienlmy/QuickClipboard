use std::collections::HashMap;
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

struct Inner {
    config: LanSyncConfig,
    snapshot: Snapshot,
    server_task: Option<JoinHandle<()>>,
    client_task: Option<JoinHandle<()>>,
    event_tx: tokio::sync::broadcast::Sender<CoreEvent>,
    client_out_tx: Option<tokio::sync::mpsc::UnboundedSender<LanSyncMessage>>,
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
            active_by_device_id: HashMap::new(),
            next_conn_id: 1,
            client_auto_reconnect: false,
            client_manual_disconnect: false,
        };

        Self {
            inner: Arc::new(tokio::sync::Mutex::new(inner)),
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

    pub async fn disconnect_peer(&self) {
        let mut inner = self.inner.lock().await;
        inner.client_manual_disconnect = true;
        inner.snapshot.state = ConnectionState::Disconnected;
        inner.snapshot.reconnecting = false;
        inner.snapshot.reconnect_attempt = 0;
        inner.snapshot.next_retry_in_ms = None;
        inner.client_out_tx = None;
        if let Some(h) = inner.client_task.take() {
            h.abort();
        }
    }

    pub async fn send_clipboard_record(&self, record: ClipboardRecord) -> Result<(), LanSyncError> {
        let tx = { self.inner.lock().await.client_out_tx.clone() };
        let Some(tx) = tx else {
            return Err(LanSyncError::Ws("未连接".to_string()));
        };
        tx.send(LanSyncMessage::ClipboardRecord { record })
            .map_err(|_| LanSyncError::Ws("发送失败".to_string()))?;
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
                _ = ping.tick() => {
                    if last_rx.elapsed() > idle_timeout {
                        break Err(LanSyncError::Timeout);
                    }

                    let _ = write.send(Message::Ping(Bytes::new())).await;
                }
                incoming = read.next() => {
                    match incoming {
                        Some(Ok(msg)) => {
                            match msg {
                                Message::Close(_) => break Ok(()),
                                Message::Ping(v) => {
                                    last_rx = Instant::now();
                                    if respond_to_ping {
                                        let _ = write.send(Message::Pong(v)).await;
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
                                    if let Ok(t) = String::from_utf8(b.to_vec()) {
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
                        Some(Err(_)) | None => break Ok(()),
                    }
                }
            }
        };

        self.unregister_connection(remote_device_id, conn_id).await;

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

        let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<LanSyncMessage>();
        {
            let mut inner = self.inner.lock().await;
            inner.client_out_tx = Some(out_tx);
        }

        let mut last_rx = Instant::now();
        let mut ping = tokio::time::interval_at(Instant::now() + ping_interval, ping_interval);

        loop {
            tokio::select! {
                outgoing = out_rx.recv() => {
                    match outgoing {
                        Some(m) => {
                            if let Ok(payload) = serde_json::to_string(&m) {
                                let _ = write.send(Message::Text(payload.into())).await;
                            }
                        }
                        None => {}
                    }
                }
                _ = ping.tick() => {
                    if last_rx.elapsed() > idle_timeout {
                        return Err(LanSyncError::Timeout);
                    }
                    let _ = write.send(Message::Ping(Bytes::new())).await;
                }
                incoming = read.next() => {
                    match incoming {
                        Some(Ok(msg)) => {
                            match msg {
                                Message::Close(_) => break,
                                Message::Ping(v) => {
                                    last_rx = Instant::now();
                                    if respond_to_ping {
                                        let _ = write.send(Message::Pong(v)).await;
                                    }
                                }
                                Message::Pong(_) => {
                                    last_rx = Instant::now();
                                }
                                Message::Text(_) | Message::Binary(_) => {
                                    last_rx = Instant::now();
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

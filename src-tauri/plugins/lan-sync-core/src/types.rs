use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

use crate::protocol::{
    ChatTextMessage, ClipboardRecord,
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ConnectionState {
    Stopped,
    Listening,
    Connecting,
    Connected,
    Disconnected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub enabled: bool,
    pub state: ConnectionState,
    pub server_port: Option<u16>,
    pub file_http_port: Option<u16>,
    pub peer_url: Option<String>,
    pub connected_peer_device_id: Option<String>,
    pub server_connected_count: u32,
    pub server_connected_device_ids: Vec<String>,
    pub reconnecting: bool,
    pub reconnect_attempt: u32,
    pub next_retry_in_ms: Option<u64>,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self {
            enabled: false,
            state: ConnectionState::Stopped,
            server_port: None,
            file_http_port: None,
            peer_url: None,
            connected_peer_device_id: None,
            server_connected_count: 0,
            server_connected_device_ids: Vec::new(),
            reconnecting: false,
            reconnect_attempt: 0,
            next_retry_in_ms: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CoreEvent {
    Log { level: String, message: String },
    StatusChanged { snapshot: Snapshot },
    PeerDiscovered {
        device_id: String,
        device_name: Option<String>,
    },
    Paired {
        device_id: String,
        device_name: Option<String>,
        pair_secret: String,
    },
    RemoteClipboardRecord { record: ClipboardRecord },
    AttachmentRequest {
        requester_device_id: String,
        preferred_provider_device_id: Option<String>,
        image_id: String,
    },
    RemoteAttachmentChunk {
        image_id: String,
        total_len: u64,
        offset: u64,
        data: Vec<u8>,
    },
    ChatText { message: ChatTextMessage },
}

#[derive(Debug, Clone)]
pub struct LanSyncConfig {
    pub device_id: String,
    pub device_name: Option<String>,
    pub protocol_version: u32,
    pub file_http_port: Option<u16>,
    pub ping_interval: Duration,
    pub idle_timeout: Duration,
    pub respond_to_ping: bool,
    pub connect_timeout: Duration,
}

impl Default for LanSyncConfig {
    fn default() -> Self {
        Self {
            device_id: "desktop".to_string(),
            device_name: None,
            protocol_version: 1,
            file_http_port: None,
            ping_interval: Duration::from_secs(10),
            idle_timeout: Duration::from_secs(45),
            respond_to_ping: true,
            connect_timeout: Duration::from_secs(8),
        }
    }
}

#[derive(Debug, Error)]
pub enum LanSyncError {
    #[error("URL 无效")]
    InvalidUrl,
    #[error("WebSocket 错误: {0}")]
    Ws(String),
    #[error("协议错误: {0}")]
    Protocol(String),
    #[error("超时")]
    Timeout,
    #[error("未启用")]
    NotEnabled,
}

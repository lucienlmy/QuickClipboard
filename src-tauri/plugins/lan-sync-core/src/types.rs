use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

use crate::protocol::ClipboardRecord;

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
    pub peer_url: Option<String>,
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
            peer_url: None,
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
    RemoteClipboardRecord { record: ClipboardRecord },
}

#[derive(Debug, Clone)]
pub struct LanSyncConfig {
    pub device_id: String,
    pub protocol_version: u32,
    pub ping_interval: Duration,
    pub idle_timeout: Duration,
    pub respond_to_ping: bool,
    pub connect_timeout: Duration,
}

impl Default for LanSyncConfig {
    fn default() -> Self {
        Self {
            device_id: "desktop".to_string(),
            protocol_version: 1,
            ping_interval: Duration::from_secs(2),
            idle_timeout: Duration::from_secs(8),
            respond_to_ping: true,
            connect_timeout: Duration::from_secs(2),
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

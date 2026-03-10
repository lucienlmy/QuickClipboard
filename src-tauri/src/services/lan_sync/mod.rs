use lan_sync_core::{ClipboardRecord, LanSyncConfig, LanSyncError, LanSyncManager, Snapshot};
use once_cell::sync::Lazy;
use uuid::Uuid;

const DEVICE_ID_KEY: &str = "lan_sync_device_id";

static DEVICE_ID: Lazy<String> = Lazy::new(|| {
    if let Some(id) = crate::services::store::get::<String>(DEVICE_ID_KEY) {
        return id;
    }

    let id = Uuid::new_v4().to_string();
    let _ = crate::services::store::set(DEVICE_ID_KEY, &id);
    id
});

static MANAGER: Lazy<LanSyncManager> = Lazy::new(|| {
    LanSyncManager::new(LanSyncConfig {
        device_id: DEVICE_ID.clone(),
        ..Default::default()
    })
});

pub fn device_id() -> String {
    DEVICE_ID.clone()
}

pub async fn get_snapshot() -> Snapshot {
    MANAGER.get_snapshot().await
}

pub async fn set_enabled(enabled: bool) -> Snapshot {
    MANAGER.set_enabled(enabled).await;
    MANAGER.get_snapshot().await
}

pub async fn start_server(port: u16) -> Result<u16, LanSyncError> {
    MANAGER.start_server(port).await
}

pub async fn connect_peer(peer_url: &str, auto_reconnect: bool) -> Result<(), LanSyncError> {
    MANAGER.connect_peer(peer_url, auto_reconnect).await
}

pub async fn disconnect_peer() {
    MANAGER.disconnect_peer().await;
}

pub async fn send_clipboard_record(record: ClipboardRecord) -> Result<(), LanSyncError> {
    MANAGER.send_clipboard_record(record).await
}

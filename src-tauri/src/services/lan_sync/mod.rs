use lan_sync_core::{LanSyncConfig, LanSyncError, LanSyncManager, Snapshot};
use once_cell::sync::Lazy;

static MANAGER: Lazy<LanSyncManager> = Lazy::new(|| LanSyncManager::new(LanSyncConfig::default()));

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

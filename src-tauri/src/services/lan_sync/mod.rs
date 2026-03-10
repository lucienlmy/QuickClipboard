use lan_sync_core::{ClipboardRecord, CoreEvent, LanSyncConfig, LanSyncError, LanSyncManager, Snapshot};
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

pub async fn sync_clipboard_item(clipboard_id: i64) -> Result<String, LanSyncError> {
    let item = crate::services::database::get_clipboard_item_by_id(clipboard_id)
        .map_err(|e| LanSyncError::Protocol(e))?
        .ok_or_else(|| LanSyncError::Protocol("记录不存在".to_string()))?;

    if item.is_remote {
        return Err(LanSyncError::Protocol("远端记录无需手动同步".to_string()));
    }

    let uuid = match item.uuid.clone().filter(|u| !u.trim().is_empty()) {
        Some(u) => u,
        None => crate::services::database::ensure_clipboard_item_uuid(clipboard_id)
            .map_err(|e| LanSyncError::Protocol(e))?,
    };

    let record = ClipboardRecord {
        uuid,
        source_device_id: device_id(),
        is_remote: false,
        content: item.content,
        html_content: item.html_content,
        content_type: item.content_type,
        image_id: item.image_id,
        source_app: item.source_app,
        source_icon_hash: item.source_icon_hash,
        char_count: item.char_count,
        created_at: item.created_at,
        updated_at: item.updated_at,
    };

    let snapshot = MANAGER.get_snapshot().await;

    if snapshot.server_port.is_some() && snapshot.server_connected_count > 0 {
        MANAGER.broadcast_clipboard_record(record).await?;
        return Ok("broadcast".to_string());
    }

    send_clipboard_record(record).await?;

    if snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some() {
        Ok("sent".to_string())
    } else {
        Ok("queued".to_string())
    }
}

pub async fn subscribe() -> tokio::sync::broadcast::Receiver<CoreEvent> {
    MANAGER.subscribe().await
}

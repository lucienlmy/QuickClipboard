use lan_sync_core::{ClipboardRecord, CoreEvent, LanSyncConfig, LanSyncError, LanSyncManager, Snapshot};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const DEVICE_ID_KEY: &str = "lan_sync_device_id";
const TRUSTED_DEVICES_KEY: &str = "lan_sync_trusted_devices";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedDevice {
    pub device_id: String,
    pub pair_secret: String,
    pub first_paired_at_ms: u64,
    pub last_seen_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedDeviceInfo {
    pub device_id: String,
    pub first_paired_at_ms: u64,
    pub last_seen_ms: u64,
    pub connected: bool,
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

fn load_trusted_devices() -> Vec<TrustedDevice> {
    crate::services::store::get::<Vec<TrustedDevice>>(TRUSTED_DEVICES_KEY).unwrap_or_default()
}

fn save_trusted_devices(list: &[TrustedDevice]) {
    let _ = crate::services::store::set(TRUSTED_DEVICES_KEY, &list.to_vec());
}

async fn hydrate_trusted_devices_to_core() {
    let list = load_trusted_devices();
    let devices = list
        .into_iter()
        .map(|d| (d.device_id, d.pair_secret))
        .collect::<Vec<_>>();
    MANAGER.set_trusted_devices_pair_secrets(devices).await;
}

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
    hydrate_trusted_devices_to_core().await;
    let bound = MANAGER.start_server(port).await?;
    let code = format!("{:010}", fastrand::u32(0..1_000_000_000));
    MANAGER.set_server_pair_code(Some(code)).await;
    Ok(bound)
}

pub async fn connect_peer(
    peer_url: &str,
    auto_reconnect: bool,
    pair_code: Option<String>,
) -> Result<(), LanSyncError> {
    hydrate_trusted_devices_to_core().await;
    MANAGER.connect_peer(peer_url, auto_reconnect, pair_code).await
}

pub async fn disconnect_peer() {
    MANAGER.disconnect_peer().await;
}

pub async fn get_server_pair_code() -> Option<(String, u64)> {
    MANAGER.get_server_pair_code().await
}

pub async fn refresh_server_pair_code() -> Option<(String, u64)> {
    let code = format!("{:010}", fastrand::u32(0..1_000_000_000));
    MANAGER.set_server_pair_code(Some(code)).await;
    MANAGER.get_server_pair_code().await
}

pub fn on_paired(device_id: String, pair_secret: String) {
    let now = current_time_ms();
    let mut list = load_trusted_devices();
    if let Some(d) = list.iter_mut().find(|x| x.device_id == device_id) {
        d.pair_secret = pair_secret;
        d.last_seen_ms = now;
    } else {
        list.push(TrustedDevice {
            device_id,
            pair_secret,
            first_paired_at_ms: now,
            last_seen_ms: now,
        });
    }
    save_trusted_devices(&list);

    let list2 = list;
    tauri::async_runtime::spawn(async move {
        let devices = list2
            .into_iter()
            .map(|d| (d.device_id, d.pair_secret))
            .collect::<Vec<_>>();
        MANAGER.set_trusted_devices_pair_secrets(devices).await;
    });
}

pub async fn list_trusted_devices() -> Vec<TrustedDeviceInfo> {
    let list = load_trusted_devices();
    let snapshot = MANAGER.get_snapshot().await;
    let connected_ids = snapshot.server_connected_device_ids;
    list.into_iter()
        .map(|d| TrustedDeviceInfo {
            connected: connected_ids.iter().any(|x| x == &d.device_id),
            device_id: d.device_id,
            first_paired_at_ms: d.first_paired_at_ms,
            last_seen_ms: d.last_seen_ms,
        })
        .collect()
}

pub async fn disconnect_device(device_id: &str) -> bool {
    MANAGER.disconnect_device(device_id).await
}

pub async fn ban_device_for_current_pair_code(device_id: &str) -> bool {
    MANAGER.ban_device_for_current_pair_code(device_id).await
}

pub async fn remove_trusted_device(device_id: &str) -> bool {
    let _ = disconnect_device(device_id).await;
    let mut list = load_trusted_devices();
    let before = list.len();
    list.retain(|x| x.device_id != device_id);
    if list.len() != before {
        save_trusted_devices(&list);

        MANAGER.remove_trusted_device_pair_secret(device_id).await;

        let _ = ban_device_for_current_pair_code(device_id).await;
        true
    } else {
        false
    }
}

fn is_image_content_type(content_type: &str) -> bool {
    content_type == "image"
}

fn split_image_ids(s: &str) -> impl Iterator<Item = &str> {
    s.split(',').map(|x| x.trim()).filter(|x| !x.is_empty())
}

fn local_image_file_exists(image_id: &str) -> bool {
    if let Ok(data_dir) = crate::services::get_data_directory() {
        let p = data_dir
            .join("clipboard_images")
            .join(format!("{}.png", image_id));
        return p.exists();
    }
    false
}

fn should_sync_record(record: &ClipboardRecord) -> bool {
    if record.content_type == "file" {
        return false;
    }

    if is_image_content_type(&record.content_type) {
        let Some(image_ids) = record.image_id.as_ref().filter(|s| !s.trim().is_empty()) else {
            return false;
        };

        // 规则 1：image 类型但 image_id 为空，不同步
        // 规则 2：image_id 存在但源文件缺失，不同步
        for iid in split_image_ids(image_ids) {
            if !local_image_file_exists(iid) {
                return false;
            }
        }
    }

    true
}

pub async fn request_attachment(
    preferred_provider_device_id: Option<&str>,
    image_id: &str,
) -> Result<(), LanSyncError> {
    let snapshot = MANAGER.get_snapshot().await;
    if snapshot.server_port.is_some() && snapshot.server_connected_count > 0 {
        MANAGER
            .broadcast_attachment_request_excluding(
                &device_id(),
                preferred_provider_device_id,
                image_id,
                None,
            )
            .await
    } else {
        MANAGER
            .send_attachment_request(preferred_provider_device_id, image_id)
            .await
    }
}

pub async fn handle_attachment_request(requester_device_id: &str, image_id: &str) -> Result<(), LanSyncError> {
    if !local_image_file_exists(image_id) {
        return Ok(());
    }

    let snapshot = MANAGER.get_snapshot().await;
    let is_server_connected = snapshot.server_port.is_some() && snapshot.server_connected_count > 0;
    let is_client_connected = snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some();
    if !(is_server_connected || is_client_connected) {
        return Ok(());
    }

    let data_dir = crate::services::get_data_directory().map_err(|e| LanSyncError::Protocol(e))?;
    let images_dir = data_dir.join("clipboard_images");
    let path = images_dir.join(format!("{}.png", image_id));
    let Ok(bytes) = std::fs::read(&path) else {
        return Ok(());
    };

    let chunk_size: usize = 256 * 1024;
    let total_len = bytes.len() as u64;
    let mut offset: u64 = 0;
    while (offset as usize) < bytes.len() {
        let end = std::cmp::min(bytes.len(), offset as usize + chunk_size);
        let part = &bytes[offset as usize..end];

        if is_server_connected {
            MANAGER
                .broadcast_attachment_chunk_to(requester_device_id, image_id, total_len, offset, part)
                .await?;
        } else {
            MANAGER
                .send_attachment_chunk_to(requester_device_id, image_id, total_len, offset, part)
                .await?;
        }

        offset = end as u64;
    }

    Ok(())
}

pub async fn send_clipboard_record(record: ClipboardRecord) -> Result<(), LanSyncError> {
    if !should_sync_record(&record) {
        return Ok(());
    }

    let snapshot = MANAGER.get_snapshot().await;

    let is_server_connected = snapshot.server_port.is_some() && snapshot.server_connected_count > 0;
    let is_client_connected = snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some();

    if is_server_connected {
        MANAGER.broadcast_clipboard_record(record.clone()).await?;
    } else {
        MANAGER.send_clipboard_record(record.clone()).await?;
    }

    if !(is_server_connected || is_client_connected) {
        return Ok(());
    }

    let Some(image_ids) = record.image_id.clone().filter(|s| !s.trim().is_empty()) else {
        return Ok(());
    };

    let data_dir = crate::services::get_data_directory().map_err(|e| LanSyncError::Protocol(e))?;
    let images_dir = data_dir.join("clipboard_images");

    let chunk_size: usize = 256 * 1024;

    for image_id in split_image_ids(&image_ids) {
        let path = images_dir.join(format!("{}.png", image_id));
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };

        let total_len = bytes.len() as u64;
        let mut offset: u64 = 0;
        while (offset as usize) < bytes.len() {
            let end = std::cmp::min(bytes.len(), offset as usize + chunk_size);
            let part = &bytes[offset as usize..end];

            if is_server_connected {
                MANAGER
                    .broadcast_attachment_chunk(image_id, total_len, offset, part)
                    .await?;
            } else {
                MANAGER
                    .send_attachment_chunk(image_id, total_len, offset, part)
                    .await?;
            }

            offset = end as u64;
        }
    }

    Ok(())
}

pub async fn sync_clipboard_item(clipboard_id: i64) -> Result<String, LanSyncError> {
    let item = crate::services::database::get_clipboard_item_by_id(clipboard_id)
        .map_err(|e| LanSyncError::Protocol(e))?
        .ok_or_else(|| LanSyncError::Protocol("记录不存在".to_string()))?;

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

pub async fn sync_favorite_item(favorite_id: String) -> Result<String, LanSyncError> {
    let item = crate::services::database::get_favorite_by_id(&favorite_id)
        .map_err(|e| LanSyncError::Protocol(e))?
        .ok_or_else(|| LanSyncError::Protocol("收藏项不存在".to_string()))?;

    let record = ClipboardRecord {
        uuid: format!("fav:{}", item.id),
        source_device_id: device_id(),
        is_remote: false,
        content: item.content,
        html_content: item.html_content,
        content_type: item.content_type,
        image_id: item.image_id,
        source_app: None,
        source_icon_hash: None,
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

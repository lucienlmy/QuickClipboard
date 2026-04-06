use super::state::{
    device_id, load_raw_formats_for_clipboard_item, load_raw_formats_for_favorite_item, local_image_file_exists,
    should_sync_record, split_image_ids, MANAGER,
};
use lan_sync_core::{ClipboardRecord, LanSyncError};

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

pub async fn handle_attachment_request(
    requester_device_id: &str,
    image_id: &str,
) -> Result<(), LanSyncError> {
    if !local_image_file_exists(image_id) {
        return Ok(());
    }

    let snapshot = MANAGER.get_snapshot().await;
    let is_server_connected = snapshot.server_port.is_some() && snapshot.server_connected_count > 0;
    let is_client_connected =
        snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some();
    if !(is_server_connected || is_client_connected) {
        return Ok(());
    }

    let data_dir = crate::services::get_data_directory().map_err(LanSyncError::Protocol)?;
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
    let is_client_connected =
        snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some();

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

    let data_dir = crate::services::get_data_directory().map_err(LanSyncError::Protocol)?;
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
        .map_err(LanSyncError::Protocol)?
        .ok_or_else(|| LanSyncError::Protocol("记录不存在".to_string()))?;

    let uuid = match item.uuid.clone().filter(|u| !u.trim().is_empty()) {
        Some(u) => u,
        None => crate::services::database::ensure_clipboard_item_uuid(clipboard_id)
            .map_err(LanSyncError::Protocol)?,
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
        raw_formats: load_raw_formats_for_clipboard_item(clipboard_id),
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
        .map_err(LanSyncError::Protocol)?
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
        raw_formats: load_raw_formats_for_favorite_item(&favorite_id),
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

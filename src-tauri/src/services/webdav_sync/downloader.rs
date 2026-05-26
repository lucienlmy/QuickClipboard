use std::collections::HashSet;

use super::chunk_manager::load_chunk;
use super::index_manager::load_index;
use super::types::{CloudRecord, SyncCollection, SyncReport};
use super::webdav_client::WebdavClient;

pub async fn download_all(
    client: &WebdavClient,
    device_id: &str,
    include_own_device: bool,
) -> Result<SyncReport, String> {
    let mut report = SyncReport::default();
    let settings = crate::services::get_settings();

    if settings.webdav_sync_clipboard {
        match download_collection(client, SyncCollection::History, device_id, include_own_device).await {
            Ok(records) => {
                let count = records.len() as u32;
                if count > 0 {
                    crate::services::database::webdav_upsert_history_records(&records)?;
                }
                download_images(client, &records).await?;
                report.pulled += count;
                report.pulled_clipboard = count;
            }
            Err(e) => report.errors.push(format!("剪贴板历史拉取失败: {}", e)),
        }
    }

    if settings.webdav_sync_favorites {
        match download_collection(client, SyncCollection::Favorites, device_id, include_own_device).await {
            Ok(records) => {
                let count = records.len() as u32;
                if count > 0 {
                    crate::services::database::webdav_upsert_favorite_records(&records)?;
                }
                download_images(client, &records).await?;
                report.pulled += count;
                report.pulled_favorites = count;
            }
            Err(e) => report.errors.push(format!("收藏拉取失败: {}", e)),
        }

        match super::groups_sync::download_groups(client, device_id, include_own_device).await {
            Ok(count) => {
                report.pulled += count;
                report.pulled_groups = count;
            }
            Err(e) => report.errors.push(format!("分组拉取失败: {}", e)),
        }
    }

    Ok(report)
}

async fn download_collection(
    client: &WebdavClient,
    collection: SyncCollection,
    device_id: &str,
    include_own_device: bool,
) -> Result<Vec<CloudRecord>, String> {
    let index = load_index(client, collection).await?;
    if index.entries.is_empty() {
        return Ok(Vec::new());
    }

    let mut chunk_ids = index
        .entries
        .values()
        .filter(|entry| include_own_device || entry.source_device_id != device_id)
        .map(|entry| entry.chunk)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    chunk_ids.sort_unstable();

    let mut out = Vec::new();
    for chunk_id in chunk_ids {
        let chunk = load_chunk(client, collection, chunk_id).await?;
        for record in chunk.records.into_values() {
            if !include_own_device && record.source_device_id == device_id {
                continue;
            }
            out.push(record);
        }
    }

    Ok(out)
}

async fn download_images(client: &WebdavClient, records: &[CloudRecord]) -> Result<(), String> {
    let mut image_ids = HashSet::new();
    for record in records {
        collect_image_ids(&mut image_ids, record.image_id.as_deref());
    }
    if image_ids.is_empty() {
        return Ok(());
    }

    let data_dir = crate::services::get_data_directory()?;
    let images_dir = data_dir.join("clipboard_images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    for image_id in image_ids {
        let path = images_dir.join(format!("{}.png", image_id));
        if path.exists() {
            continue;
        }
        let Some(bytes) = client.get_bytes(&format!("files/{}.png", image_id)).await? else {
            continue;
        };
        std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn collect_image_ids(out: &mut HashSet<String>, raw: Option<&str>) {
    let Some(raw) = raw else { return; };
    for item in raw.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        out.insert(item.to_string());
    }
}

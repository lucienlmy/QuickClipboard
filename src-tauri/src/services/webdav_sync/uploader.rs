use std::collections::HashSet;

use super::chunk_manager::{build_chunks, save_chunk};
use super::index_manager::save_index;
use super::types::{CloudRecord, SyncCollection, SyncIndex, SyncIndexEntry, SyncReport};
use super::webdav_client::WebdavClient;

pub async fn upload_all(client: &WebdavClient, device_id: &str) -> Result<SyncReport, String> {
    let mut report = SyncReport::default();
    let settings = crate::services::get_settings();

    if settings.webdav_sync_clipboard {
        let history_records = crate::services::database::webdav_list_history_records(device_id)?;
        let items = history_records
            .iter()
            .map(|record| record.report_item("clipboard"))
            .collect::<Vec<_>>();
        match upload_collection(client, SyncCollection::History, history_records).await {
            Ok(count) => {
                report.pushed += count;
                report.pushed_clipboard = count;
                report.pushed_items.extend(items);
            }
            Err(e) => report.errors.push(format!("剪贴板历史推送失败: {}", e)),
        }
    }

    if settings.webdav_sync_favorites {
        let favorite_records = crate::services::database::webdav_list_favorite_records(device_id)?;
        let items = favorite_records
            .iter()
            .map(|record| record.report_item("favorites"))
            .collect::<Vec<_>>();
        match upload_collection(client, SyncCollection::Favorites, favorite_records).await {
            Ok(count) => {
                report.pushed += count;
                report.pushed_favorites = count;
                report.pushed_items.extend(items);
            }
            Err(e) => report.errors.push(format!("收藏推送失败: {}", e)),
        }

        match super::groups_sync::upload_groups(client, device_id).await {
            Ok(groups) => {
                let count = groups.len() as u32;
                report.pushed += count;
                report.pushed_groups = count;
                report.pushed_items.extend(groups.into_iter().map(|group| {
                    super::types::SyncReportItem {
                        category: "groups".to_string(),
                        id: group.name.clone(),
                        summary: group.name,
                        source_device_id: group.source_device_id,
                        updated_at: group.updated_at,
                    }
                }));
            }
            Err(e) => report.errors.push(format!("分组推送失败: {}", e)),
        }
    }

    upload_images(client).await.map_err(|e| format!("上传图片失败: {}", e))?;

    Ok(report)
}

async fn upload_collection(
    client: &WebdavClient,
    collection: SyncCollection,
    records: Vec<CloudRecord>,
) -> Result<u32, String> {
    let chunks = build_chunks(records);
    let mut index = SyncIndex::default();
    index.next_chunk = chunks.len() as u32;

    for (chunk_id, chunk) in chunks.iter().enumerate() {
        let chunk_id = chunk_id as u32;
        for record in chunk.records.values() {
            index.entries.insert(
                record.uuid.clone(),
                SyncIndexEntry {
                    chunk: chunk_id,
                    updated_at: record.updated_at,
                    source_device_id: record.source_device_id.clone(),
                },
            );
        }
        save_chunk(client, collection, chunk_id, chunk).await?;
    }

    let count = index.entries.len() as u32;
    save_index(client, collection, &index).await?;
    Ok(count)
}

async fn upload_images(client: &WebdavClient) -> Result<(), String> {
    let mut image_ids = HashSet::new();
    for record in crate::services::database::webdav_list_history_records("")? {
        collect_image_ids(&mut image_ids, record.image_id.as_deref());
    }
    for record in crate::services::database::webdav_list_favorite_records("")? {
        collect_image_ids(&mut image_ids, record.image_id.as_deref());
    }

    if image_ids.is_empty() {
        return Ok(());
    }

    let data_dir = crate::services::get_data_directory()?;
    let images_dir = data_dir.join("clipboard_images");
    for image_id in image_ids {
        let path = images_dir.join(format!("{}.png", image_id));
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        client.put_bytes(&format!("files/{}.png", image_id), bytes).await?;
    }

    Ok(())
}

fn collect_image_ids(out: &mut HashSet<String>, raw: Option<&str>) {
    let Some(raw) = raw else { return; };
    for item in raw.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        out.insert(item.to_string());
    }
}

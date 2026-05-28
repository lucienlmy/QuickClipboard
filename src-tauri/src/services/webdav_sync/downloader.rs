use std::collections::{HashMap, HashSet};

use super::chunk_manager::load_chunk;
use super::index_manager::load_index;
use super::types::{CloudRecord, SyncCollection, SyncIndexEntry, SyncReport};
use super::webdav_client::WebdavClient;

pub async fn download_all(
    client: &WebdavClient,
    device_id: &str,
    include_own_device: bool,
) -> Result<SyncReport, String> {
    let mut report = SyncReport::default();
    let settings = crate::services::get_settings();

    if settings.webdav_sync_clipboard {
        let local_states = crate::services::database::webdav_history_record_states()?;
        match download_collection(
            client,
            SyncCollection::History,
            device_id,
            include_own_device,
            &local_states,
        )
        .await
        {
            Ok(records) => {
                let changed = if records.is_empty() {
                    Vec::new()
                } else {
                    crate::services::database::webdav_upsert_history_records(&records)?
                };
                download_images(client, &changed).await?;
                let count = changed.len() as u32;
                report.pulled += count;
                report.pulled_clipboard = count;
                report
                    .pulled_items
                    .extend(changed.iter().map(|record| record.report_item("clipboard")));
            }
            Err(e) => report.errors.push(format!("剪贴板历史拉取失败: {}", e)),
        }
    }

    if settings.webdav_sync_favorites {
        let local_states = crate::services::database::webdav_favorite_record_states()?;
        match download_collection(
            client,
            SyncCollection::Favorites,
            device_id,
            include_own_device,
            &local_states,
        )
        .await
        {
            Ok(records) => {
                let changed = if records.is_empty() {
                    Vec::new()
                } else {
                    crate::services::database::webdav_upsert_favorite_records(&records)?
                };
                download_images(client, &changed).await?;
                let count = changed.len() as u32;
                report.pulled += count;
                report.pulled_favorites = count;
                report
                    .pulled_items
                    .extend(changed.iter().map(|record| record.report_item("favorites")));
            }
            Err(e) => report.errors.push(format!("收藏拉取失败: {}", e)),
        }

        match super::groups_sync::download_groups(client, device_id, include_own_device).await {
            Ok(groups) => {
                let count = groups.len() as u32;
                report.pulled += count;
                report.pulled_groups = count;
                report.pulled_items.extend(groups.into_iter().map(|group| {
                    super::types::SyncReportItem {
                        category: "groups".to_string(),
                        id: group.name.clone(),
                        summary: group.name,
                        source_device_id: group.source_device_id,
                        updated_at: group.updated_at,
                    }
                }));
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
    local_states: &HashMap<String, i64>,
) -> Result<Vec<CloudRecord>, String> {
    let index = load_index(client, collection).await?;
    if index.entries.is_empty() {
        return Ok(Vec::new());
    }

    let mut selected_entries = HashMap::<String, SyncIndexEntry>::new();
    for (uuid, entry) in index.entries {
        if !include_own_device && entry.source_device_id == device_id {
            continue;
        }

        if !include_own_device {
            if let Some(local_updated_at) = local_states.get(&uuid) {
                if *local_updated_at >= entry.updated_at {
                    continue;
                }
            }
        }

        selected_entries.insert(uuid, entry);
    }

    if selected_entries.is_empty() {
        return Ok(Vec::new());
    }

    let mut chunk_ids = selected_entries
        .values()
        .map(|entry| entry.chunk)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    chunk_ids.sort_unstable();

    let mut out = Vec::new();
    for chunk_id in chunk_ids {
        let chunk = load_chunk(client, collection, chunk_id).await?;
        for (uuid, record) in chunk.records {
            let Some(entry) = selected_entries.get(&uuid) else {
                continue;
            };
            if entry.chunk != chunk_id {
                continue;
            }
            if record.updated_at < entry.updated_at {
                continue;
            }
            out.push(record);
        }
    }

    out.sort_by(|a, b| {
        b.item_order
            .cmp(&a.item_order)
            .then_with(|| b.updated_at.cmp(&a.updated_at))
            .then_with(|| a.uuid.cmp(&b.uuid))
    });
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

    client.ensure_files_dir().await?;

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

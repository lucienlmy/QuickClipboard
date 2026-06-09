use crate::services::webdav_sync::types::{SyncReport, SyncReportItem};

pub async fn push_to_peer(device_id: &str) -> Result<SyncReport, String> {
    let peer = super::peer_store::list_peers()
        .into_iter()
        .find(|peer| peer.device_id == device_id)
        .ok_or_else(|| "未找到已配对设备".to_string())?;

    let local_device_id = super::runtime::device_id();
    let mut report = SyncReport::default();
    let remote_snapshot = super::http_client::fetch_peer_snapshot(&peer).await?;
    let mut image_task_started = false;

    let tombstones = crate::services::database::tombstones_newer_than_remote(
        crate::services::database::list_sync_tombstones_since(None)?,
        &remote_snapshot.tombstone_states,
    );
    if !tombstones.is_empty() {
        let _ = super::http_client::push_peer_tombstones(
            &peer,
            super::LanTombstoneBatch {
                tombstones,
            },
        )
        .await?;
    }

    let local_history_records = crate::services::database::webdav_list_history_records(&local_device_id)?;
    let local_history_records = crate::services::database::filter_records_not_deleted(
        crate::services::database::COLLECTION_HISTORY,
        &local_history_records,
    )?;
    let history_records = crate::services::database::filter_records_not_deleted_by_states(
        crate::services::database::COLLECTION_HISTORY,
        local_history_records,
        &remote_snapshot.tombstone_states,
    );
    let history_repair_records = history_records.clone();
    let history_records_to_push = crate::services::sync_transfer::sync_plan::records_newer_than_remote(
        history_records,
        &remote_snapshot.history_states,
    );
    if !history_records_to_push.is_empty() {
        let history_image_records = history_records_to_push.clone();
        let changed_history = match super::http_client::push_peer_history_records(
            &peer,
            super::LanRecordBatch {
                collection: "history".to_string(),
                records: history_records_to_push,
            },
        )
        .await {
            Ok(value) => value,
            Err(e) => {
                spawn_push_images(peer.clone(), "history", history_image_records);
                return Err(e);
            }
        };
        report.pushed_clipboard = changed_history.records.len() as u32;
        report.pushed += report.pushed_clipboard;
        report
            .pushed_items
            .extend(changed_history.records.iter().map(|record| record.report_item("clipboard")));
        spawn_push_images(peer.clone(), "history", history_image_records);
        image_task_started = true;
    }

    let local_favorite_records = crate::services::database::webdav_list_favorite_records(&local_device_id)?;
    let local_favorite_records = crate::services::database::filter_records_not_deleted(
        crate::services::database::COLLECTION_FAVORITES,
        &local_favorite_records,
    )?;
    let favorite_records = crate::services::database::filter_records_not_deleted_by_states(
        crate::services::database::COLLECTION_FAVORITES,
        local_favorite_records,
        &remote_snapshot.tombstone_states,
    );
    let favorite_repair_records = favorite_records.clone();
    let favorite_records_to_push = crate::services::sync_transfer::sync_plan::records_newer_than_remote(
        favorite_records,
        &remote_snapshot.favorite_states,
    );
    if !favorite_records_to_push.is_empty() {
        let favorite_image_records = favorite_records_to_push.clone();
        let changed_favorites = match super::http_client::push_peer_favorite_records(
            &peer,
            super::LanRecordBatch {
                collection: "favorites".to_string(),
                records: favorite_records_to_push,
            },
        )
        .await {
            Ok(value) => value,
            Err(e) => {
                spawn_push_images(peer.clone(), "favorites", favorite_image_records);
                return Err(e);
            }
        };
        report.pushed_favorites = changed_favorites.records.len() as u32;
        report.pushed += report.pushed_favorites;
        report
            .pushed_items
            .extend(changed_favorites.records.iter().map(|record| record.report_item("favorites")));
        spawn_push_images(peer.clone(), "favorites", favorite_image_records);
        image_task_started = true;
    }

    let local_groups = crate::services::database::webdav_list_groups(&local_device_id)?;
    let local_groups = crate::services::database::filter_groups_not_deleted(&local_groups)?;
    let groups = crate::services::database::filter_groups_not_deleted_by_states(
        local_groups,
        &remote_snapshot.tombstone_states,
    );
    let groups = crate::services::sync_transfer::sync_plan::groups_newer_than_remote(
        groups,
        &remote_snapshot.groups,
    );
    if !groups.is_empty() {
        let changed_groups = super::http_client::push_peer_groups(
            &peer,
            super::LanGroupBatch {
                groups,
            },
        )
        .await?;
        report.pushed_groups = changed_groups.groups.len() as u32;
        report.pushed += report.pushed_groups;
        report.pushed_items.extend(changed_groups.groups.into_iter().map(|group| {
            SyncReportItem {
                category: "groups".to_string(),
                id: group.name.clone(),
                summary: group.name,
                source_device_id: group.source_device_id,
                updated_at: group.updated_at,
            }
        }));
    }

    if !image_task_started && report.pushed == 0 {
        spawn_push_images(peer.clone(), "history", history_repair_records);
        spawn_push_images(peer.clone(), "favorites", favorite_repair_records);
    }

    Ok(report)
}

fn spawn_push_images(
    peer: super::peer_store::PairedPeer,
    collection: &'static str,
    records: Vec<crate::services::webdav_sync::types::CloudRecord>,
) {
    if records.is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        push_images_best_effort(&peer, collection, &records).await;
    });
}

async fn push_images_best_effort(
    peer: &super::peer_store::PairedPeer,
    collection: &str,
    records: &[crate::services::webdav_sync::types::CloudRecord],
) {
    let image_ids = super::files::collect_record_image_ids(records);
    if image_ids.is_empty() {
        return;
    }
    eprintln!(
        "[局域网同步] 开始后台推送图片 collection={} peer={} count={}",
        collection,
        peer.device_name,
        image_ids.len()
    );
    let mut sent = 0usize;
    let mut failed = 0usize;
    let mut missing = 0usize;
    for image_id in image_ids {
        let Some(bytes) = (match super::files::read_image_file(&image_id) {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("[局域网同步] 读取待推送图片失败 image_id={} 错误={}", image_id, e);
                failed += 1;
                continue;
            }
        }) else {
            missing += 1;
            continue;
        };
        match super::http_client::push_peer_image(peer, &image_id, bytes).await {
            Ok(()) => sent += 1,
            Err(e) => {
                failed += 1;
                eprintln!("[局域网同步] 推送图片失败 image_id={} 错误={}", image_id, e);
            }
        }
    }
    eprintln!(
        "[局域网同步] 后台推送图片完成 collection={} peer={} success={} missing={} failed={}",
        collection,
        peer.device_name,
        sent,
        missing,
        failed
    );
}

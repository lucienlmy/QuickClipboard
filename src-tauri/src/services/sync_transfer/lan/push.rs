use crate::services::webdav_sync::types::{SyncReport, SyncReportItem};

pub async fn push_to_peer(device_id: &str) -> Result<SyncReport, String> {
    let peer = super::peer_store::list_peers()
        .into_iter()
        .find(|peer| peer.device_id == device_id)
        .ok_or_else(|| "未找到已配对设备".to_string())?;

    let local_device_id = super::runtime::device_id();
    let mut report = SyncReport::default();
    let remote_snapshot = super::http_client::fetch_peer_snapshot(&peer).await?;

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
    let history_records = crate::services::sync_transfer::sync_plan::records_newer_than_remote(
        history_records,
        &remote_snapshot.history_states,
    );
    if !history_records.is_empty() {
        push_images(&peer, &history_records).await?;
        let changed_history = super::http_client::push_peer_history_records(
            &peer,
            super::LanRecordBatch {
                collection: "history".to_string(),
                records: history_records,
            },
        )
        .await?;
        report.pushed_clipboard = changed_history.records.len() as u32;
        report.pushed += report.pushed_clipboard;
        report
            .pushed_items
            .extend(changed_history.records.iter().map(|record| record.report_item("clipboard")));
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
    let favorite_records = crate::services::sync_transfer::sync_plan::records_newer_than_remote(
        favorite_records,
        &remote_snapshot.favorite_states,
    );
    if !favorite_records.is_empty() {
        push_images(&peer, &favorite_records).await?;
        let changed_favorites = super::http_client::push_peer_favorite_records(
            &peer,
            super::LanRecordBatch {
                collection: "favorites".to_string(),
                records: favorite_records,
            },
        )
        .await?;
        report.pushed_favorites = changed_favorites.records.len() as u32;
        report.pushed += report.pushed_favorites;
        report
            .pushed_items
            .extend(changed_favorites.records.iter().map(|record| record.report_item("favorites")));
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

    Ok(report)
}

async fn push_images(peer: &super::peer_store::PairedPeer, records: &[crate::services::webdav_sync::types::CloudRecord]) -> Result<(), String> {
    for image_id in super::files::collect_record_image_ids(records) {
        let Some(bytes) = super::files::read_image_file(&image_id)? else {
            continue;
        };
        super::http_client::push_peer_image(peer, &image_id, bytes).await?;
    }
    Ok(())
}

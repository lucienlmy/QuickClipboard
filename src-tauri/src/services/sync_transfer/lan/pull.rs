use crate::services::webdav_sync::types::{SyncReport, SyncReportItem};

pub async fn pull_from_peer(device_id: &str) -> Result<SyncReport, String> {
    let peer = super::peer_store::list_peers()
        .into_iter()
        .find(|peer| peer.device_id == device_id)
        .ok_or_else(|| "未找到已配对设备".to_string())?;

    let mut report = SyncReport::default();
    let tombstones = super::http_client::fetch_peer_tombstones(&peer).await?;
    let _ = crate::services::database::upsert_sync_tombstones(&tombstones.tombstones)?;
    let tombstone_report = crate::services::database::apply_sync_tombstones(&tombstones.tombstones)?;
    report.pulled_clipboard += tombstone_report.history;
    report.pulled_favorites += tombstone_report.favorites;
    report.pulled_groups += tombstone_report.groups;
    report.pulled += tombstone_report.total();

    let history = super::http_client::fetch_peer_history_records(&peer).await?;
    let history_records = crate::services::database::filter_records_not_deleted(
        crate::services::database::COLLECTION_HISTORY,
        &history.records,
    )?;
    fetch_missing_images(&peer, &history_records).await?;
    let changed_history = crate::services::database::lan_upsert_history_records(&history_records)?;
    let changed_history_count = changed_history.len() as u32;
    report.pulled_clipboard += changed_history_count;
    report.pulled += changed_history_count;
    report
        .pulled_items
        .extend(changed_history.iter().map(|record| record.report_item("clipboard")));

    let favorites = super::http_client::fetch_peer_favorite_records(&peer).await?;
    let favorite_records = crate::services::database::filter_records_not_deleted(
        crate::services::database::COLLECTION_FAVORITES,
        &favorites.records,
    )?;
    fetch_missing_images(&peer, &favorite_records).await?;
    let changed_favorites = crate::services::database::lan_upsert_favorite_records(&favorite_records)?;
    let changed_favorites_count = changed_favorites.len() as u32;
    report.pulled_favorites += changed_favorites_count;
    report.pulled += changed_favorites_count;
    report
        .pulled_items
        .extend(changed_favorites.iter().map(|record| record.report_item("favorites")));

    let groups = super::http_client::fetch_peer_groups(&peer).await?;
    let groups = crate::services::database::filter_groups_not_deleted(&groups.groups)?;
    let changed_groups = crate::services::database::lan_save_groups(&groups)?;
    let changed_groups_count = changed_groups.len() as u32;
    report.pulled_groups += changed_groups_count;
    report.pulled += changed_groups_count;
    report.pulled_items.extend(changed_groups.into_iter().map(|group| {
        SyncReportItem {
            category: "groups".to_string(),
            id: group.name.clone(),
            summary: group.name,
            source_device_id: group.source_device_id,
            updated_at: group.updated_at,
        }
    }));

    Ok(report)
}

async fn fetch_missing_images(peer: &super::peer_store::PairedPeer, records: &[crate::services::webdav_sync::types::CloudRecord]) -> Result<(), String> {
    for image_id in super::files::collect_record_image_ids(records) {
        if super::files::read_image_file(&image_id)?.is_some() {
            continue;
        }
        let Some(bytes) = super::http_client::fetch_peer_image(peer, &image_id).await? else {
            continue;
        };
        super::files::save_image_file(&image_id, &bytes)?;
    }
    Ok(())
}

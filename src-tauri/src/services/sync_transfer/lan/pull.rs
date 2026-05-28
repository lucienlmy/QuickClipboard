use crate::services::webdav_sync::types::{SyncReport, SyncReportItem};

pub async fn pull_from_peer(device_id: &str) -> Result<SyncReport, String> {
    let peer = super::peer_store::list_peers()
        .into_iter()
        .find(|peer| peer.device_id == device_id)
        .ok_or_else(|| "未找到已配对设备".to_string())?;

    let mut report = SyncReport::default();
    let history = super::http_client::fetch_peer_history_records(&peer).await?;
    fetch_missing_images(&peer, &history.records).await?;
    let changed_history = crate::services::database::webdav_upsert_history_records(&history.records)?;
    report.pulled_clipboard = changed_history.len() as u32;
    report.pulled += report.pulled_clipboard;
    report
        .pulled_items
        .extend(changed_history.iter().map(|record| record.report_item("clipboard")));

    let favorites = super::http_client::fetch_peer_favorite_records(&peer).await?;
    fetch_missing_images(&peer, &favorites.records).await?;
    let changed_favorites = crate::services::database::webdav_upsert_favorite_records(&favorites.records)?;
    report.pulled_favorites = changed_favorites.len() as u32;
    report.pulled += report.pulled_favorites;
    report
        .pulled_items
        .extend(changed_favorites.iter().map(|record| record.report_item("favorites")));

    let groups = super::http_client::fetch_peer_groups(&peer).await?;
    let changed_groups = crate::services::database::webdav_save_groups(&groups.groups)?;
    report.pulled_groups = changed_groups.len() as u32;
    report.pulled += report.pulled_groups;
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

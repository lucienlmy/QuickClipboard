use crate::services::webdav_sync::types::{SyncReport, SyncReportItem};

pub async fn push_to_peer(device_id: &str) -> Result<SyncReport, String> {
    let peer = super::peer_store::list_peers()
        .into_iter()
        .find(|peer| peer.device_id == device_id)
        .ok_or_else(|| "未找到已配对设备".to_string())?;

    let local_device_id = super::runtime::device_id();
    let mut report = SyncReport::default();
    let remote_snapshot = super::http_client::fetch_peer_snapshot(&peer).await?;

    let history_records = crate::services::sync_transfer::sync_plan::records_newer_than_remote(
        crate::services::database::webdav_list_history_records(&local_device_id)?,
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

    let favorite_records = crate::services::sync_transfer::sync_plan::records_newer_than_remote(
        crate::services::database::webdav_list_favorite_records(&local_device_id)?,
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

    let groups = crate::services::sync_transfer::sync_plan::groups_newer_than_remote(
        crate::services::database::webdav_list_groups(&local_device_id)?,
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

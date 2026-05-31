use std::collections::HashMap;

use super::types::{CloudGroup, GroupList};
use super::webdav_client::WebdavClient;

pub async fn upload_groups_with_tombstones(
    client: &WebdavClient,
    device_id: &str,
    tombstone_states: &HashMap<String, i64>,
) -> Result<Vec<CloudGroup>, String> {
    let mut remote = client
        .get_json::<GroupList>("groups/groups.json")
        .await?
        .unwrap_or_default()
        .groups
        .into_iter()
        .map(|group| (group.name.clone(), group))
        .collect::<HashMap<_, _>>();
    let mut changed = Vec::new();

    let local_groups = crate::services::database::webdav_list_groups(device_id)?;
    let local_groups = crate::services::database::filter_groups_not_deleted_by_states(local_groups, tombstone_states);
    for mut group in local_groups {
        group.source_device_id = device_id.to_string();
        match remote.get(&group.name) {
            Some(existing) if existing.updated_at >= group.updated_at => {}
            _ => {
                remote.insert(group.name.clone(), group.clone());
                changed.push(group);
            }
        }
    }

    if changed.is_empty() {
        return Ok(changed);
    }

    let mut groups = remote.into_values().collect::<Vec<_>>();
    groups.sort_by_key(|g| (g.order, g.name.clone()));
    client.ensure_groups_dir().await?;
    client.put_json("groups/groups.json", &GroupList { groups }).await?;
    Ok(changed)
}

pub async fn download_groups(client: &WebdavClient) -> Result<Vec<CloudGroup>, String> {
    let Some(remote) = client.get_json::<GroupList>("groups/groups.json").await? else {
        return Ok(Vec::new());
    };

    let groups = remote
        .groups
        .into_iter()
        .collect::<Vec<CloudGroup>>();
    let groups = crate::services::database::filter_groups_not_deleted(&groups)?;
    crate::services::database::lan_save_groups(&groups)
}

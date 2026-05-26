use std::collections::HashMap;

use super::types::{CloudGroup, GroupList};
use super::webdav_client::WebdavClient;

pub async fn upload_groups(client: &WebdavClient, device_id: &str) -> Result<Vec<CloudGroup>, String> {
    let mut remote = client
        .get_json::<GroupList>("groups/groups.json")
        .await?
        .unwrap_or_default()
        .groups
        .into_iter()
        .map(|group| (group.name.clone(), group))
        .collect::<HashMap<_, _>>();
    let mut changed = Vec::new();

    for mut group in crate::services::database::webdav_list_groups(device_id)? {
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

pub async fn download_groups(
    client: &WebdavClient,
    device_id: &str,
    include_own_device: bool,
) -> Result<Vec<CloudGroup>, String> {
    let Some(remote) = client.get_json::<GroupList>("groups/groups.json").await? else {
        return Ok(Vec::new());
    };

    let groups = remote
        .groups
        .into_iter()
        .filter(|group| include_own_device || group.source_device_id != device_id)
        .collect::<Vec<CloudGroup>>();
    crate::services::database::webdav_save_groups(&groups)
}

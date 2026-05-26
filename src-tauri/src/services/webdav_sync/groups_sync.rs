use std::collections::HashMap;

use super::types::{CloudGroup, GroupList};
use super::webdav_client::WebdavClient;

pub async fn upload_groups(client: &WebdavClient, device_id: &str) -> Result<u32, String> {
    let mut remote = client
        .get_json::<GroupList>("groups/groups.json")
        .await?
        .unwrap_or_default()
        .groups
        .into_iter()
        .map(|group| (group.name.clone(), group))
        .collect::<HashMap<_, _>>();

    for mut group in crate::services::database::webdav_list_groups(device_id)? {
        group.source_device_id = device_id.to_string();
        match remote.get(&group.name) {
            Some(existing) if existing.updated_at >= group.updated_at => {}
            _ => {
                remote.insert(group.name.clone(), group);
            }
        }
    }

    let mut groups = remote.into_values().collect::<Vec<_>>();
    groups.sort_by_key(|g| (g.order, g.name.clone()));
    let count = groups.len() as u32;
    client.put_json("groups/groups.json", &GroupList { groups }).await?;
    Ok(count)
}

pub async fn download_groups(
    client: &WebdavClient,
    device_id: &str,
    include_own_device: bool,
) -> Result<u32, String> {
    let Some(remote) = client.get_json::<GroupList>("groups/groups.json").await? else {
        return Ok(0);
    };

    let groups = remote
        .groups
        .into_iter()
        .filter(|group| include_own_device || group.source_device_id != device_id)
        .collect::<Vec<CloudGroup>>();
    let count = groups.len() as u32;
    if count > 0 {
        crate::services::database::webdav_save_groups(&groups)?;
    }
    Ok(count)
}

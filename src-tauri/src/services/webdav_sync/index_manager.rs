use super::types::{SyncCollection, SyncIndex};
use super::webdav_client::WebdavClient;

pub async fn load_index(client: &WebdavClient, collection: SyncCollection) -> Result<SyncIndex, String> {
    let path = format!("{}/index.json", collection.dir());
    Ok(client.get_json(&path).await?.unwrap_or_default())
}

pub async fn save_index(
    client: &WebdavClient,
    collection: SyncCollection,
    index: &SyncIndex,
) -> Result<(), String> {
    let path = format!("{}/index.json", collection.dir());
    client.put_json(&path, index).await
}

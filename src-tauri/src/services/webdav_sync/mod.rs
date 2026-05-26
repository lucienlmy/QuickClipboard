pub mod chunk_manager;
pub mod downloader;
pub mod groups_sync;
pub mod index_manager;
pub mod local_state;
pub mod sync_scheduler;
pub mod types;
pub mod uploader;
pub mod webdav_client;

pub use types::{SyncReport, WebdavStatus};

use types::WebdavConfig;
use webdav_client::WebdavClient;

pub async fn test_connection() -> Result<(), String> {
    let client = build_client()?;
    client.test_connection().await
}

pub async fn upload() -> Result<SyncReport, String> {
    let client = build_client()?;
    client.ensure_dirs().await?;
    let device_id = crate::services::lan_sync::device_id();
    uploader::upload_all(&client, &device_id).await
}

pub async fn download(include_own_device: bool) -> Result<SyncReport, String> {
    let client = build_client()?;
    client.ensure_dirs().await?;
    let device_id = crate::services::lan_sync::device_id();
    downloader::download_all(&client, &device_id, include_own_device).await
}

pub fn status() -> WebdavStatus {
    sync_scheduler::status()
}

pub fn start_scheduler() {
    sync_scheduler::start();
}

pub fn stop_scheduler() {
    sync_scheduler::stop();
}

fn build_client() -> Result<WebdavClient, String> {
    let settings = crate::services::get_settings();
    let config = WebdavConfig {
        url: settings.webdav_url,
        username: settings.webdav_username,
        password: settings.webdav_password,
        root_path: if settings.webdav_root_path.trim().is_empty() {
            "quickclipboard".to_string()
        } else {
            settings.webdav_root_path
        },
    };
    WebdavClient::new(config)
}

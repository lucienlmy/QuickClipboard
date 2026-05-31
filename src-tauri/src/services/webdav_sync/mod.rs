pub mod chunk_manager;
pub mod downloader;
pub mod groups_sync;
pub mod index_manager;
pub mod local_state;
pub mod sync_scheduler;
pub mod tombstones_sync;
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
    let device_id = crate::services::sync_transfer::device_id();
    let report = uploader::upload_all(&client, &device_id).await?;
    Ok(sync_scheduler::store_manual_report("push", report))
}

pub async fn download(force_download: bool) -> Result<SyncReport, String> {
    let client = build_client()?;
    let device_id = crate::services::sync_transfer::device_id();
    let report = downloader::download_all(&client, &device_id, force_download).await?;
    Ok(sync_scheduler::store_manual_report("pull", report))
}

pub async fn upload_parts(upload_clipboard: bool, upload_favorites: bool, upload_groups: bool) -> Result<SyncReport, String> {
    let client = build_client()?;
    let device_id = crate::services::sync_transfer::device_id();
    uploader::upload_parts(&client, &device_id, upload_clipboard, upload_favorites, upload_groups).await
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

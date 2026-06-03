pub mod chunk_manager;
pub mod cloud_files;
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

pub async fn upload_cloud_file_with_progress(
    path: &str,
    transfer_id: Option<String>,
    progress: Option<cloud_files::CloudFileUploadProgressCallback>,
) -> Result<cloud_files::CloudFileUploadResult, String> {
    let client = build_client()?;
    cloud_files::upload_file_with_progress(&client, path, transfer_id, progress).await
}

pub async fn list_cloud_files() -> Result<Vec<cloud_files::CloudFileListItem>, String> {
    let client = build_client()?;
    cloud_files::list_files(&client).await
}

pub async fn download_cloud_file(file_id: &str) -> Result<cloud_files::CloudFileDownloadResult, String> {
    let client = build_client()?;
    cloud_files::download_file(&client, file_id).await
}

pub async fn delete_cloud_file(file_id: &str) -> Result<(), String> {
    let client = build_client()?;
    cloud_files::delete_file(&client, file_id).await
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

use crate::services;

#[tauri::command]
pub async fn webdav_test_connection() -> Result<(), String> {
    services::webdav_sync::test_connection().await
}

#[tauri::command]
pub async fn webdav_upload() -> Result<services::webdav_sync::SyncReport, String> {
    services::webdav_sync::upload().await
}

#[tauri::command]
pub async fn webdav_download() -> Result<services::webdav_sync::SyncReport, String> {
    services::webdav_sync::download(false).await
}

#[tauri::command]
pub async fn webdav_download_all() -> Result<services::webdav_sync::SyncReport, String> {
    services::webdav_sync::download(true).await
}

#[tauri::command]
pub fn webdav_get_status() -> Result<services::webdav_sync::WebdavStatus, String> {
    Ok(services::webdav_sync::status())
}

#[tauri::command]
pub fn webdav_start_scheduler() -> Result<(), String> {
    services::webdav_sync::start_scheduler();
    Ok(())
}

#[tauri::command]
pub fn webdav_stop_scheduler() -> Result<(), String> {
    services::webdav_sync::stop_scheduler();
    Ok(())
}

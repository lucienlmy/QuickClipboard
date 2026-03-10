use crate::services;
use lan_sync_core::Snapshot;

#[tauri::command]
pub async fn lan_sync_get_snapshot() -> Result<Snapshot, String> {
    Ok(services::lan_sync::get_snapshot().await)
}

#[tauri::command]
pub async fn lan_sync_set_enabled(enabled: bool) -> Result<Snapshot, String> {
    Ok(services::lan_sync::set_enabled(enabled).await)
}

#[tauri::command]
pub async fn lan_sync_start_server(port: u16) -> Result<u16, String> {
    services::lan_sync::start_server(port)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lan_sync_connect_peer(peer_url: String, auto_reconnect: bool) -> Result<(), String> {
    services::lan_sync::connect_peer(&peer_url, auto_reconnect)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lan_sync_sync_clipboard_item(clipboard_id: i64) -> Result<String, String> {
    services::lan_sync::sync_clipboard_item(clipboard_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lan_sync_disconnect_peer() -> Result<(), String> {
    services::lan_sync::disconnect_peer().await;
    Ok(())
}

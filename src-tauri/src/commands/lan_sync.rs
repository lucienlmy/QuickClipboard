use crate::services;
use lan_sync_core::Snapshot;
use serde::Serialize;
use std::net::IpAddr;

#[derive(Serialize)]
pub struct LanSyncInfo {
    pub device_id: String,
    pub snapshot: Snapshot,
    pub local_ips: Vec<String>,
    pub recommended_peer_urls: Vec<String>,
}

fn get_local_lan_ipv4s() -> Vec<String> {
    let mut private = Vec::new();
    let mut other = Vec::new();

    let Ok(ifaces) = if_addrs::get_if_addrs() else {
        return Vec::new();
    };

    for iface in ifaces {
        let ip = iface.ip();
        if ip.is_loopback() {
            continue;
        }

        match ip {
            IpAddr::V4(v4) => {
                if v4.is_private() {
                    private.push(v4.to_string());
                } else {
                    other.push(v4.to_string());
                }
            }
            IpAddr::V6(_v6) => {
            }
        }
    }

    private.extend(other);
    private.sort();
    private.dedup();
    private
}

fn build_ws_urls(ips: &[String], port: Option<u16>) -> Vec<String> {
    let Some(port) = port else {
        return Vec::new();
    };
    ips.iter()
        .map(|ip| format!("ws://{}:{}", ip, port))
        .collect()
}

#[tauri::command]
pub async fn lan_sync_get_snapshot() -> Result<Snapshot, String> {
    Ok(services::lan_sync::get_snapshot().await)
}

#[tauri::command]
pub async fn lan_sync_get_info() -> Result<LanSyncInfo, String> {
    let snapshot = services::lan_sync::get_snapshot().await;
    let local_ips = get_local_lan_ipv4s();
    let recommended_peer_urls = build_ws_urls(&local_ips, snapshot.server_port);

    Ok(LanSyncInfo {
        device_id: services::lan_sync::device_id(),
        snapshot,
        local_ips,
        recommended_peer_urls,
    })
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
pub async fn lan_sync_connect_peer(
    peer_url: String,
    auto_reconnect: bool,
    pair_code: Option<String>,
) -> Result<(), String> {
    services::lan_sync::connect_peer(&peer_url, auto_reconnect, pair_code)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lan_sync_get_server_pair_code() -> Result<Option<(String, u64)>, String> {
    Ok(services::lan_sync::get_server_pair_code().await)
}

#[tauri::command]
pub async fn lan_sync_refresh_server_pair_code() -> Result<Option<(String, u64)>, String> {
    Ok(services::lan_sync::refresh_server_pair_code().await)
}

#[tauri::command]
pub async fn lan_sync_sync_clipboard_item(clipboard_id: i64) -> Result<String, String> {
    services::lan_sync::sync_clipboard_item(clipboard_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lan_sync_sync_favorite_item(favorite_id: String) -> Result<String, String> {
    services::lan_sync::sync_favorite_item(favorite_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lan_sync_disconnect_peer() -> Result<(), String> {
    services::lan_sync::disconnect_peer().await;
    Ok(())
}

#[tauri::command]
pub async fn lan_sync_list_trusted_devices() -> Result<Vec<services::lan_sync::TrustedDeviceInfo>, String> {
    Ok(services::lan_sync::list_trusted_devices().await)
}

#[tauri::command]
pub async fn lan_sync_disconnect_device(device_id: String) -> Result<bool, String> {
    Ok(services::lan_sync::disconnect_device(&device_id).await)
}

#[tauri::command]
pub async fn lan_sync_remove_trusted_device(device_id: String) -> Result<bool, String> {
    Ok(services::lan_sync::remove_trusted_device(&device_id).await)
}

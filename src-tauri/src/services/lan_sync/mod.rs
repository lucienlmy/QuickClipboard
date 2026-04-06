mod clipboard_sync;
mod file_transfer;
mod state;

pub use clipboard_sync::{
    handle_attachment_request, request_attachment, send_clipboard_record, sync_clipboard_item, sync_favorite_item,
};
pub use file_transfer::{
    chat_accept_file_offer, chat_cancel_transfer, chat_prepare_files, chat_reject_file_offer, chat_reveal_file,
    chat_send_file_offer,
};
pub use state::{
    cleanup_chat_transfers_for_devices, get_snapshot, local_device_name, subscribe, ChatConnectedDevice,
    ChatFileAcceptInput, ChatFileCancelInput, ChatFileCancelResult, ChatFileDecisionPayload, ChatFileInfoInput,
    ChatFileOfferInput, ChatFileOfferPayload, ChatFileRejectInput, TrustedDevice, TrustedDeviceInfo,
};

use lan_sync_core::{ChatTextMessage, LanSyncError, LanSyncMessage, Snapshot};
use uuid::Uuid;

use self::file_transfer::{ensure_file_http_server_started, stop_file_http_server};
use self::state::{
    cleanup_transfers_for_device, current_time_ms, hydrate_trusted_devices_to_core, load_trusted_devices,
    normalize_device_name, save_trusted_devices, sync_core_file_http_port, CHAT_RUNTIME, MANAGER,
};

pub fn device_id() -> String {
    state::device_id()
}

pub async fn set_enabled(enabled: bool) -> Snapshot {
    sync_core_file_http_port().await;
    MANAGER.set_enabled(enabled).await;
    if !enabled {
        stop_file_http_server().await;
        cleanup_transfers_for_device(&device_id(), "连接已关闭，传输已中断").await;
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.clear();
        runtime.outgoing_sending.clear();
        runtime.incoming_waiting_decision.clear();
        runtime.incoming_decision_senders.clear();
        runtime.incoming_receiving.clear();
    } else {
        let _ = ensure_file_http_server_started().await;
    }
    MANAGER.get_snapshot().await
}

pub async fn start_server(port: u16) -> Result<u16, LanSyncError> {
    hydrate_trusted_devices_to_core().await;
    let _ = ensure_file_http_server_started().await;
    let bound = MANAGER.start_server(port).await?;
    let code = format!("{:010}", fastrand::u32(0..1_000_000_000));
    MANAGER.set_server_pair_code(Some(code)).await;
    Ok(bound)
}

pub async fn connect_peer(
    peer_url: &str,
    auto_reconnect: bool,
    pair_code: Option<String>,
) -> Result<(), LanSyncError> {
    hydrate_trusted_devices_to_core().await;
    let _ = ensure_file_http_server_started().await;
    MANAGER.connect_peer(peer_url, auto_reconnect, pair_code).await
}

pub async fn disconnect_peer() {
    let snapshot = MANAGER.get_snapshot().await;
    MANAGER.disconnect_peer().await;
    if let Some(device_id) = snapshot.connected_peer_device_id {
        cleanup_transfers_for_device(&device_id, "连接已断开，传输已中断").await;
    }
}

pub async fn get_server_pair_code() -> Option<(String, u64)> {
    MANAGER.get_server_pair_code().await
}

pub async fn refresh_server_pair_code() -> Option<(String, u64)> {
    let code = format!("{:010}", fastrand::u32(0..1_000_000_000));
    MANAGER.set_server_pair_code(Some(code)).await;
    MANAGER.get_server_pair_code().await
}

pub fn remember_peer_device(device_id: String, device_name: Option<String>) {
    let normalized_name = normalize_device_name(device_name);
    let mut list = load_trusted_devices();
    let Some(device) = list.iter_mut().find(|x| x.device_id == device_id) else {
        return;
    };

    let mut changed = false;
    if normalized_name.is_some() && device.device_name != normalized_name {
        device.device_name = normalized_name;
        changed = true;
    }

    let now = current_time_ms();
    if device.last_seen_ms != now {
        device.last_seen_ms = now;
        changed = true;
    }

    if changed {
        save_trusted_devices(&list);
    }
}

pub fn on_paired(device_id: String, pair_secret: String, device_name: Option<String>) {
    let now = current_time_ms();
    let normalized_name = normalize_device_name(device_name);
    let mut list = load_trusted_devices();
    if let Some(d) = list.iter_mut().find(|x| x.device_id == device_id) {
        d.pair_secret = pair_secret;
        if normalized_name.is_some() {
            d.device_name = normalized_name.clone();
        }
        d.last_seen_ms = now;
    } else {
        list.push(TrustedDevice {
            device_id,
            device_name: normalized_name,
            pair_secret,
            first_paired_at_ms: now,
            last_seen_ms: now,
        });
    }
    save_trusted_devices(&list);

    let list2 = list;
    tauri::async_runtime::spawn(async move {
        let devices = list2
            .into_iter()
            .map(|d| (d.device_id, d.pair_secret))
            .collect::<Vec<_>>();
        MANAGER.set_trusted_devices_pair_secrets(devices).await;
    });
}

pub async fn list_trusted_devices() -> Vec<TrustedDeviceInfo> {
    let list = load_trusted_devices();
    let snapshot = MANAGER.get_snapshot().await;
    let connected_ids = snapshot.server_connected_device_ids;
    let connected_peer_device_id = snapshot.connected_peer_device_id;
    list.into_iter()
        .map(|d| TrustedDeviceInfo {
            connected: connected_ids.iter().any(|x| x == &d.device_id)
                || connected_peer_device_id.as_ref().is_some_and(|x| x == &d.device_id),
            device_id: d.device_id,
            device_name: d.device_name,
            first_paired_at_ms: d.first_paired_at_ms,
            last_seen_ms: d.last_seen_ms,
        })
        .collect()
}

pub async fn disconnect_device(device_id: &str) -> bool {
    let disconnected = MANAGER.disconnect_device(device_id).await;
    if disconnected {
        cleanup_transfers_for_device(device_id, "连接已断开，传输已中断").await;
    }
    disconnected
}

pub async fn ban_device_for_current_pair_code(device_id: &str) -> bool {
    MANAGER.ban_device_for_current_pair_code(device_id).await
}

pub async fn remove_trusted_device(device_id: &str) -> bool {
    let _ = disconnect_device(device_id).await;
    let mut list = load_trusted_devices();
    let before = list.len();
    list.retain(|x| x.device_id != device_id);
    if list.len() != before {
        save_trusted_devices(&list);
        MANAGER.remove_trusted_device_pair_secret(device_id).await;
        let _ = ban_device_for_current_pair_code(device_id).await;
        true
    } else {
        false
    }
}

pub async fn list_chat_connected_devices() -> Vec<ChatConnectedDevice> {
    let list = list_trusted_devices().await;
    list.into_iter()
        .filter(|d| d.connected)
        .map(|d| ChatConnectedDevice {
            device_id: d.device_id,
            device_name: d.device_name,
        })
        .collect()
}

pub async fn chat_send_text(to_device_id: &str, text: &str) -> Result<ChatTextMessage, LanSyncError> {
    let msg = ChatTextMessage {
        message_id: Uuid::new_v4().to_string(),
        from_device_id: device_id(),
        to_device_id: to_device_id.to_string(),
        text: text.to_string(),
        sent_at_ms: current_time_ms(),
    };
    MANAGER
        .send_message_to_device(to_device_id, LanSyncMessage::ChatText(msg.clone()))
        .await?;
    Ok(msg)
}

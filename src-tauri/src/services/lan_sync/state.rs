use lan_sync_core::{ChatFileMeta, ClipboardRawFormat, CoreEvent, LanSyncConfig, LanSyncManager, Snapshot};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const DEVICE_ID_KEY: &str = "lan_sync_device_id";
const TRUSTED_DEVICES_KEY: &str = "lan_sync_trusted_devices";
pub(super) const CHAT_FILE_OFFER_EXPIRE_MS: u64 = 10 * 60 * 1000;
pub(super) const FILE_HTTP_HEADER_LIMIT: usize = 64 * 1024;
pub(super) const FILE_HTTP_IO_BUFFER_SIZE: usize = 64 * 1024;
pub(super) const FILE_HTTP_PREPARE_PATH: &str = "/qc-file/prepare-upload";
pub(super) const FILE_HTTP_UPLOAD_PATH: &str = "/qc-file/upload";
pub(super) const FILE_HTTP_PREPARE_DOWNLOAD_PATH: &str = "/qc-file/prepare-download";
pub(super) const FILE_HTTP_DOWNLOAD_PATH: &str = "/qc-file/download";
pub(super) const FILE_HTTP_CANCEL_PATH: &str = "/qc-file/cancel";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedDevice {
    pub device_id: String,
    #[serde(default)]
    pub device_name: Option<String>,
    pub pair_secret: String,
    pub first_paired_at_ms: u64,
    pub last_seen_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedDeviceInfo {
    pub device_id: String,
    pub device_name: Option<String>,
    pub first_paired_at_ms: u64,
    pub last_seen_ms: u64,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatConnectedDevice {
    pub device_id: String,
    pub device_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileInfoInput {
    pub file_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub file_path: String,
    #[serde(default)]
    pub file_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileOfferInput {
    pub to_device_id: String,
    pub text: Option<String>,
    pub files: Vec<ChatFileInfoInput>,
    #[serde(default)]
    pub supported_modes: Vec<String>,
    #[serde(default)]
    pub preferred_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileAcceptInput {
    pub transfer_id: String,
    pub from_device_id: String,
    #[serde(default)]
    pub selected_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileRejectInput {
    pub transfer_id: String,
    pub from_device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileCancelInput {
    pub transfer_id: String,
    pub peer_device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileCancelResult {
    pub transfer_id: String,
    pub peer_device_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileOfferPayload {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub files: Vec<ChatFileMeta>,
    pub sent_at_ms: u64,
    pub expire_at_ms: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub supported_modes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preferred_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileDecisionPayload {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub decided_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileDonePayload {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub sent_at_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ChatTransferStatus {
    WaitingAccept,
    WaitingDownload,
    Transferring,
    Done,
    Failed,
    Rejected,
    Expired,
    CanceledBySender,
    CanceledByReceiver,
    Partial,
}

impl ChatTransferStatus {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::WaitingAccept => "waiting_accept",
            Self::WaitingDownload => "waiting_download",
            Self::Transferring => "transferring",
            Self::Done => "done",
            Self::Failed => "failed",
            Self::Rejected => "rejected",
            Self::Expired => "expired",
            Self::CanceledBySender => "canceled_by_sender",
            Self::CanceledByReceiver => "canceled_by_receiver",
            Self::Partial => "partial",
        }
    }

    pub(super) fn is_canceled(self) -> bool {
        matches!(self, Self::CanceledBySender | Self::CanceledByReceiver)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub(super) enum ChatTransferFileStatus {
    Queue,
    Transferring,
    Done,
    Failed,
    Canceled,
    Skipped,
}

impl ChatTransferFileStatus {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Queue => "queue",
            Self::Transferring => "transferring",
            Self::Done => "done",
            Self::Failed => "failed",
            Self::Canceled => "canceled",
            Self::Skipped => "skipped",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum IncomingDecision {
    Accept(ChatTransferMode),
    Reject,
    CancelByReceiver,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ChatTransferMode {
    SenderPush,
    ReceiverPull,
}

impl ChatTransferMode {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::SenderPush => "sender_push",
            Self::ReceiverPull => "receiver_pull",
        }
    }

    pub(super) fn from_str(value: &str) -> Option<Self> {
        match value.trim() {
            "sender_push" => Some(Self::SenderPush),
            "receiver_pull" => Some(Self::ReceiverPull),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub(super) struct OutgoingChatTransfer {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub text: Option<String>,
    pub files: Vec<ChatFileInfoInput>,
    pub sent_at_ms: u64,
    pub expire_at_ms: u64,
    pub supported_modes: Vec<ChatTransferMode>,
    pub preferred_mode: ChatTransferMode,
    pub selected_mode: Option<ChatTransferMode>,
    pub status: ChatTransferStatus,
    pub file_statuses: HashMap<String, ChatTransferFileStatus>,
    pub file_errors: HashMap<String, Option<String>>,
    pub download_tokens: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub(super) struct IncomingChatTransfer {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub text: Option<String>,
    pub files: Vec<ChatFileMeta>,
    pub sent_at_ms: u64,
    pub expire_at_ms: u64,
    pub supported_modes: Vec<ChatTransferMode>,
    pub preferred_mode: ChatTransferMode,
    pub selected_mode: Option<ChatTransferMode>,
    pub status: ChatTransferStatus,
}

#[derive(Debug, Clone)]
pub(super) struct ReceiveFileProgress {
    pub file_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub file_hash: Option<String>,
    pub upload_token: Option<String>,
    pub received: u64,
    pub received_ranges: Vec<(u64, u64)>,
    pub covered_size: u64,
    pub file_path: PathBuf,
    pub status: ChatTransferFileStatus,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub(super) struct IncomingReceiveProgress {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub text: Option<String>,
    pub sent_at_ms: u64,
    pub files: Vec<ReceiveFileProgress>,
    pub total_size: u64,
    pub received_size: u64,
    pub status: ChatTransferStatus,
}

#[derive(Debug)]
pub(super) struct FileHttpServerState {
    pub port: u16,
    pub task: tokio::task::JoinHandle<()>,
}

#[derive(Debug)]
pub(super) struct FileHttpRequest {
    pub method: String,
    pub path: String,
    pub query: HashMap<String, String>,
    pub content_length: usize,
    pub body_prefix: Vec<u8>,
}

#[derive(Debug)]
pub(super) struct FileHttpResponse {
    pub status_code: u16,
    pub body: String,
}

#[derive(Default)]
pub(super) struct ChatRuntime {
    pub outgoing_waiting_accept: HashMap<String, OutgoingChatTransfer>,
    pub outgoing_sending: HashMap<String, OutgoingChatTransfer>,
    pub incoming_waiting_decision: HashMap<String, IncomingChatTransfer>,
    pub incoming_decision_senders: HashMap<String, tokio::sync::oneshot::Sender<IncomingDecision>>,
    pub incoming_receiving: HashMap<String, IncomingReceiveProgress>,
}

pub(super) fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

pub(super) fn load_trusted_devices() -> Vec<TrustedDevice> {
    crate::services::store::get::<Vec<TrustedDevice>>(TRUSTED_DEVICES_KEY).unwrap_or_default()
}

pub(super) fn save_trusted_devices(list: &[TrustedDevice]) {
    let _ = crate::services::store::set(TRUSTED_DEVICES_KEY, &list.to_vec());
}

pub(super) async fn hydrate_trusted_devices_to_core() {
    let list = load_trusted_devices();
    let devices = list
        .into_iter()
        .map(|d| (d.device_id, d.pair_secret))
        .collect::<Vec<_>>();
    MANAGER.set_trusted_devices_pair_secrets(devices).await;
}

static DEVICE_ID: Lazy<String> = Lazy::new(|| {
    if let Some(id) = crate::services::store::get::<String>(DEVICE_ID_KEY) {
        return id;
    }

    let id = Uuid::new_v4().to_string();
    let _ = crate::services::store::set(DEVICE_ID_KEY, &id);
    id
});

static LOCAL_DEVICE_NAME: Lazy<String> = Lazy::new(detect_local_device_name);

pub(super) static MANAGER: Lazy<LanSyncManager> = Lazy::new(|| {
    LanSyncManager::new(LanSyncConfig {
        device_id: DEVICE_ID.clone(),
        device_name: Some(LOCAL_DEVICE_NAME.clone()),
        ..Default::default()
    })
});

pub(super) static CHAT_RUNTIME: Lazy<tokio::sync::Mutex<ChatRuntime>> =
    Lazy::new(|| tokio::sync::Mutex::new(ChatRuntime::default()));
pub(super) static FILE_HTTP_SERVER: Lazy<tokio::sync::Mutex<Option<FileHttpServerState>>> =
    Lazy::new(|| tokio::sync::Mutex::new(None));

pub(super) fn get_local_file_http_port() -> u16 {
    crate::services::get_settings()
        .lan_sync_server_port
        .saturating_add(1)
}

pub(super) fn get_local_file_http_hosts() -> Vec<String> {
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
            IpAddr::V6(_) => {}
        }
    }

    private.extend(other);
    private.sort();
    private.dedup();
    private
}

pub(super) async fn sync_core_file_http_port() {
    MANAGER.set_file_http_port(Some(get_local_file_http_port())).await;
}

pub(super) async fn sync_core_file_http_hosts() {
    MANAGER.set_file_http_hosts(get_local_file_http_hosts()).await;
}

pub(super) fn emit_lan_chat_event(payload: serde_json::Value) {
    use tauri::Emitter;
    if let Some(app) = crate::services::clipboard::get_app_handle() {
        let _ = app.emit("lan-chat-event", payload);
    }
}

pub(super) fn emit_file_state_event(
    transfer_id: &str,
    peer_device_id: &str,
    status: ChatTransferStatus,
    error: Option<&str>,
    selected_mode: Option<ChatTransferMode>,
    files: Vec<serde_json::Value>,
) {
    emit_lan_chat_event(serde_json::json!({
        "type": "file_state",
        "transfer_id": transfer_id,
        "peer_device_id": peer_device_id,
        "status": status.as_str(),
        "error": error,
        "selected_mode": selected_mode.map(|mode| mode.as_str()),
        "files": files,
    }));
}

pub(super) fn emit_outgoing_state(transfer: &OutgoingChatTransfer, error: Option<&str>) {
    emit_file_state_event(
        &transfer.transfer_id,
        &transfer.to_device_id,
        transfer.status,
        error,
        transfer.selected_mode,
        transfer
            .files
            .iter()
            .map(|file| {
                serde_json::json!({
                    "file_id": file.file_id,
                    "file_name": file.file_name,
                    "file_size": file.file_size,
                    "status": transfer
                        .file_statuses
                        .get(&file.file_id)
                        .copied()
                        .unwrap_or(ChatTransferFileStatus::Queue)
                        .as_str(),
                    "error": transfer
                        .file_errors
                        .get(&file.file_id)
                        .cloned()
                        .flatten(),
                })
            })
            .collect(),
    );
}

pub(super) fn emit_incoming_offer_state(transfer: &IncomingChatTransfer, error: Option<&str>) {
    emit_file_state_event(
        &transfer.transfer_id,
        &transfer.from_device_id,
        transfer.status,
        error,
        transfer.selected_mode,
        transfer
            .files
            .iter()
            .map(|file| {
                serde_json::json!({
                    "file_id": file.file_id,
                    "file_name": file.file_name,
                    "file_size": file.file_size,
                    "status": ChatTransferFileStatus::Queue.as_str(),
                    "error": serde_json::Value::Null,
                })
            })
            .collect(),
    );
}

pub(super) fn emit_incoming_receive_state(transfer: &IncomingReceiveProgress, error: Option<&str>) {
    emit_file_state_event(
        &transfer.transfer_id,
        &transfer.from_device_id,
        transfer.status,
        error,
        None,
        transfer
            .files
            .iter()
            .map(|file| {
                serde_json::json!({
                    "file_id": file.file_id,
                    "file_name": file.file_name,
                    "file_size": file.file_size,
                    "status": file.status.as_str(),
                    "error": file.error_message,
                    "received_size": file.received,
                    "path": file.file_path.to_string_lossy().to_string(),
                })
            })
            .collect(),
    );
}

pub(super) fn build_file_decision_payload(
    event_type: &str,
    transfer_id: &str,
    from_device_id: &str,
    to_device_id: &str,
    selected_mode: Option<ChatTransferMode>,
) -> serde_json::Value {
    serde_json::json!({
        "type": event_type,
        "decision": ChatFileDecisionPayload {
            transfer_id: transfer_id.to_string(),
            from_device_id: from_device_id.to_string(),
            to_device_id: to_device_id.to_string(),
            decided_at_ms: current_time_ms(),
            selected_mode: selected_mode.map(|mode| mode.as_str().to_string()),
        }
    })
}

pub(super) fn build_file_done_payload(
    transfer_id: &str,
    from_device_id: &str,
    to_device_id: &str,
    paths: Option<Vec<String>>,
) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "type": "file_done",
        "done": ChatFileDonePayload {
            transfer_id: transfer_id.to_string(),
            from_device_id: from_device_id.to_string(),
            to_device_id: to_device_id.to_string(),
            sent_at_ms: current_time_ms(),
        }
    });
    if let Some(paths) = paths {
        payload["paths"] = serde_json::json!(paths);
    }
    payload
}

pub(super) fn emit_file_failed_event(
    transfer_id: &str,
    from_device_id: &str,
    to_device_id: &str,
    error: &str,
) {
    emit_lan_chat_event(serde_json::json!({
        "type": "file_failed",
        "done": ChatFileDonePayload {
            transfer_id: transfer_id.to_string(),
            from_device_id: from_device_id.to_string(),
            to_device_id: to_device_id.to_string(),
            sent_at_ms: current_time_ms(),
        },
        "error": error
    }));
}

pub(super) async fn notify_peer_canceled(to_device_id: &str, transfer_id: &str) {
    let Some(url) = MANAGER
        .resolve_peer_file_server_url(
            to_device_id,
            FILE_HTTP_CANCEL_PATH,
            &[("transfer_id".to_string(), transfer_id.to_string())],
        )
        .await
    else {
        return;
    };

    let _ = reqwest::Client::new().post(url).body("{}").send().await;
}

pub(super) fn build_cancel_result(
    transfer_id: String,
    peer_device_id: String,
    status: ChatTransferStatus,
) -> ChatFileCancelResult {
    ChatFileCancelResult {
        transfer_id,
        peer_device_id,
        status: status.as_str().to_string(),
    }
}

pub(super) async fn cleanup_transfers_for_device(device_id: &str, reason: &str) {
    let (outgoing, incoming_offers, incoming_receiving, decision_senders) = {
        let mut runtime = CHAT_RUNTIME.lock().await;

        let outgoing_waiting_ids = runtime
            .outgoing_waiting_accept
            .iter()
            .filter(|(_, item)| item.from_device_id == device_id || item.to_device_id == device_id)
            .map(|(transfer_id, _)| transfer_id.clone())
            .collect::<Vec<_>>();
        let outgoing_sending_ids = runtime
            .outgoing_sending
            .iter()
            .filter(|(_, item)| item.from_device_id == device_id || item.to_device_id == device_id)
            .map(|(transfer_id, _)| transfer_id.clone())
            .collect::<Vec<_>>();
        let incoming_offer_ids = runtime
            .incoming_waiting_decision
            .iter()
            .filter(|(_, item)| item.from_device_id == device_id || item.to_device_id == device_id)
            .map(|(transfer_id, _)| transfer_id.clone())
            .collect::<Vec<_>>();
        let incoming_receiving_ids = runtime
            .incoming_receiving
            .iter()
            .filter(|(_, item)| item.from_device_id == device_id || item.to_device_id == device_id)
            .map(|(transfer_id, _)| transfer_id.clone())
            .collect::<Vec<_>>();

        let mut outgoing = Vec::new();
        for transfer_id in outgoing_waiting_ids {
            if let Some(mut item) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
                item.status = ChatTransferStatus::Failed;
                for file in &item.files {
                    if item
                        .file_statuses
                        .get(&file.file_id)
                        .copied()
                        .unwrap_or(ChatTransferFileStatus::Queue)
                        != ChatTransferFileStatus::Done
                    {
                        item.file_statuses
                            .insert(file.file_id.clone(), ChatTransferFileStatus::Failed);
                        item.file_errors
                            .insert(file.file_id.clone(), Some(reason.to_string()));
                    }
                }
                outgoing.push(item);
            }
        }
        for transfer_id in outgoing_sending_ids {
            if let Some(mut item) = runtime.outgoing_sending.remove(&transfer_id) {
                item.status = ChatTransferStatus::Failed;
                for file in &item.files {
                    if item
                        .file_statuses
                        .get(&file.file_id)
                        .copied()
                        .unwrap_or(ChatTransferFileStatus::Queue)
                        != ChatTransferFileStatus::Done
                    {
                        item.file_statuses
                            .insert(file.file_id.clone(), ChatTransferFileStatus::Failed);
                        item.file_errors
                            .insert(file.file_id.clone(), Some(reason.to_string()));
                    }
                }
                outgoing.push(item);
            }
        }

        let mut incoming_offers = Vec::new();
        let mut decision_senders = Vec::new();
        for transfer_id in incoming_offer_ids {
            if let Some(mut item) = runtime.incoming_waiting_decision.remove(&transfer_id) {
                item.status = ChatTransferStatus::Failed;
                incoming_offers.push(item);
            }
            if let Some(sender) = runtime.incoming_decision_senders.remove(&transfer_id) {
                decision_senders.push(sender);
            }
        }

        let mut incoming_receiving = Vec::new();
        for transfer_id in incoming_receiving_ids {
            if let Some(mut item) = runtime.incoming_receiving.remove(&transfer_id) {
                item.status = ChatTransferStatus::Failed;
                for file in &mut item.files {
                    if file.status != ChatTransferFileStatus::Done {
                        file.status = ChatTransferFileStatus::Failed;
                        file.error_message = Some(reason.to_string());
                    }
                }
                incoming_receiving.push(item);
            }
        }

        (outgoing, incoming_offers, incoming_receiving, decision_senders)
    };

    for sender in decision_senders {
        let _ = sender.send(IncomingDecision::Reject);
    }
    for transfer in outgoing {
        emit_outgoing_state(&transfer, Some(reason));
        emit_file_failed_event(
            &transfer.transfer_id,
            &transfer.from_device_id,
            &transfer.to_device_id,
            reason,
        );
    }
    for transfer in incoming_offers {
        emit_incoming_offer_state(&transfer, Some(reason));
        emit_file_failed_event(
            &transfer.transfer_id,
            &transfer.from_device_id,
            &transfer.to_device_id,
            reason,
        );
    }
    for transfer in incoming_receiving {
        emit_incoming_receive_state(&transfer, Some(reason));
        emit_file_failed_event(
            &transfer.transfer_id,
            &transfer.from_device_id,
            &transfer.to_device_id,
            reason,
        );
    }
}

pub async fn cleanup_chat_transfers_for_devices(device_ids: Vec<String>, reason: &str) {
    for device_id in device_ids {
        if !device_id.trim().is_empty() {
            cleanup_transfers_for_device(&device_id, reason).await;
        }
    }
}

pub(super) fn get_pair_secret(device_id: &str) -> Option<String> {
    load_trusted_devices()
        .into_iter()
        .find(|item| item.device_id == device_id)
        .map(|item| item.pair_secret)
}

pub(super) fn compute_transfer_proof(
    pair_secret: &str,
    from_device_id: &str,
    transfer_id: &str,
) -> Result<String, String> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let message = format!("{from_device_id}:{transfer_id}");
    let mut mac =
        Hmac::<Sha256>::new_from_slice(pair_secret.as_bytes()).map_err(|e| e.to_string())?;
    mac.update(message.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

pub(super) fn normalize_file_name(name: &str) -> String {
    let mut s = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>();
    if s.trim().is_empty() {
        s = "未命名文件".to_string();
    }
    s
}

pub(super) fn sanitize_relative_file_path(file_name: &str) -> PathBuf {
    let normalized = file_name.replace('\\', "/");
    let mut parts: Vec<String> = Vec::new();

    for part in normalized.split('/') {
        let trimmed = part.trim();
        if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
            continue;
        }

        let safe = normalize_file_name(trimmed);
        if !safe.trim().is_empty() {
            parts.push(safe);
        }
    }

    if parts.is_empty() {
        return PathBuf::from("未命名文件");
    }

    let mut rel = PathBuf::new();
    for part in parts {
        rel.push(part);
    }
    rel
}

fn to_rel_path_key(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").to_lowercase()
}

pub(super) fn normalize_device_name(device_name: Option<String>) -> Option<String> {
    device_name.and_then(|name| {
        let normalized = name.trim().to_string();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    })
}

pub(super) fn default_supported_transfer_modes() -> Vec<ChatTransferMode> {
    vec![ChatTransferMode::SenderPush, ChatTransferMode::ReceiverPull]
}

pub(super) fn parse_supported_transfer_modes(modes: &[String]) -> Vec<ChatTransferMode> {
    let mut parsed = Vec::new();
    for mode in modes {
        let Some(mode) = ChatTransferMode::from_str(mode) else {
            continue;
        };
        if !parsed.contains(&mode) {
            parsed.push(mode);
        }
    }
    if parsed.is_empty() {
        default_supported_transfer_modes()
    } else {
        parsed
    }
}

pub(super) fn choose_preferred_transfer_mode(
    supported_modes: &[ChatTransferMode],
    preferred_mode: Option<&str>,
) -> ChatTransferMode {
    if let Some(mode) = preferred_mode.and_then(ChatTransferMode::from_str) {
        if supported_modes.contains(&mode) {
            return mode;
        }
    }
    supported_modes
        .first()
        .copied()
        .unwrap_or(ChatTransferMode::SenderPush)
}

fn detect_local_device_name() -> String {
    for key in ["COMPUTERNAME", "HOSTNAME"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    "当前设备".to_string()
}

pub fn local_device_name() -> String {
    LOCAL_DEVICE_NAME.clone()
}

pub(super) fn device_id() -> String {
    DEVICE_ID.clone()
}

pub(super) fn compute_blake3_file_hash_hex(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

pub(super) fn get_chat_receive_dir() -> Result<PathBuf, String> {
    let base = crate::services::get_data_directory()?;
    let dir = base.join("chat_files");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn split_file_stem_ext(file_name: &str) -> (String, String) {
    let p = Path::new(file_name);
    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "未命名文件".to_string());
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_default();
    (stem, ext)
}

pub(super) fn build_unique_file_path(
    base_dir: &Path,
    file_name: &str,
    reserved: &mut HashSet<String>,
) -> PathBuf {
    let relative = sanitize_relative_file_path(file_name);
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let leaf_name = relative
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("未命名文件");
    let (stem, ext) = split_file_stem_ext(leaf_name);

    let mut index: u32 = 0;
    loop {
        let candidate_name = if index == 0 {
            if ext.is_empty() {
                stem.clone()
            } else {
                format!("{}.{}", stem, ext)
            }
        } else if ext.is_empty() {
            format!("{} ({})", stem, index)
        } else {
            format!("{} ({}).{}", stem, index, ext)
        };

        let candidate_rel = if parent.as_os_str().is_empty() {
            PathBuf::from(&candidate_name)
        } else {
            parent.join(&candidate_name)
        };
        let key = to_rel_path_key(&candidate_rel);
        let candidate_path = base_dir.join(&candidate_rel);
        if !reserved.contains(&key) && !candidate_path.exists() {
            reserved.insert(key);
            return candidate_path;
        }
        index = index.saturating_add(1);
    }
}

pub(super) fn is_image_content_type(content_type: &str) -> bool {
    content_type == "image"
}

pub(super) fn split_image_ids(s: &str) -> impl Iterator<Item = &str> {
    s.split(',').map(|x| x.trim()).filter(|x| !x.is_empty())
}

pub(super) fn local_image_file_exists(image_id: &str) -> bool {
    if let Ok(data_dir) = crate::services::get_data_directory() {
        let p = data_dir
            .join("clipboard_images")
            .join(format!("{}.png", image_id));
        return p.exists();
    }
    false
}

pub(super) fn load_raw_formats_for_clipboard_item(clipboard_id: i64) -> Vec<ClipboardRawFormat> {
    crate::services::database::get_clipboard_data_items("clipboard", &clipboard_id.to_string())
        .map(|items| {
            items
                .into_iter()
                .map(|item| ClipboardRawFormat {
                    format_name: item.format_name,
                    raw_data: item.raw_data,
                    is_primary: item.is_primary,
                    format_order: item.format_order,
                })
                .collect()
        })
        .unwrap_or_default()
}

pub(super) fn load_raw_formats_for_favorite_item(favorite_id: &str) -> Vec<ClipboardRawFormat> {
    crate::services::database::get_clipboard_data_items("favorite", favorite_id)
        .map(|items| {
            items
                .into_iter()
                .map(|item| ClipboardRawFormat {
                    format_name: item.format_name,
                    raw_data: item.raw_data,
                    is_primary: item.is_primary,
                    format_order: item.format_order,
                })
                .collect()
        })
        .unwrap_or_default()
}

pub(super) fn should_sync_record(record: &lan_sync_core::ClipboardRecord) -> bool {
    if record.content_type == "file" {
        return false;
    }

    if is_image_content_type(&record.content_type) {
        let Some(image_ids) = record.image_id.as_ref().filter(|s| !s.trim().is_empty()) else {
            return false;
        };

        // 规则 1：image 类型但 image_id 为空，不同步
        // 规则 2：image_id 存在但源文件缺失，不同步
        for iid in split_image_ids(image_ids) {
            if !local_image_file_exists(iid) {
                return false;
            }
        }
    }

    true
}

pub async fn get_snapshot() -> Snapshot {
    MANAGER.get_snapshot().await
}

pub async fn subscribe() -> tokio::sync::broadcast::Receiver<CoreEvent> {
    MANAGER.subscribe().await
}

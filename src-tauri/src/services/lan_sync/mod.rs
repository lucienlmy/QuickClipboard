use lan_sync_core::{
    ChatFileMeta, ChatTextMessage,
    ClipboardRawFormat, ClipboardRecord, CoreEvent, LanSyncConfig, LanSyncError, LanSyncManager, LanSyncMessage,
    Snapshot,
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const DEVICE_ID_KEY: &str = "lan_sync_device_id";
const TRUSTED_DEVICES_KEY: &str = "lan_sync_trusted_devices";
const CHAT_FILE_OFFER_EXPIRE_MS: u64 = 10 * 60 * 1000;
const FILE_HTTP_HEADER_LIMIT: usize = 64 * 1024;
const FILE_HTTP_IO_BUFFER_SIZE: usize = 64 * 1024;
const FILE_HTTP_PREPARE_PATH: &str = "/qc-file/prepare-upload";
const FILE_HTTP_UPLOAD_PATH: &str = "/qc-file/upload";
const FILE_HTTP_CANCEL_PATH: &str = "/qc-file/cancel";

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileAcceptInput {
    pub transfer_id: String,
    pub from_device_id: String,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileDecisionPayload {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub decided_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileDonePayload {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub sent_at_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChatTransferStatus {
    WaitingAccept,
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
    fn as_str(self) -> &'static str {
        match self {
            Self::WaitingAccept => "waiting_accept",
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

    fn is_canceled(self) -> bool {
        matches!(self, Self::CanceledBySender | Self::CanceledByReceiver)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChatTransferFileStatus {
    Queue,
    Transferring,
    Done,
    Failed,
    Canceled,
    Skipped,
}

impl ChatTransferFileStatus {
    fn as_str(self) -> &'static str {
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
enum IncomingDecision {
    Accept,
    Reject,
    CancelByReceiver,
}

#[derive(Debug, Clone)]
struct OutgoingChatTransfer {
    transfer_id: String,
    from_device_id: String,
    to_device_id: String,
    text: Option<String>,
    files: Vec<ChatFileInfoInput>,
    sent_at_ms: u64,
    expire_at_ms: u64,
    status: ChatTransferStatus,
    file_statuses: HashMap<String, ChatTransferFileStatus>,
    file_errors: HashMap<String, Option<String>>,
}

#[derive(Debug, Clone)]
struct IncomingChatTransfer {
    transfer_id: String,
    from_device_id: String,
    to_device_id: String,
    text: Option<String>,
    files: Vec<ChatFileMeta>,
    sent_at_ms: u64,
    expire_at_ms: u64,
    status: ChatTransferStatus,
}

#[derive(Debug, Clone)]
struct ReceiveFileProgress {
    file_id: String,
    file_name: String,
    file_size: u64,
    file_hash: Option<String>,
    upload_token: Option<String>,
    received: u64,
    received_ranges: Vec<(u64, u64)>,
    covered_size: u64,
    file_path: PathBuf,
    status: ChatTransferFileStatus,
    error_message: Option<String>,
}

#[derive(Debug, Clone)]
struct IncomingReceiveProgress {
    transfer_id: String,
    from_device_id: String,
    to_device_id: String,
    text: Option<String>,
    sent_at_ms: u64,
    files: Vec<ReceiveFileProgress>,
    total_size: u64,
    received_size: u64,
    status: ChatTransferStatus,
}

#[derive(Debug)]
struct FileHttpServerState {
    port: u16,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Debug)]
struct FileHttpRequest {
    method: String,
    path: String,
    query: HashMap<String, String>,
    content_length: usize,
    body_prefix: Vec<u8>,
}

#[derive(Debug)]
struct FileHttpResponse {
    status_code: u16,
    body: String,
}

#[derive(Default)]
struct ChatRuntime {
    outgoing_waiting_accept: HashMap<String, OutgoingChatTransfer>,
    outgoing_sending: HashMap<String, OutgoingChatTransfer>,
    incoming_waiting_decision: HashMap<String, IncomingChatTransfer>,
    incoming_decision_senders: HashMap<String, tokio::sync::oneshot::Sender<IncomingDecision>>,
    incoming_receiving: HashMap<String, IncomingReceiveProgress>,
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

fn load_trusted_devices() -> Vec<TrustedDevice> {
    crate::services::store::get::<Vec<TrustedDevice>>(TRUSTED_DEVICES_KEY).unwrap_or_default()
}

fn save_trusted_devices(list: &[TrustedDevice]) {
    let _ = crate::services::store::set(TRUSTED_DEVICES_KEY, &list.to_vec());
}

async fn hydrate_trusted_devices_to_core() {
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

static MANAGER: Lazy<LanSyncManager> = Lazy::new(|| {
    LanSyncManager::new(LanSyncConfig {
        device_id: DEVICE_ID.clone(),
        device_name: Some(LOCAL_DEVICE_NAME.clone()),
        ..Default::default()
    })
});

static CHAT_RUNTIME: Lazy<tokio::sync::Mutex<ChatRuntime>> =
    Lazy::new(|| tokio::sync::Mutex::new(ChatRuntime::default()));
static FILE_HTTP_SERVER: Lazy<tokio::sync::Mutex<Option<FileHttpServerState>>> =
    Lazy::new(|| tokio::sync::Mutex::new(None));

fn get_local_file_http_port() -> u16 {
    crate::services::get_settings()
        .lan_sync_server_port
        .saturating_add(1)
}

async fn sync_core_file_http_port() {
    MANAGER.set_file_http_port(Some(get_local_file_http_port())).await;
}

fn emit_lan_chat_event(payload: serde_json::Value) {
    use tauri::Emitter;
    if let Some(app) = crate::services::clipboard::get_app_handle() {
        let _ = app.emit("lan-chat-event", payload);
    }
}

fn emit_file_state_event(
    transfer_id: &str,
    peer_device_id: &str,
    status: ChatTransferStatus,
    error: Option<&str>,
    files: Vec<serde_json::Value>,
) {
    emit_lan_chat_event(serde_json::json!({
        "type": "file_state",
        "transfer_id": transfer_id,
        "peer_device_id": peer_device_id,
        "status": status.as_str(),
        "error": error,
        "files": files,
    }));
}

fn emit_outgoing_state(transfer: &OutgoingChatTransfer, error: Option<&str>) {
    emit_file_state_event(
        &transfer.transfer_id,
        &transfer.to_device_id,
        transfer.status,
        error,
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

fn emit_incoming_offer_state(transfer: &IncomingChatTransfer, error: Option<&str>) {
    emit_file_state_event(
        &transfer.transfer_id,
        &transfer.from_device_id,
        transfer.status,
        error,
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

fn emit_incoming_receive_state(transfer: &IncomingReceiveProgress, error: Option<&str>) {
    emit_file_state_event(
        &transfer.transfer_id,
        &transfer.from_device_id,
        transfer.status,
        error,
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

fn build_file_decision_payload(
    event_type: &str,
    transfer_id: &str,
    from_device_id: &str,
    to_device_id: &str,
) -> serde_json::Value {
    serde_json::json!({
        "type": event_type,
        "decision": ChatFileDecisionPayload {
            transfer_id: transfer_id.to_string(),
            from_device_id: from_device_id.to_string(),
            to_device_id: to_device_id.to_string(),
            decided_at_ms: current_time_ms(),
        }
    })
}

fn build_file_done_payload(
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

fn emit_file_failed_event(transfer_id: &str, from_device_id: &str, to_device_id: &str, error: &str) {
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

async fn notify_peer_canceled(to_device_id: &str, transfer_id: &str) {
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

fn build_cancel_result(
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

async fn cleanup_transfers_for_device(device_id: &str, reason: &str) {
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

fn get_pair_secret(device_id: &str) -> Option<String> {
    load_trusted_devices()
        .into_iter()
        .find(|item| item.device_id == device_id)
        .map(|item| item.pair_secret)
}

fn compute_transfer_proof(pair_secret: &str, from_device_id: &str, transfer_id: &str) -> Result<String, String> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let message = format!("{from_device_id}:{transfer_id}");
    let mut mac =
        Hmac::<Sha256>::new_from_slice(pair_secret.as_bytes()).map_err(|e| e.to_string())?;
    mac.update(message.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn normalize_file_name(name: &str) -> String {
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

fn sanitize_relative_file_path(file_name: &str) -> PathBuf {
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

fn normalize_device_name(device_name: Option<String>) -> Option<String> {
    device_name.and_then(|name| {
        let normalized = name.trim().to_string();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    })
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

fn compute_blake3_file_hash_hex(path: &Path) -> Result<String, String> {
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

fn get_chat_receive_dir() -> Result<PathBuf, String> {
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

fn build_unique_file_path(base_dir: &Path, file_name: &str, reserved: &mut HashSet<String>) -> PathBuf {
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

async fn stop_file_http_server() {
    let mut state = FILE_HTTP_SERVER.lock().await;
    if let Some(server) = state.take() {
        server.task.abort();
    }
}

async fn ensure_file_http_server_started() -> Result<u16, String> {
    let port = get_local_file_http_port();
    sync_core_file_http_port().await;

    let mut state = FILE_HTTP_SERVER.lock().await;
    if let Some(server) = state.as_ref() {
        if server.port == port && !server.task.is_finished() {
            return Ok(port);
        }
    }

    if let Some(server) = state.take() {
        server.task.abort();
    }

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("文件 HTTP 服务启动失败: {e}"))?;
    let task = tokio::spawn(async move {
        loop {
            let Ok((stream, remote_addr)) = listener.accept().await else {
                break;
            };
            tokio::spawn(async move {
                let _ = handle_file_http_client(stream, remote_addr).await;
            });
        }
    });
    *state = Some(FileHttpServerState { port, task });
    Ok(port)
}

fn parse_http_query(target: &str) -> (String, HashMap<String, String>) {
    let mut query = HashMap::new();
    let mut parts = target.splitn(2, '?');
    let path = parts.next().unwrap_or("/").to_string();
    if let Some(raw_query) = parts.next() {
        for item in raw_query.split('&') {
            let mut kv = item.splitn(2, '=');
            let key = kv.next().unwrap_or("").trim();
            let value = kv.next().unwrap_or("").trim();
            if !key.is_empty() {
                query.insert(key.to_string(), value.to_string());
            }
        }
    }
    (path, query)
}

async fn read_file_http_request(
    stream: &mut tokio::net::TcpStream,
) -> Result<FileHttpRequest, String> {
    use tokio::io::AsyncReadExt;

    let mut buffer = Vec::with_capacity(4096);
    let mut chunk = vec![0u8; 2048];
    let header_end = loop {
        if buffer.len() > FILE_HTTP_HEADER_LIMIT {
            return Err("请求头过大".to_string());
        }
        let read = stream.read(&mut chunk).await.map_err(|e| e.to_string())?;
        if read == 0 {
            return Err("连接已关闭".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(pos) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
            break pos + 4;
        }
    };

    let header_text = String::from_utf8_lossy(&buffer[..header_end]).to_string();
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().ok_or_else(|| "请求格式错误".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("").to_string();
    if method.is_empty() || target.is_empty() {
        return Err("请求格式错误".to_string());
    }

    let mut content_length = 0usize;
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.splitn(2, ':');
        let name = parts.next().unwrap_or("").trim().to_ascii_lowercase();
        let value = parts.next().unwrap_or("").trim();
        if name == "content-length" {
            content_length = value.parse::<usize>().map_err(|_| "无效的 Content-Length".to_string())?;
        }
    }

    let (path, query) = parse_http_query(&target);
    Ok(FileHttpRequest {
        method,
        path,
        query,
        content_length,
        body_prefix: buffer[header_end..].to_vec(),
    })
}

async fn write_file_http_response(
    stream: &mut tokio::net::TcpStream,
    response: FileHttpResponse,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let status_text = match response.status_code {
        200 => "OK",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        500 => "Internal Server Error",
        _ => "OK",
    };
    let body_bytes = response.body.into_bytes();
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status_code,
        status_text,
        body_bytes.len()
    );
    stream
        .write_all(header.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&body_bytes)
        .await
        .map_err(|e| e.to_string())?;
    stream.flush().await.map_err(|e| e.to_string())
}

async fn handle_file_http_client(
    mut stream: tokio::net::TcpStream,
    remote_addr: std::net::SocketAddr,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;

    let request = read_file_http_request(&mut stream).await?;
    let remote_ip = Some(remote_addr.ip().to_string());
    let response = match (request.method.as_str(), request.path.as_str()) {
        ("POST", FILE_HTTP_PREPARE_PATH) => {
            let mut body_bytes = request.body_prefix.clone();
            if request.content_length > body_bytes.len() {
                let remaining = request.content_length - body_bytes.len();
                let mut extra = vec![0u8; remaining];
                stream.read_exact(&mut extra).await.map_err(|e| e.to_string())?;
                body_bytes.extend_from_slice(&extra);
            }
            let body = String::from_utf8(body_bytes).map_err(|_| "请求体编码错误".to_string())?;
            handle_http_prepare_upload(body, remote_ip).await
        }
        ("POST", FILE_HTTP_UPLOAD_PATH) => {
            handle_http_upload(&mut stream, request, remote_ip).await
        }
        ("POST", FILE_HTTP_CANCEL_PATH) => handle_http_cancel(request, remote_ip).await,
        _ => FileHttpResponse {
            status_code: 404,
            body: r#"{"message":"未找到接口"}"#.to_string(),
        },
    };
    write_file_http_response(&mut stream, response).await
}

pub fn device_id() -> String {
    DEVICE_ID.clone()
}

pub async fn get_snapshot() -> Snapshot {
    MANAGER.get_snapshot().await
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

fn is_image_content_type(content_type: &str) -> bool {
    content_type == "image"
}

fn split_image_ids(s: &str) -> impl Iterator<Item = &str> {
    s.split(',').map(|x| x.trim()).filter(|x| !x.is_empty())
}

fn local_image_file_exists(image_id: &str) -> bool {
    if let Ok(data_dir) = crate::services::get_data_directory() {
        let p = data_dir
            .join("clipboard_images")
            .join(format!("{}.png", image_id));
        return p.exists();
    }
    false
}

fn load_raw_formats_for_clipboard_item(clipboard_id: i64) -> Vec<ClipboardRawFormat> {
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

fn load_raw_formats_for_favorite_item(favorite_id: &str) -> Vec<ClipboardRawFormat> {
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

fn should_sync_record(record: &ClipboardRecord) -> bool {
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

pub async fn request_attachment(
    preferred_provider_device_id: Option<&str>,
    image_id: &str,
) -> Result<(), LanSyncError> {
    let snapshot = MANAGER.get_snapshot().await;
    if snapshot.server_port.is_some() && snapshot.server_connected_count > 0 {
        MANAGER
            .broadcast_attachment_request_excluding(
                &device_id(),
                preferred_provider_device_id,
                image_id,
                None,
            )
            .await
    } else {
        MANAGER
            .send_attachment_request(preferred_provider_device_id, image_id)
            .await
    }
}

pub async fn handle_attachment_request(requester_device_id: &str, image_id: &str) -> Result<(), LanSyncError> {
    if !local_image_file_exists(image_id) {
        return Ok(());
    }

    let snapshot = MANAGER.get_snapshot().await;
    let is_server_connected = snapshot.server_port.is_some() && snapshot.server_connected_count > 0;
    let is_client_connected = snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some();
    if !(is_server_connected || is_client_connected) {
        return Ok(());
    }

    let data_dir = crate::services::get_data_directory().map_err(|e| LanSyncError::Protocol(e))?;
    let images_dir = data_dir.join("clipboard_images");
    let path = images_dir.join(format!("{}.png", image_id));
    let Ok(bytes) = std::fs::read(&path) else {
        return Ok(());
    };

    let chunk_size: usize = 256 * 1024;
    let total_len = bytes.len() as u64;
    let mut offset: u64 = 0;
    while (offset as usize) < bytes.len() {
        let end = std::cmp::min(bytes.len(), offset as usize + chunk_size);
        let part = &bytes[offset as usize..end];

        if is_server_connected {
            MANAGER
                .broadcast_attachment_chunk_to(requester_device_id, image_id, total_len, offset, part)
                .await?;
        } else {
            MANAGER
                .send_attachment_chunk_to(requester_device_id, image_id, total_len, offset, part)
                .await?;
        }

        offset = end as u64;
    }

    Ok(())
}

pub async fn send_clipboard_record(record: ClipboardRecord) -> Result<(), LanSyncError> {
    if !should_sync_record(&record) {
        return Ok(());
    }

    let snapshot = MANAGER.get_snapshot().await;

    let is_server_connected = snapshot.server_port.is_some() && snapshot.server_connected_count > 0;
    let is_client_connected = snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some();

    if is_server_connected {
        MANAGER.broadcast_clipboard_record(record.clone()).await?;
    } else {
        MANAGER.send_clipboard_record(record.clone()).await?;
    }

    if !(is_server_connected || is_client_connected) {
        return Ok(());
    }

    let Some(image_ids) = record.image_id.clone().filter(|s| !s.trim().is_empty()) else {
        return Ok(());
    };

    let data_dir = crate::services::get_data_directory().map_err(|e| LanSyncError::Protocol(e))?;
    let images_dir = data_dir.join("clipboard_images");

    let chunk_size: usize = 256 * 1024;

    for image_id in split_image_ids(&image_ids) {
        let path = images_dir.join(format!("{}.png", image_id));
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };

        let total_len = bytes.len() as u64;
        let mut offset: u64 = 0;
        while (offset as usize) < bytes.len() {
            let end = std::cmp::min(bytes.len(), offset as usize + chunk_size);
            let part = &bytes[offset as usize..end];

            if is_server_connected {
                MANAGER
                    .broadcast_attachment_chunk(image_id, total_len, offset, part)
                    .await?;
            } else {
                MANAGER
                    .send_attachment_chunk(image_id, total_len, offset, part)
                    .await?;
            }

            offset = end as u64;
        }
    }

    Ok(())
}

pub async fn sync_clipboard_item(clipboard_id: i64) -> Result<String, LanSyncError> {
    let item = crate::services::database::get_clipboard_item_by_id(clipboard_id)
        .map_err(|e| LanSyncError::Protocol(e))?
        .ok_or_else(|| LanSyncError::Protocol("记录不存在".to_string()))?;

    let uuid = match item.uuid.clone().filter(|u| !u.trim().is_empty()) {
        Some(u) => u,
        None => crate::services::database::ensure_clipboard_item_uuid(clipboard_id)
            .map_err(|e| LanSyncError::Protocol(e))?,
    };

    let record = ClipboardRecord {
        uuid,
        source_device_id: device_id(),
        is_remote: false,
        content: item.content,
        html_content: item.html_content,
        content_type: item.content_type,
        image_id: item.image_id,
        source_app: item.source_app,
        source_icon_hash: item.source_icon_hash,
        char_count: item.char_count,
        raw_formats: load_raw_formats_for_clipboard_item(clipboard_id),
        created_at: item.created_at,
        updated_at: item.updated_at,
    };

    let snapshot = MANAGER.get_snapshot().await;

    if snapshot.server_port.is_some() && snapshot.server_connected_count > 0 {
        MANAGER.broadcast_clipboard_record(record).await?;
        return Ok("broadcast".to_string());
    }

    send_clipboard_record(record).await?;

    if snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some() {
        Ok("sent".to_string())
    } else {
        Ok("queued".to_string())
    }
}

pub async fn sync_favorite_item(favorite_id: String) -> Result<String, LanSyncError> {
    let item = crate::services::database::get_favorite_by_id(&favorite_id)
        .map_err(|e| LanSyncError::Protocol(e))?
        .ok_or_else(|| LanSyncError::Protocol("收藏项不存在".to_string()))?;

    let record = ClipboardRecord {
        uuid: format!("fav:{}", item.id),
        source_device_id: device_id(),
        is_remote: false,
        content: item.content,
        html_content: item.html_content,
        content_type: item.content_type,
        image_id: item.image_id,
        source_app: None,
        source_icon_hash: None,
        char_count: item.char_count,
        raw_formats: load_raw_formats_for_favorite_item(&favorite_id),
        created_at: item.created_at,
        updated_at: item.updated_at,
    };

    let snapshot = MANAGER.get_snapshot().await;

    if snapshot.server_port.is_some() && snapshot.server_connected_count > 0 {
        MANAGER.broadcast_clipboard_record(record).await?;
        return Ok("broadcast".to_string());
    }

    send_clipboard_record(record).await?;

    if snapshot.state == lan_sync_core::ConnectionState::Connected && snapshot.peer_url.is_some() {
        Ok("sent".to_string())
    } else {
        Ok("queued".to_string())
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

pub async fn chat_send_file_offer(input: ChatFileOfferInput) -> Result<ChatFileOfferPayload, LanSyncError> {
    if input.files.is_empty() {
        return Err(LanSyncError::Protocol("没有可发送的文件".to_string()));
    }

    let mut normalized_files = Vec::with_capacity(input.files.len());
    for f in &input.files {
        if f.file_path.trim().is_empty() {
            return Err(LanSyncError::Protocol("文件路径不能为空".to_string()));
        }
        let p = Path::new(&f.file_path);
        if !p.exists() {
            return Err(LanSyncError::Protocol(format!("文件不存在: {}", f.file_name)));
        }
        let meta = std::fs::metadata(p).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
        let file_hash = compute_blake3_file_hash_hex(p).map_err(LanSyncError::Protocol)?;
        normalized_files.push(ChatFileInfoInput {
            file_id: f.file_id.clone(),
            file_name: f.file_name.clone(),
            file_size: meta.len(),
            file_path: f.file_path.clone(),
            file_hash: Some(file_hash),
        });
    }

    let transfer_id = Uuid::new_v4().to_string();
    let now = current_time_ms();
    let expire_at_ms = now.saturating_add(CHAT_FILE_OFFER_EXPIRE_MS);
    let offer = ChatFileOfferPayload {
        transfer_id: transfer_id.clone(),
        from_device_id: device_id(),
        to_device_id: input.to_device_id.clone(),
        text: input.text.clone().filter(|s| !s.trim().is_empty()),
        files: input
            .files
            .iter()
            .enumerate()
            .map(|(idx, f)| ChatFileMeta {
                file_id: f.file_id.clone(),
                file_name: f.file_name.clone(),
                file_size: normalized_files
                    .get(idx)
                    .map(|x| x.file_size)
                    .unwrap_or(f.file_size),
                file_hash: normalized_files
                    .get(idx)
                    .and_then(|x| x.file_hash.clone()),
            })
        .collect(),
        sent_at_ms: now,
        expire_at_ms,
    };

    {
        let mut file_statuses = HashMap::new();
        let mut file_errors = HashMap::new();
        for file in &normalized_files {
            file_statuses.insert(file.file_id.clone(), ChatTransferFileStatus::Queue);
            file_errors.insert(file.file_id.clone(), None);
        }
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.insert(
            transfer_id.clone(),
            OutgoingChatTransfer {
                transfer_id: transfer_id.clone(),
                from_device_id: offer.from_device_id.clone(),
                to_device_id: offer.to_device_id.clone(),
                text: offer.text.clone(),
                files: normalized_files,
                sent_at_ms: now,
                expire_at_ms,
                status: ChatTransferStatus::WaitingAccept,
                file_statuses,
                file_errors,
            },
        );
    }

    if let Some(transfer) = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.get(&transfer_id).cloned()
    } {
        emit_outgoing_state(&transfer, None);
    }

    let offer_to_send = offer.clone();
    tauri::async_runtime::spawn(async move {
        let _ = negotiate_and_upload_chat_files(offer_to_send.transfer_id.clone()).await;
    });
    Ok(offer)
}

async fn negotiate_and_upload_chat_files(transfer_id: String) -> Result<(), String> {
    let outgoing = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.get(&transfer_id).cloned()
    }
    .ok_or_else(|| "传输任务不存在".to_string())?;

    if current_time_ms() > outgoing.expire_at_ms {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
            transfer.status = ChatTransferStatus::Expired;
            emit_outgoing_state(&transfer, Some("文件传输请求已过期"));
            emit_lan_chat_event(build_file_decision_payload(
                "file_expired",
                &transfer_id,
                &outgoing.to_device_id,
                &outgoing.from_device_id,
            ));
        }
        return Err("文件传输请求已过期".to_string());
    }

    let url = MANAGER
        .resolve_peer_file_server_url(&outgoing.to_device_id, FILE_HTTP_PREPARE_PATH, &[])
        .await
        .ok_or_else(|| "未找到对端文件服务".to_string())?;
    let pair_secret = get_pair_secret(&outgoing.to_device_id)
        .ok_or_else(|| "未保存对端配对信息".to_string())?;
    let proof = compute_transfer_proof(&pair_secret, &outgoing.from_device_id, &outgoing.transfer_id)?;

    let mut payload = serde_json::Map::new();
    payload.insert("transfer_id".to_string(), serde_json::json!(outgoing.transfer_id));
    payload.insert("from_device_id".to_string(), serde_json::json!(outgoing.from_device_id));
    payload.insert("to_device_id".to_string(), serde_json::json!(outgoing.to_device_id));
    if let Some(text) = outgoing.text.as_ref().filter(|value| !value.trim().is_empty()) {
        payload.insert("text".to_string(), serde_json::json!(text));
    }
    payload.insert("sent_at_ms".to_string(), serde_json::json!(outgoing.sent_at_ms));
    payload.insert("expire_at_ms".to_string(), serde_json::json!(outgoing.expire_at_ms));
    payload.insert("proof".to_string(), serde_json::json!(proof));
    payload.insert(
        "files".to_string(),
        serde_json::json!(outgoing.files.iter().map(|file| {
            serde_json::json!({
                "file_id": file.file_id,
                "file_name": file.file_name,
                "file_size": file.file_size,
                "file_hash": file.file_hash,
            })
        }).collect::<Vec<_>>()),
    );
    let payload = serde_json::Value::Object(payload);

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status() == reqwest::StatusCode::FORBIDDEN {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::Rejected;
            emit_outgoing_state(&transfer, Some("接收方已拒绝"));
            emit_lan_chat_event(build_file_decision_payload(
                "file_reject",
                &transfer_id,
                &outgoing.to_device_id,
                &outgoing.from_device_id,
            ));
        }
        return Err("接收方已拒绝".to_string());
    }

    if response.status() == reqwest::StatusCode::CONFLICT {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::CanceledByReceiver;
            for file in &transfer.files {
                transfer
                    .file_statuses
                    .insert(file.file_id.clone(), ChatTransferFileStatus::Canceled);
                transfer
                    .file_errors
                    .insert(file.file_id.clone(), Some("接收方已取消".to_string()));
            }
            emit_outgoing_state(&transfer, Some("接收方已取消"));
        }
        return Err("接收方已取消".to_string());
    }

    if !response.status().is_success() {
        let message = response.text().await.unwrap_or_else(|_| "文件协商失败".to_string());
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::Failed;
            for file in &transfer.files {
                transfer
                    .file_statuses
                    .insert(file.file_id.clone(), ChatTransferFileStatus::Failed);
                transfer
                    .file_errors
                    .insert(file.file_id.clone(), Some(message.clone()));
            }
            emit_outgoing_state(&transfer, Some(&message));
            emit_file_failed_event(
                &transfer_id,
                &transfer.from_device_id,
                &transfer.to_device_id,
                &message,
            );
        }
        return Err(message);
    }

    let body = response.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let mut accepted_files = HashMap::new();
    if let Some(files) = json.get("files").and_then(|value| value.as_array()) {
        for item in files {
            let file_id = item
                .get("file_id")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            let upload_token = item
                .get("upload_token")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            if !file_id.is_empty() && !upload_token.is_empty() {
                accepted_files.insert(file_id.to_string(), upload_token.to_string());
            }
        }
    }

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(mut transfer) = runtime.outgoing_waiting_accept.remove(&transfer_id) {
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer.status = ChatTransferStatus::Transferring;
            emit_outgoing_state(&transfer, None);
            runtime.outgoing_sending.insert(transfer_id.clone(), transfer);
        } else {
            return Ok(());
        }
    }
    emit_lan_chat_event(build_file_decision_payload(
        "file_accept",
        &transfer_id,
        &outgoing.to_device_id,
        &outgoing.from_device_id,
    ));

    let total_size = outgoing.files.iter().map(|file| file.file_size).sum::<u64>();
    let mut sent_size = 0u64;
    let mut has_failed_file = false;

    for file in &outgoing.files {
        let token = accepted_files
            .get(&file.file_id)
            .cloned()
            .ok_or_else(|| format!("缺少文件上传令牌: {}", file.file_name))?;
        {
            let mut runtime = CHAT_RUNTIME.lock().await;
            let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) else {
                return Ok(());
            };
            if transfer.status.is_canceled() {
                return Ok(());
            }
            transfer
                .file_statuses
                .insert(file.file_id.clone(), ChatTransferFileStatus::Transferring);
            transfer.file_errors.insert(file.file_id.clone(), None);
            emit_outgoing_state(transfer, None);
        }
        let file_id = file.file_id.clone();
        let file_name = file.file_name.clone();
        let file_size = file.file_size;
        let upload_url = MANAGER
            .resolve_peer_file_server_url(
                &outgoing.to_device_id,
                FILE_HTTP_UPLOAD_PATH,
                &[
                    ("transfer_id".to_string(), outgoing.transfer_id.clone()),
                    ("file_id".to_string(), file_id),
                    ("token".to_string(), token),
                ],
            )
            .await
            .ok_or_else(|| "未找到对端文件上传地址".to_string())?;

        let file_path = file.file_path.clone();
        let transfer_id_for_emit = outgoing.transfer_id.clone();
        let from_device_id_for_emit = outgoing.from_device_id.clone();
        let to_device_id_for_emit = outgoing.to_device_id.clone();
        let sent_size_before = sent_size;
        let upload_result = tauri::async_runtime::spawn_blocking(move || -> Result<u64, String> {
            use std::io::Read;

            struct ProgressReader {
                inner: std::fs::File,
                transfer_id: String,
                sent_base: u64,
                sent_total: u64,
                total_size: u64,
            }

            impl Read for ProgressReader {
                fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                    let read = self.inner.read(buf)?;
                    if read > 0 {
                        self.sent_total = self.sent_total.saturating_add(read as u64);
                        emit_lan_chat_event(serde_json::json!({
                            "type": "file_progress",
                            "transfer_id": self.transfer_id,
                            "sent_size": self.sent_base.saturating_add(self.sent_total),
                            "total_size": self.total_size,
                        }));
                    }
                    Ok(read)
                }
            }

            let raw_file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
            let reader = ProgressReader {
                inner: raw_file,
                transfer_id: transfer_id_for_emit,
                sent_base: sent_size_before,
                sent_total: 0,
                total_size,
            };

            let response = reqwest::blocking::Client::new()
                .post(upload_url)
                .header(reqwest::header::CONTENT_LENGTH, file_size)
                .body(reqwest::blocking::Body::new(reader))
                .send()
                .map_err(|e| e.to_string())?;

            if !response.status().is_success() {
                return Err(
                    response
                        .text()
                        .unwrap_or_else(|_| format!("文件上传失败: {file_name}")),
                );
            }

            Ok(file_size)
        })
        .await
        .map_err(|e| e.to_string())?;

        match upload_result {
            Ok(uploaded) => {
                sent_size = sent_size.saturating_add(uploaded);
                let mut runtime = CHAT_RUNTIME.lock().await;
                if let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) {
                    transfer
                        .file_statuses
                        .insert(file.file_id.clone(), ChatTransferFileStatus::Done);
                    transfer.file_errors.insert(file.file_id.clone(), None);
                    emit_outgoing_state(transfer, None);
                }
            }
            Err(error) => {
                has_failed_file = true;
                let mut runtime = CHAT_RUNTIME.lock().await;
                if let Some(transfer) = runtime.outgoing_sending.get_mut(&transfer_id) {
                    if transfer.status.is_canceled() {
                        return Ok(());
                    }
                    transfer
                        .file_statuses
                        .insert(file.file_id.clone(), ChatTransferFileStatus::Failed);
                    transfer
                        .file_errors
                        .insert(file.file_id.clone(), Some(error.clone()));
                    emit_outgoing_state(transfer, Some(&error));
                }
                emit_file_failed_event(&transfer_id, &from_device_id_for_emit, &to_device_id_for_emit, &error);
            }
        }
    }

    let mut runtime = CHAT_RUNTIME.lock().await;
    if let Some(mut transfer) = runtime.outgoing_sending.remove(&transfer_id) {
        if transfer.status.is_canceled() {
            return Ok(());
        }
        transfer.status = if has_failed_file {
            ChatTransferStatus::Partial
        } else {
            ChatTransferStatus::Done
        };
        emit_outgoing_state(&transfer, None);
        emit_lan_chat_event(build_file_done_payload(
            &transfer_id,
            &transfer.from_device_id,
            &transfer.to_device_id,
            None,
        ));
    }
    Ok(())
}

async fn handle_http_prepare_upload(body: String, remote_ip: Option<String>) -> FileHttpResponse {
    let json: serde_json::Value = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(_) => {
            return FileHttpResponse {
                status_code: 400,
                body: r#"{"message":"请求体格式错误"}"#.to_string(),
            };
        }
    };

    let transfer_id = json.get("transfer_id").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    let from_device_id = json.get("from_device_id").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    let to_device_id = json.get("to_device_id").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();
    let proof = json.get("proof").and_then(|value| value.as_str()).unwrap_or("").trim().to_string();

    if transfer_id.is_empty() || from_device_id.is_empty() || to_device_id.is_empty() || proof.is_empty() {
        return FileHttpResponse {
            status_code: 400,
            body: r#"{"message":"缺少必要参数"}"#.to_string(),
        };
    }
    if to_device_id != device_id() {
        return FileHttpResponse {
            status_code: 403,
            body: r#"{"message":"目标设备不匹配"}"#.to_string(),
        };
    }

    let Some(pair_secret) = get_pair_secret(&from_device_id) else {
        return FileHttpResponse {
            status_code: 403,
            body: r#"{"message":"未保存对端配对信息"}"#.to_string(),
        };
    };

    let Ok(expected_proof) = compute_transfer_proof(&pair_secret, &from_device_id, &transfer_id) else {
        return FileHttpResponse {
            status_code: 403,
            body: r#"{"message":"传输鉴权失败"}"#.to_string(),
        };
    };
    if !expected_proof.eq_ignore_ascii_case(&proof) {
        return FileHttpResponse {
            status_code: 403,
            body: r#"{"message":"传输鉴权失败"}"#.to_string(),
        };
    }

    let files = json
        .get("files")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            let file_id = item.get("file_id")?.as_str()?.trim().to_string();
            let file_name = item.get("file_name")?.as_str()?.trim().to_string();
            let file_size = item.get("file_size")?.as_u64()?;
            if file_id.is_empty() || file_name.is_empty() {
                return None;
            }
            Some(ChatFileMeta {
                file_id,
                file_name,
                file_size,
                file_hash: item
                    .get("file_hash")
                    .and_then(|value| value.as_str())
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
            })
        })
        .collect::<Vec<_>>();

    if files.is_empty() {
        return FileHttpResponse {
            status_code: 400,
            body: r#"{"message":"未包含文件"}"#.to_string(),
        };
    }

    let sent_at_ms = json
        .get("sent_at_ms")
        .and_then(|value| value.as_u64())
        .unwrap_or_else(current_time_ms);
    let expire_at_ms = json
        .get("expire_at_ms")
        .and_then(|value| value.as_u64())
        .unwrap_or_else(|| current_time_ms().saturating_add(CHAT_FILE_OFFER_EXPIRE_MS));
    let text = json
        .get("text")
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let offer = ChatFileOfferPayload {
        transfer_id: transfer_id.clone(),
        from_device_id: from_device_id.clone(),
        to_device_id: to_device_id.clone(),
        text: text.clone(),
        files: files.clone(),
        sent_at_ms,
        expire_at_ms,
    };

    let (decision_tx, decision_rx) = tokio::sync::oneshot::channel();
    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_waiting_decision.insert(
            transfer_id.clone(),
            IncomingChatTransfer {
                transfer_id: transfer_id.clone(),
                from_device_id: from_device_id.clone(),
                to_device_id: to_device_id.clone(),
                text: json
                    .get("text")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
                    .filter(|value| !value.trim().is_empty()),
                files: files.clone(),
                sent_at_ms: json
                    .get("sent_at_ms")
                    .and_then(|value| value.as_u64())
                    .unwrap_or_else(current_time_ms),
                expire_at_ms,
                status: ChatTransferStatus::WaitingAccept,
            },
        );
        runtime
            .incoming_decision_senders
            .insert(transfer_id.clone(), decision_tx);
    }

    if let Some(ip) = remote_ip {
        MANAGER
            .remember_peer_file_server(&from_device_id, Some(ip), None)
            .await;
    }

    if let Some(transfer) = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_waiting_decision.get(&transfer_id).cloned()
    } {
        emit_incoming_offer_state(&transfer, None);
    }
    emit_lan_chat_event(serde_json::json!({
        "type": "file_offer",
        "offer": offer
    }));

    let now = current_time_ms();
    let wait_ms = expire_at_ms.saturating_sub(now).max(1);
    let decision = match tokio::time::timeout(Duration::from_millis(wait_ms), decision_rx).await {
        Ok(Ok(value)) => value,
        _ => IncomingDecision::Reject,
    };

    let incoming = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_decision_senders.remove(&transfer_id);
        runtime.incoming_waiting_decision.remove(&transfer_id)
    };
    let Some(incoming) = incoming else {
        return FileHttpResponse {
            status_code: 409,
            body: r#"{"message":"传输会话不存在"}"#.to_string(),
        };
    };

    if decision != IncomingDecision::Accept {
        let (event_type, next_status, error_message) = if current_time_ms() > incoming.expire_at_ms {
            ("file_expired", ChatTransferStatus::Expired, "文件传输请求已过期")
        } else if decision == IncomingDecision::CancelByReceiver {
            ("file_state", ChatTransferStatus::CanceledByReceiver, "已取消接收")
        } else {
            ("file_reject", ChatTransferStatus::Rejected, "文件传输请求已拒绝")
        };
        let mut incoming = incoming;
        incoming.status = next_status;
        emit_incoming_offer_state(&incoming, Some(error_message));
        if event_type != "file_state" {
            emit_lan_chat_event(build_file_decision_payload(
                event_type,
                &incoming.transfer_id,
                &incoming.from_device_id,
                &incoming.to_device_id,
            ));
        }
        return FileHttpResponse {
            status_code: if decision == IncomingDecision::CancelByReceiver { 409 } else { 403 },
            body: format!(
                r#"{{"message":"{}"}}"#,
                if event_type == "file_expired" {
                    "文件传输请求已过期"
                } else if decision == IncomingDecision::CancelByReceiver {
                    "接收方已取消"
                } else {
                    "文件传输请求已拒绝"
                }
            ),
        };
    }

    let receive_dir = match get_chat_receive_dir() {
        Ok(dir) => dir,
        Err(error) => {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.replace('"', "'")),
            };
        }
    };

    let mut files_state = Vec::with_capacity(incoming.files.len());
    let mut reserved_names: HashSet<String> = HashSet::new();
    let mut total_size = 0u64;
    let mut accepted_files = Vec::with_capacity(incoming.files.len());
    for file in &incoming.files {
        let file_path = build_unique_file_path(&receive_dir, &file.file_name, &mut reserved_names);
        let upload_token = Uuid::new_v4().to_string();
        files_state.push(ReceiveFileProgress {
            file_id: file.file_id.clone(),
            file_name: file.file_name.clone(),
            file_size: file.file_size,
            file_hash: file.file_hash.clone(),
            upload_token: Some(upload_token.clone()),
            received: 0,
            received_ranges: Vec::new(),
            covered_size: 0,
            file_path,
            status: ChatTransferFileStatus::Queue,
            error_message: None,
        });
        accepted_files.push(serde_json::json!({
            "file_id": file.file_id,
            "upload_token": upload_token,
        }));
        total_size = total_size.saturating_add(file.file_size);
    }

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_receiving.insert(
            transfer_id.clone(),
            IncomingReceiveProgress {
                transfer_id: transfer_id.clone(),
                from_device_id: incoming.from_device_id.clone(),
                to_device_id: incoming.to_device_id.clone(),
                text: incoming.text.clone(),
                sent_at_ms: incoming.sent_at_ms,
                files: files_state,
                total_size,
                received_size: 0,
                status: ChatTransferStatus::Transferring,
            },
        );
    }

    if let Some(state) = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_receiving.get(&transfer_id).cloned()
    } {
        emit_incoming_receive_state(&state, None);
    }

    emit_lan_chat_event(build_file_decision_payload(
        "file_accept",
        &transfer_id,
        &incoming.from_device_id,
        &incoming.to_device_id,
    ));

    FileHttpResponse {
        status_code: 200,
        body: serde_json::json!({
            "transfer_id": transfer_id,
            "files": accepted_files
        })
        .to_string(),
    }
}

async fn handle_http_upload(
    stream: &mut tokio::net::TcpStream,
    request: FileHttpRequest,
    _remote_ip: Option<String>,
) -> FileHttpResponse {
    use tokio::io::AsyncReadExt;
    use std::io::Write;

    let transfer_id = request.query.get("transfer_id").cloned().unwrap_or_default();
    let file_id = request.query.get("file_id").cloned().unwrap_or_default();
    let token = request.query.get("token").cloned().unwrap_or_default();
    if transfer_id.trim().is_empty() || file_id.trim().is_empty() || token.trim().is_empty() {
        return FileHttpResponse {
            status_code: 400,
            body: r#"{"message":"缺少上传参数"}"#.to_string(),
        };
    }

    let (file_path, expected_size, expected_hash, from_device_id, to_device_id, total_size, received_before) = {
        let runtime = CHAT_RUNTIME.lock().await;
        let Some(state) = runtime.incoming_receiving.get(&transfer_id) else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输会话不存在"}"#.to_string(),
            };
        };
        let Some(file_state) = state
            .files
            .iter()
            .find(|file| file.file_id == file_id && file.upload_token.as_deref() == Some(token.as_str()))
        else {
            return FileHttpResponse {
                status_code: 403,
                body: r#"{"message":"文件令牌无效"}"#.to_string(),
            };
        };
        (
            file_state.file_path.clone(),
            file_state.file_size,
            file_state.file_hash.clone(),
            state.from_device_id.clone(),
            state.to_device_id.clone(),
            state.total_size,
            state.received_size,
        )
    };

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) {
            state.status = ChatTransferStatus::Transferring;
            if let Some(file_state) = state.files.iter_mut().find(|file| file.file_id == file_id) {
                file_state.status = ChatTransferFileStatus::Transferring;
                file_state.error_message = None;
            }
            emit_incoming_receive_state(state, None);
        }
    }

    if let Some(parent) = file_path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
            };
        }
    }

    let mut file = match std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&file_path)
    {
        Ok(file) => file,
        Err(error) => {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
            };
        }
    };

    let mut written = 0u64;
    let mut remaining = request.content_length;
    let mut body_prefix = request.body_prefix;
    if !body_prefix.is_empty() {
        let writable = std::cmp::min(body_prefix.len(), remaining);
        if let Err(error) = file.write_all(&body_prefix[..writable]) {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
            };
        }
        written = written.saturating_add(writable as u64);
        remaining -= writable;
        body_prefix.clear();
        emit_lan_chat_event(serde_json::json!({
            "type": "file_progress",
            "transfer_id": transfer_id,
            "received_size": received_before.saturating_add(written),
            "total_size": total_size
        }));
    }

    let mut buffer = vec![0u8; FILE_HTTP_IO_BUFFER_SIZE];
    while remaining > 0 {
        let to_read = std::cmp::min(buffer.len(), remaining);
        let read = match stream.read(&mut buffer[..to_read]).await {
            Ok(size) => size,
            Err(error) => {
                return FileHttpResponse {
                    status_code: 500,
                    body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
                };
            }
        };
        if read == 0 {
            break;
        }
        if let Err(error) = file.write_all(&buffer[..read]) {
            return FileHttpResponse {
                status_code: 500,
                body: format!(r#"{{"message":"{}"}}"#, error.to_string().replace('"', "'")),
            };
        }
        written = written.saturating_add(read as u64);
        remaining -= read;
        emit_lan_chat_event(serde_json::json!({
            "type": "file_progress",
            "transfer_id": transfer_id,
            "received_size": received_before.saturating_add(written),
            "total_size": total_size
        }));
    }

    if written != expected_size {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) {
            state.status = ChatTransferStatus::Failed;
            if let Some(file_state) = state.files.iter_mut().find(|file| file.file_id == file_id) {
                file_state.status = ChatTransferFileStatus::Failed;
                file_state.error_message = Some("文件上传不完整".to_string());
            }
            emit_incoming_receive_state(state, Some("文件上传不完整"));
        }
        runtime.incoming_receiving.remove(&transfer_id);
        emit_file_failed_event(&transfer_id, &from_device_id, &to_device_id, "文件上传不完整");
        return FileHttpResponse {
            status_code: 500,
            body: r#"{"message":"文件上传不完整"}"#.to_string(),
        };
    }

    if let Some(expected_hash) = expected_hash.filter(|value| !value.trim().is_empty()) {
        match compute_blake3_file_hash_hex(&file_path) {
            Ok(actual_hash) if actual_hash.eq_ignore_ascii_case(&expected_hash) => {}
            Ok(_) => {
                let mut runtime = CHAT_RUNTIME.lock().await;
                if let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) {
                    state.status = ChatTransferStatus::Failed;
                    if let Some(file_state) = state.files.iter_mut().find(|file| file.file_id == file_id) {
                        file_state.status = ChatTransferFileStatus::Failed;
                        file_state.error_message = Some("文件校验失败".to_string());
                    }
                    emit_incoming_receive_state(state, Some("文件校验失败"));
                }
                runtime.incoming_receiving.remove(&transfer_id);
                emit_file_failed_event(&transfer_id, &from_device_id, &to_device_id, "文件校验失败");
                return FileHttpResponse {
                    status_code: 500,
                    body: r#"{"message":"文件校验失败"}"#.to_string(),
                };
            }
            Err(error) => {
                let mut runtime = CHAT_RUNTIME.lock().await;
                if let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) {
                    state.status = ChatTransferStatus::Failed;
                    if let Some(file_state) = state.files.iter_mut().find(|file| file.file_id == file_id) {
                        file_state.status = ChatTransferFileStatus::Failed;
                        file_state.error_message = Some(error.clone());
                    }
                    emit_incoming_receive_state(state, Some(&error));
                }
                runtime.incoming_receiving.remove(&transfer_id);
                emit_file_failed_event(&transfer_id, &from_device_id, &to_device_id, &error);
                return FileHttpResponse {
                    status_code: 500,
                    body: format!(r#"{{"message":"{}"}}"#, error.replace('"', "'")),
                };
            }
        }
    }

    let completed_paths = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输会话不存在"}"#.to_string(),
            };
        };

        let Some(file_state) = state.files.iter_mut().find(|file| file.file_id == file_id) else {
            return FileHttpResponse {
                status_code: 409,
                body: r#"{"message":"传输文件不存在"}"#.to_string(),
            };
        };

        let previous_received = file_state.received;
        file_state.received = written;
        file_state.covered_size = written;
        file_state.received_ranges = vec![(0, written)];
        file_state.status = ChatTransferFileStatus::Done;
        file_state.error_message = None;
        state.received_size = state
            .received_size
            .saturating_add(file_state.received.saturating_sub(previous_received));

        emit_incoming_receive_state(state, None);

        if state
            .files
            .iter()
            .all(|file| matches!(file.status, ChatTransferFileStatus::Done | ChatTransferFileStatus::Failed))
        {
            state.status = if state
                .files
                .iter()
                .any(|file| file.status == ChatTransferFileStatus::Failed)
            {
                ChatTransferStatus::Partial
            } else {
                ChatTransferStatus::Done
            };
            emit_incoming_receive_state(state, None);
            let paths = state
                .files
                .iter()
                .map(|file| file.file_path.to_string_lossy().to_string())
                .collect::<Vec<_>>();
            runtime.incoming_receiving.remove(&transfer_id);
            Some(paths)
        } else {
            None
        }
    };

    if let Some(paths) = completed_paths {
        emit_lan_chat_event(build_file_done_payload(
            &transfer_id,
            &from_device_id,
            &to_device_id,
            Some(paths),
        ));
    }

    FileHttpResponse {
        status_code: 200,
        body: r#"{"ok":true}"#.to_string(),
    }
}

async fn handle_http_cancel(request: FileHttpRequest, _remote_ip: Option<String>) -> FileHttpResponse {
    let transfer_id = request.query.get("transfer_id").cloned().unwrap_or_default();
    if transfer_id.trim().is_empty() {
        return FileHttpResponse {
            status_code: 400,
            body: r#"{"message":"缺少 transfer_id"}"#.to_string(),
        };
    }

    let (outgoing, incoming_offer, incoming_receive, decision_sender) = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        (
            runtime
                .outgoing_waiting_accept
                .remove(&transfer_id)
                .or_else(|| runtime.outgoing_sending.remove(&transfer_id)),
            runtime.incoming_waiting_decision.remove(&transfer_id),
            runtime.incoming_receiving.remove(&transfer_id),
            runtime.incoming_decision_senders.remove(&transfer_id),
        )
    };

    if let Some(sender) = decision_sender {
        let _ = sender.send(IncomingDecision::Reject);
    }

    if let Some(mut transfer) = outgoing {
        transfer.status = ChatTransferStatus::CanceledByReceiver;
        for file in &transfer.files {
            let current = transfer
                .file_statuses
                .get(&file.file_id)
                .copied()
                .unwrap_or(ChatTransferFileStatus::Queue);
            if current != ChatTransferFileStatus::Done {
                transfer
                    .file_statuses
                    .insert(file.file_id.clone(), ChatTransferFileStatus::Canceled);
                transfer
                    .file_errors
                    .insert(file.file_id.clone(), Some("接收方已取消".to_string()));
            }
        }
        emit_outgoing_state(&transfer, Some("接收方已取消"));
    }
    if let Some(mut transfer) = incoming_offer {
        transfer.status = ChatTransferStatus::CanceledBySender;
        emit_incoming_offer_state(&transfer, Some("发送方已取消"));
    }
    if let Some(mut transfer) = incoming_receive {
        transfer.status = ChatTransferStatus::CanceledBySender;
        for file in &mut transfer.files {
            if file.status != ChatTransferFileStatus::Done {
                file.status = ChatTransferFileStatus::Canceled;
                file.error_message = Some("发送方已取消".to_string());
            }
        }
        emit_incoming_receive_state(&transfer, Some("发送方已取消"));
    }

    FileHttpResponse {
        status_code: 200,
        body: r#"{"ok":true}"#.to_string(),
    }
}

pub async fn chat_prepare_files(paths: Vec<String>) -> Result<Vec<ChatFileInfoInput>, LanSyncError> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }

    fn normalize_rel_path(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    fn collect_files_in_directory(dir_path: &Path) -> Result<Vec<(PathBuf, String)>, LanSyncError> {
        let root_name = dir_path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "文件夹".to_string());

        let mut out: Vec<(PathBuf, String)> = Vec::new();
        let mut stack: Vec<PathBuf> = vec![dir_path.to_path_buf()];

        while let Some(current_dir) = stack.pop() {
            let entries = std::fs::read_dir(&current_dir)
                .map_err(|e| LanSyncError::Protocol(e.to_string()))?;

            for entry in entries {
                let entry = entry.map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                let path = entry.path();
                let meta = std::fs::symlink_metadata(&path)
                    .map_err(|e| LanSyncError::Protocol(e.to_string()))?;

                // 跳过符号链接，避免循环引用或跨目录意外遍历
                if meta.file_type().is_symlink() {
                    continue;
                }

                if meta.is_dir() {
                    stack.push(path);
                    continue;
                }

                if !meta.is_file() {
                    continue;
                }

                let relative = path
                    .strip_prefix(dir_path)
                    .map(normalize_rel_path)
                    .unwrap_or_else(|_| {
                        path.file_name()
                            .and_then(|s| s.to_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| "未命名文件".to_string())
                    });

                let display_name = if relative.is_empty() {
                    root_name.clone()
                } else {
                    format!("{}/{}", root_name, relative)
                };

                out.push((path, display_name));
            }
        }

        Ok(out)
    }

    let mut out = Vec::new();
    for path in paths {
        let p = Path::new(&path);
        if !p.exists() {
            continue;
        }

        if p.is_file() {
            let meta = std::fs::metadata(p).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
            let file_name = p
                .file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "未命名文件".to_string());

            out.push(ChatFileInfoInput {
                file_id: Uuid::new_v4().to_string(),
                file_name,
                file_size: meta.len(),
                file_path: path,
                file_hash: None,
            });
            continue;
        }

        if p.is_dir() {
            let files = collect_files_in_directory(p)?;
            for (file_path, display_name) in files {
                let meta = std::fs::metadata(&file_path)
                    .map_err(|e| LanSyncError::Protocol(e.to_string()))?;
                out.push(ChatFileInfoInput {
                    file_id: Uuid::new_v4().to_string(),
                    file_name: display_name,
                    file_size: meta.len(),
                    file_path: file_path.to_string_lossy().to_string(),
                    file_hash: None,
                });
            }
        }
    }

    Ok(out)
}

pub async fn chat_reject_file_offer(input: ChatFileRejectInput) -> Result<ChatFileDecisionPayload, LanSyncError> {
    let decision = ChatFileDecisionPayload {
        transfer_id: input.transfer_id.clone(),
        from_device_id: device_id(),
        to_device_id: input.from_device_id.clone(),
        decided_at_ms: current_time_ms(),
    };

    let (transfer, sender) = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        (
            runtime.incoming_waiting_decision.remove(&input.transfer_id),
            runtime.incoming_decision_senders.remove(&input.transfer_id),
        )
    };
    if let Some(mut transfer) = transfer {
        transfer.status = ChatTransferStatus::Rejected;
        emit_incoming_offer_state(&transfer, Some("文件传输请求已拒绝"));
    }
    if let Some(sender) = sender {
        let _ = sender.send(IncomingDecision::Reject);
    }
    Ok(decision)
}

pub async fn chat_accept_file_offer(input: ChatFileAcceptInput) -> Result<ChatFileDecisionPayload, LanSyncError> {
    let expired = {
        let runtime = CHAT_RUNTIME.lock().await;
        runtime
            .incoming_waiting_decision
            .get(&input.transfer_id)
            .map(|item| current_time_ms() > item.expire_at_ms)
            .unwrap_or(true)
    };

    if expired {
        return Err(LanSyncError::Protocol("文件邀约已过期".to_string()));
    }

    let sender = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        if let Some(transfer) = runtime.incoming_waiting_decision.get_mut(&input.transfer_id) {
            transfer.status = ChatTransferStatus::Transferring;
            emit_incoming_offer_state(transfer, None);
        }
        runtime.incoming_decision_senders.remove(&input.transfer_id)
    };

    let Some(sender) = sender else {
        return Err(LanSyncError::Protocol("文件邀约不存在或已处理".to_string()));
    };
    let _ = sender.send(IncomingDecision::Accept);

    let decision = ChatFileDecisionPayload {
        transfer_id: input.transfer_id,
        from_device_id: device_id(),
        to_device_id: input.from_device_id,
        decided_at_ms: current_time_ms(),
    };

    Ok(decision)
}

pub async fn chat_cancel_transfer(input: ChatFileCancelInput) -> Result<ChatFileCancelResult, LanSyncError> {
    let transfer_id = input.transfer_id.trim().to_string();
    if transfer_id.is_empty() {
        return Err(LanSyncError::Protocol("transfer_id 不能为空".to_string()));
    }

    let outgoing = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime
            .outgoing_waiting_accept
            .remove(&transfer_id)
            .or_else(|| runtime.outgoing_sending.remove(&transfer_id))
    };
    if let Some(mut transfer) = outgoing {
        transfer.status = ChatTransferStatus::CanceledBySender;
        for file in &transfer.files {
            let current = transfer
                .file_statuses
                .get(&file.file_id)
                .copied()
                .unwrap_or(ChatTransferFileStatus::Queue);
            if current != ChatTransferFileStatus::Done {
                transfer
                    .file_statuses
                    .insert(file.file_id.clone(), ChatTransferFileStatus::Canceled);
                transfer
                    .file_errors
                    .insert(file.file_id.clone(), Some("已取消发送".to_string()));
            }
        }
        emit_outgoing_state(&transfer, Some("已取消发送"));
        notify_peer_canceled(&transfer.to_device_id, &transfer_id).await;
        return Ok(build_cancel_result(
            transfer_id,
            transfer.to_device_id,
            ChatTransferStatus::CanceledBySender,
        ));
    }

    let (incoming_offer, decision_sender) = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        (
            runtime.incoming_waiting_decision.remove(&transfer_id),
            runtime.incoming_decision_senders.remove(&transfer_id),
        )
    };
    if let Some(mut transfer) = incoming_offer {
        transfer.status = ChatTransferStatus::CanceledByReceiver;
        emit_incoming_offer_state(&transfer, Some("已取消接收"));
        if let Some(sender) = decision_sender {
            let _ = sender.send(IncomingDecision::CancelByReceiver);
        }
        notify_peer_canceled(&transfer.from_device_id, &transfer_id).await;
        return Ok(build_cancel_result(
            transfer_id,
            transfer.from_device_id,
            ChatTransferStatus::CanceledByReceiver,
        ));
    }

    let incoming_receive = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_receiving.remove(&transfer_id)
    };
    if let Some(mut transfer) = incoming_receive {
        transfer.status = ChatTransferStatus::CanceledByReceiver;
        for file in &mut transfer.files {
            if file.status != ChatTransferFileStatus::Done {
                file.status = ChatTransferFileStatus::Canceled;
                file.error_message = Some("已取消接收".to_string());
            }
        }
        emit_incoming_receive_state(&transfer, Some("已取消接收"));
        notify_peer_canceled(&transfer.from_device_id, &transfer_id).await;
        return Ok(build_cancel_result(
            transfer_id,
            transfer.from_device_id,
            ChatTransferStatus::CanceledByReceiver,
        ));
    }

    if let Some(peer_device_id) = input.peer_device_id.filter(|value| !value.trim().is_empty()) {
        return Ok(build_cancel_result(
            transfer_id,
            peer_device_id,
            ChatTransferStatus::CanceledBySender,
        ));
    }

    Err(LanSyncError::Protocol("传输不存在或已结束".to_string()))
}

pub async fn chat_reveal_file(path: &str) -> Result<(), LanSyncError> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(LanSyncError::Protocol("文件不存在".to_string()));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(p)
            .spawn()
            .map_err(|e| LanSyncError::Protocol(format!("打开文件位置失败: {}", e)))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    {
        let parent = p.parent().ok_or_else(|| LanSyncError::Protocol("无效路径".to_string()))?;
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| LanSyncError::Protocol(format!("打开目录失败: {}", e)))?;
        Ok(())
    }
}

pub async fn subscribe() -> tokio::sync::broadcast::Receiver<CoreEvent> {
    MANAGER.subscribe().await
}

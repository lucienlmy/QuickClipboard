use lan_sync_core::{
    ChatFileDecisionMessage, ChatFileDoneMessage, ChatFileMeta, ChatFileOfferMessage, ChatTextMessage,
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
const CHAT_FILE_PREFIX: &str = "chat_file:";
const CHAT_FILE_CHUNK_SIZE: usize = 8 * 1024 * 1024;
const CHAT_FILE_OFFER_EXPIRE_MS: u64 = 10 * 60 * 1000;

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

#[derive(Debug, Clone)]
struct OutgoingChatTransfer {
    transfer_id: String,
    from_device_id: String,
    to_device_id: String,
    files: Vec<ChatFileInfoInput>,
    expire_at_ms: u64,
}

#[derive(Debug, Clone)]
struct IncomingChatTransfer {
    transfer_id: String,
    from_device_id: String,
    to_device_id: String,
    files: Vec<ChatFileMeta>,
    expire_at_ms: u64,
}

#[derive(Debug, Clone)]
struct ReceiveFileProgress {
    file_id: String,
    file_name: String,
    file_size: u64,
    file_hash: Option<String>,
    received: u64,
    received_ranges: Vec<(u64, u64)>,
    covered_size: u64,
    file_path: PathBuf,
}

#[derive(Debug, Clone)]
struct IncomingReceiveProgress {
    transfer_id: String,
    from_device_id: String,
    to_device_id: String,
    files: Vec<ReceiveFileProgress>,
    total_size: u64,
    received_size: u64,
}

#[derive(Debug, Clone)]
pub enum ChatFileDoneResolve {
    ReceiverCompleted(Vec<String>),
    SenderAck,
    NotReady,
}

#[derive(Default)]
struct ChatRuntime {
    outgoing_waiting_accept: HashMap<String, OutgoingChatTransfer>,
    incoming_waiting_decision: HashMap<String, IncomingChatTransfer>,
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
static CHAT_FILE_WRITERS: Lazy<tokio::sync::Mutex<HashMap<String, std::fs::File>>> =
    Lazy::new(|| tokio::sync::Mutex::new(HashMap::new()));

fn make_chat_chunk_key(transfer_id: &str, file_id: &str) -> String {
    format!("{}{}:{}", CHAT_FILE_PREFIX, transfer_id, file_id)
}

fn make_chat_writer_key(transfer_id: &str, file_id: &str) -> String {
    format!("{}:{}", transfer_id, file_id)
}

fn parse_chat_chunk_key(key: &str) -> Option<(String, String)> {
    let rest = key.strip_prefix(CHAT_FILE_PREFIX)?;
    let mut parts = rest.splitn(2, ':');
    let transfer_id = parts.next()?.to_string();
    let file_id = parts.next()?.to_string();
    if transfer_id.is_empty() || file_id.is_empty() {
        return None;
    }
    Some((transfer_id, file_id))
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

fn add_covered_range(ranges: &mut Vec<(u64, u64)>, start: u64, end: u64) -> u64 {
    if end <= start {
        return ranges.iter().map(|(s, e)| e.saturating_sub(*s)).sum();
    }

    let mut out: Vec<(u64, u64)> = Vec::with_capacity(ranges.len() + 1);
    let mut s = start;
    let mut e = end;
    let mut inserted = false;

    for (rs, re) in ranges.iter().copied() {
        if re < s {
            out.push((rs, re));
            continue;
        }
        if e < rs {
            if !inserted {
                out.push((s, e));
                inserted = true;
            }
            out.push((rs, re));
            continue;
        }
        s = s.min(rs);
        e = e.max(re);
    }

    if !inserted {
        out.push((s, e));
    }

    out.sort_by_key(|(a, _)| *a);
    let mut merged: Vec<(u64, u64)> = Vec::with_capacity(out.len());
    for (rs, re) in out {
        if let Some((_, le)) = merged.last_mut() {
            if rs <= *le {
                *le = (*le).max(re);
                continue;
            }
        }
        merged.push((rs, re));
    }

    *ranges = merged;
    ranges.iter().map(|(a, b)| b.saturating_sub(*a)).sum()
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

async fn remove_chat_writer_handles_by_transfer(transfer_id: &str) {
    let mut writers = CHAT_FILE_WRITERS.lock().await;
    let prefix = format!("{}:", transfer_id);
    writers.retain(|k, _| !k.starts_with(&prefix));
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

pub fn device_id() -> String {
    DEVICE_ID.clone()
}

pub async fn get_snapshot() -> Snapshot {
    MANAGER.get_snapshot().await
}

pub async fn set_enabled(enabled: bool) -> Snapshot {
    MANAGER.set_enabled(enabled).await;
    if !enabled {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.clear();
        runtime.incoming_waiting_decision.clear();
        runtime.incoming_receiving.clear();
        drop(runtime);
        let mut writers = CHAT_FILE_WRITERS.lock().await;
        writers.clear();
    }
    MANAGER.get_snapshot().await
}

pub async fn start_server(port: u16) -> Result<u16, LanSyncError> {
    hydrate_trusted_devices_to_core().await;
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
    MANAGER.connect_peer(peer_url, auto_reconnect, pair_code).await
}

pub async fn disconnect_peer() {
    MANAGER.disconnect_peer().await;
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
    MANAGER.disconnect_device(device_id).await
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

pub async fn chat_send_file_offer(input: ChatFileOfferInput) -> Result<ChatFileOfferMessage, LanSyncError> {
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
    let offer = ChatFileOfferMessage {
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
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.insert(
            transfer_id.clone(),
            OutgoingChatTransfer {
                transfer_id: transfer_id.clone(),
                from_device_id: offer.from_device_id.clone(),
                to_device_id: offer.to_device_id.clone(),
                files: normalized_files,
                expire_at_ms,
            },
        );
    }

    MANAGER
        .send_message_to_device(
            &offer.to_device_id,
            LanSyncMessage::ChatFileOffer(offer.clone()),
        )
        .await?;
    Ok(offer)
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

pub async fn chat_reject_file_offer(input: ChatFileRejectInput) -> Result<ChatFileDecisionMessage, LanSyncError> {
    let decision = ChatFileDecisionMessage {
        transfer_id: input.transfer_id.clone(),
        from_device_id: device_id(),
        to_device_id: input.from_device_id.clone(),
        decided_at_ms: current_time_ms(),
    };

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_waiting_decision.remove(&input.transfer_id);
    }

    MANAGER
        .send_message_to_device(
            &decision.to_device_id,
            LanSyncMessage::ChatFileReject(decision.clone()),
        )
        .await?;
    Ok(decision)
}

pub async fn chat_accept_file_offer(input: ChatFileAcceptInput) -> Result<ChatFileDecisionMessage, LanSyncError> {
    let incoming = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_waiting_decision.remove(&input.transfer_id)
    };

    let Some(incoming) = incoming else {
        return Err(LanSyncError::Protocol("文件邀约不存在或已处理".to_string()));
    };

    if current_time_ms() > incoming.expire_at_ms {
        let expired = ChatFileDecisionMessage {
            transfer_id: input.transfer_id.clone(),
            from_device_id: device_id(),
            to_device_id: input.from_device_id.clone(),
            decided_at_ms: current_time_ms(),
        };
        let target = expired.to_device_id.clone();
        let _ = MANAGER
            .send_message_to_device(
                &target,
                LanSyncMessage::ChatFileExpired(expired),
            )
            .await;
        return Err(LanSyncError::Protocol("文件邀约已过期".to_string()));
    }

    let receive_dir = get_chat_receive_dir().map_err(LanSyncError::Protocol)?;
    std::fs::create_dir_all(&receive_dir).map_err(|e| LanSyncError::Protocol(e.to_string()))?;

    let mut files = Vec::with_capacity(incoming.files.len());
    let mut total_size: u64 = 0;
    let mut reserved_names: HashSet<String> = HashSet::new();
    for f in &incoming.files {
        let file_name = f.file_name.clone();
        let file_path = build_unique_file_path(&receive_dir, &file_name, &mut reserved_names);
        files.push(ReceiveFileProgress {
            file_id: f.file_id.clone(),
            file_name,
            file_size: f.file_size,
            file_hash: f.file_hash.clone(),
            received: 0,
            received_ranges: Vec::new(),
            covered_size: 0,
            file_path,
        });
        total_size = total_size.saturating_add(f.file_size);
    }

    {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.incoming_receiving.insert(
            input.transfer_id.clone(),
            IncomingReceiveProgress {
                transfer_id: input.transfer_id.clone(),
                from_device_id: incoming.from_device_id.clone(),
                to_device_id: incoming.to_device_id.clone(),
                files,
                total_size,
                received_size: 0,
            },
        );
    }

    let decision = ChatFileDecisionMessage {
        transfer_id: input.transfer_id,
        from_device_id: device_id(),
        to_device_id: input.from_device_id,
        decided_at_ms: current_time_ms(),
    };

    MANAGER
        .send_message_to_device(
            &decision.to_device_id,
            LanSyncMessage::ChatFileAccept(decision.clone()),
        )
        .await?;

    Ok(decision)
}

pub async fn chat_on_file_offer_received(offer: ChatFileOfferMessage) {
    let mut runtime = CHAT_RUNTIME.lock().await;
    runtime.incoming_waiting_decision.insert(
        offer.transfer_id.clone(),
        IncomingChatTransfer {
            transfer_id: offer.transfer_id,
            from_device_id: offer.from_device_id,
            to_device_id: offer.to_device_id,
            files: offer.files,
            expire_at_ms: offer.expire_at_ms,
        },
    );
}

pub async fn chat_on_file_accept_received(
    accept: ChatFileDecisionMessage,
    app_handle: Option<&tauri::AppHandle>,
) -> Result<(), LanSyncError> {
    let outgoing = {
        let mut runtime = CHAT_RUNTIME.lock().await;
        runtime.outgoing_waiting_accept.remove(&accept.transfer_id)
    };
    let Some(outgoing) = outgoing else {
        return Ok(());
    };

    if current_time_ms() > outgoing.expire_at_ms {
        let expired = ChatFileDecisionMessage {
            transfer_id: outgoing.transfer_id.clone(),
            from_device_id: outgoing.from_device_id,
            to_device_id: outgoing.to_device_id,
            decided_at_ms: current_time_ms(),
        };
        let target = expired.to_device_id.clone();
        let _ = MANAGER
            .send_message_to_device(
                &target,
                LanSyncMessage::ChatFileExpired(expired),
            )
            .await;
        return Ok(());
    }

    let snapshot = MANAGER.get_snapshot().await;
    let is_server_connected = snapshot.server_port.is_some() && snapshot.server_connected_count > 0;

    let total_size = outgoing
        .files
        .iter()
        .fold(0u64, |acc, x| acc.saturating_add(x.file_size));
    let mut sent_size: u64 = 0;
    for file in &outgoing.files {
        let bytes = std::fs::read(&file.file_path).map_err(|e| LanSyncError::Protocol(e.to_string()))?;
        let total_len = bytes.len() as u64;
        let mut offset: u64 = 0;
        while (offset as usize) < bytes.len() {
            let end = std::cmp::min(bytes.len(), offset as usize + CHAT_FILE_CHUNK_SIZE);
            let part = &bytes[offset as usize..end];
            let chunk_key = make_chat_chunk_key(&outgoing.transfer_id, &file.file_id);
            if is_server_connected {
                MANAGER
                    .broadcast_attachment_chunk_to(
                        &outgoing.to_device_id,
                        &chunk_key,
                        total_len,
                        offset,
                        part,
                    )
                    .await?;
            } else {
                MANAGER
                    .send_attachment_chunk_to(&outgoing.to_device_id, &chunk_key, total_len, offset, part)
                    .await?;
            }
            sent_size = sent_size.saturating_add(part.len() as u64);
            if let Some(app) = app_handle {
                use tauri::Emitter;
                let _ = app.emit(
                    "lan-chat-event",
                    serde_json::json!({
                        "type": "file_progress",
                        "transfer_id": outgoing.transfer_id,
                        "sent_size": sent_size,
                        "total_size": total_size
                    }),
                );
            }
            offset = end as u64;
        }
    }

    let done = ChatFileDoneMessage {
        transfer_id: outgoing.transfer_id,
        from_device_id: device_id(),
        to_device_id: outgoing.to_device_id.clone(),
        sent_at_ms: current_time_ms(),
    };

    if let Some(app) = app_handle {
        use tauri::Emitter;
        let _ = app.emit(
            "lan-chat-event",
            serde_json::json!({
                "type": "file_done",
                "done": done
            }),
        );
    }

    MANAGER
        .send_message_to_device(&outgoing.to_device_id, LanSyncMessage::ChatFileDone(done))
        .await?;
    Ok(())
}

pub async fn chat_on_file_reject_or_expired_received(transfer_id: &str) {
    let mut runtime = CHAT_RUNTIME.lock().await;
    runtime.outgoing_waiting_accept.remove(transfer_id);
}

pub async fn chat_handle_file_chunk(
    image_id: String,
    total_len: u64,
    offset: u64,
    data: Vec<u8>,
) -> Result<Option<(String, u64, u64)>, String> {
    let Some((transfer_id, file_id)) = parse_chat_chunk_key(&image_id) else {
        return Ok(None);
    };

    let (file_path, expected_file_size) = {
        let runtime = CHAT_RUNTIME.lock().await;
        let Some(state) = runtime.incoming_receiving.get(&transfer_id) else {
            return Ok(None);
        };
        let Some(file_state) = state.files.iter().find(|f| f.file_id == file_id) else {
            return Ok(None);
        };
        (file_state.file_path.clone(), file_state.file_size)
    };

    if offset >= expected_file_size || data.is_empty() {
        return Ok(None);
    }

    let writable_len = std::cmp::min(
        data.len() as u64,
        expected_file_size.saturating_sub(offset),
    ) as usize;
    if writable_len == 0 {
        return Ok(None);
    }

    use std::io::{Seek, SeekFrom, Write};
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let writer_key = make_chat_writer_key(&transfer_id, &file_id);
    {
        let mut writers = CHAT_FILE_WRITERS.lock().await;
        let writer = if let Some(existing) = writers.get_mut(&writer_key) {
            existing
        } else {
            let opened = std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .read(true)
                .open(&file_path)
                .map_err(|e| e.to_string())?;
            writers.insert(writer_key.clone(), opened);
            writers
                .get_mut(&writer_key)
                .ok_or_else(|| "创建写入器失败".to_string())?
        };

        writer
            .seek(SeekFrom::Start(offset))
            .map_err(|e| e.to_string())?;
        writer
            .write_all(&data[..writable_len])
            .map_err(|e| e.to_string())?;
    }

    let write_end = offset.saturating_add(writable_len as u64);
    let mut runtime = CHAT_RUNTIME.lock().await;
    let Some(state) = runtime.incoming_receiving.get_mut(&transfer_id) else {
        return Ok(None);
    };
    let Some(file_state) = state.files.iter_mut().find(|f| f.file_id == file_id) else {
        return Ok(None);
    };

    let previous_received = file_state.received;
    let covered = add_covered_range(&mut file_state.received_ranges, offset, write_end);
    file_state.covered_size = covered.min(expected_file_size);
    file_state.received = file_state.covered_size;

    if file_state.received >= expected_file_size {
        let mut writers = CHAT_FILE_WRITERS.lock().await;
        if let Some(writer) = writers.get_mut(&writer_key) {
            writer
                .set_len(expected_file_size)
                .map_err(|e| e.to_string())?;
        }
    }

    let delta = file_state.received.saturating_sub(previous_received);
    if delta > 0 {
        state.received_size = state.received_size.saturating_add(delta);
    }
    Ok(Some((transfer_id, state.received_size, state.total_size)))
}

pub async fn chat_on_file_done_received(transfer_id: &str) -> Result<ChatFileDoneResolve, String> {
    let mut runtime = CHAT_RUNTIME.lock().await;
    let Some(state) = runtime.incoming_receiving.get(transfer_id) else {
        return Ok(ChatFileDoneResolve::SenderAck);
    };
    let completed = state.files.iter().all(|f| f.received >= f.file_size);
    if !completed {
        return Ok(ChatFileDoneResolve::NotReady);
    }
    let Some(state) = runtime.incoming_receiving.remove(transfer_id) else {
        return Ok(ChatFileDoneResolve::NotReady);
    };
    drop(runtime);
    remove_chat_writer_handles_by_transfer(transfer_id).await;

    for f in &state.files {
        if let Some(expected_hash) = f.file_hash.as_ref().filter(|s| !s.trim().is_empty()) {
            let actual = compute_blake3_file_hash_hex(&f.file_path)?;
            if actual.to_lowercase() != expected_hash.to_lowercase() {
                return Err(format!("文件校验失败: {}", f.file_name));
            }
        }
    }

    let paths = state
        .files
        .into_iter()
        .map(|f| f.file_path.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    Ok(ChatFileDoneResolve::ReceiverCompleted(paths))
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

pub async fn chat_send_file_done_ack(to_device_id: &str, transfer_id: &str) -> Result<(), LanSyncError> {
    let done = ChatFileDoneMessage {
        transfer_id: transfer_id.to_string(),
        from_device_id: device_id(),
        to_device_id: to_device_id.to_string(),
        sent_at_ms: current_time_ms(),
    };
    MANAGER
        .send_message_to_device(to_device_id, LanSyncMessage::ChatFileDone(done))
        .await
}

pub async fn subscribe() -> tokio::sync::broadcast::Receiver<CoreEvent> {
    MANAGER.subscribe().await
}

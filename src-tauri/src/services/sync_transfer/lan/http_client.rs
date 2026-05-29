use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanHttpClientConfig {
    pub base_url: String,
    pub peer_token: String,
}

impl LanHttpClientConfig {
    pub fn authorization_header(&self) -> String {
        format!("Bearer {}", self.peer_token)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanHelloResponse {
    pub device_id: String,
    pub device_name: String,
    pub protocol: String,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PairingConfirmPayload {
    device_id: String,
    device_name: String,
    base_url: String,
    pairing_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PairingConfirmOutput {
    peer_token: String,
}

pub async fn pair_with_peer(base_url: String, pairing_code: String) -> Result<super::PairedPeerInfo, String> {
    let base_url = normalize_base_url(&base_url)?;
    let client = reqwest::Client::new();
    let hello = client
        .get(format!("{}/qc-sync/hello", base_url))
        .send()
        .await
        .map_err(|e| format!("连接局域网设备失败: {}", e))?;
    if !hello.status().is_success() {
        return Err(format!("读取局域网设备信息失败: {}", hello.status()));
    }
    let hello = hello
        .json::<LanHelloResponse>()
        .await
        .map_err(|e| format!("解析局域网设备信息失败: {}", e))?;
    if hello.protocol != "quickclipboard-sync-transfer-lan-http" {
        return Err("对方不是兼容的 QuickClipboard 同步/传输服务".to_string());
    }
    if hello.device_id == super::runtime::device_id() {
        return Err("不能配对当前设备自身".to_string());
    }
    let payload = PairingConfirmPayload {
        device_id: super::runtime::device_id(),
        device_name: super::runtime::device_name(),
        base_url: local_base_url(),
        pairing_code,
    };
    let confirm = client
        .post(format!("{}/qc-sync/pairing/confirm", base_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("发送配对请求失败: {}", e))?;
    if !confirm.status().is_success() {
        let status = confirm.status();
        let message = confirm
            .text()
            .await
            .unwrap_or_else(|_| "配对失败".to_string());
        return Err(format!("配对失败: {} {}", status, message));
    }
    let output = confirm
        .json::<PairingConfirmOutput>()
        .await
        .map_err(|e| format!("解析配对响应失败: {}", e))?;
    let mut peer = super::peer_store::PairedPeer::new(
        hello.device_id,
        hello.device_name,
        base_url,
        output.peer_token,
    );
    peer.last_seen_at_ms = Some(chrono::Utc::now().timestamp_millis());
    let info = peer.info();
    super::peer_store::upsert_peer(peer)?;
    Ok(info)
}

pub async fn fetch_peer_snapshot(peer: &super::peer_store::PairedPeer) -> Result<super::LanSyncSnapshot, String> {
    authorized_get(peer, "/qc-sync/snapshot").await
}

pub async fn fetch_peer_history_records(peer: &super::peer_store::PairedPeer) -> Result<super::LanRecordBatch, String> {
    authorized_get(peer, "/qc-sync/records/history").await
}

pub async fn fetch_peer_favorite_records(peer: &super::peer_store::PairedPeer) -> Result<super::LanRecordBatch, String> {
    authorized_get(peer, "/qc-sync/records/favorites").await
}

pub async fn fetch_peer_groups(peer: &super::peer_store::PairedPeer) -> Result<super::LanGroupBatch, String> {
    authorized_get(peer, "/qc-sync/groups").await
}

pub async fn fetch_peer_tombstones(peer: &super::peer_store::PairedPeer) -> Result<super::LanTombstoneBatch, String> {
    authorized_get(peer, "/qc-sync/tombstones").await
}

pub async fn push_peer_history_records(
    peer: &super::peer_store::PairedPeer,
    batch: super::LanRecordBatch,
) -> Result<super::LanRecordBatch, String> {
    authorized_post(peer, "/qc-sync/records/history", &batch).await
}

pub async fn push_peer_favorite_records(
    peer: &super::peer_store::PairedPeer,
    batch: super::LanRecordBatch,
) -> Result<super::LanRecordBatch, String> {
    authorized_post(peer, "/qc-sync/records/favorites", &batch).await
}

pub async fn push_peer_groups(
    peer: &super::peer_store::PairedPeer,
    batch: super::LanGroupBatch,
) -> Result<super::LanGroupBatch, String> {
    authorized_post(peer, "/qc-sync/groups", &batch).await
}

pub async fn push_peer_tombstones(
    peer: &super::peer_store::PairedPeer,
    batch: super::LanTombstoneBatch,
) -> Result<super::LanTombstoneBatch, String> {
    authorized_post(peer, "/qc-sync/tombstones", &batch).await
}

pub async fn fetch_peer_image(peer: &super::peer_store::PairedPeer, image_id: &str) -> Result<Option<Vec<u8>>, String> {
    let client = reqwest::Client::new();
    let config = LanHttpClientConfig {
        base_url: peer.base_url.clone(),
        peer_token: peer.peer_token.clone(),
    };
    let response = client
        .get(format!("{}/qc-sync/files/{}.png", config.base_url.trim_end_matches('/'), image_id))
        .header("Authorization", config.authorization_header())
        .header("X-Device-Id", super::runtime::device_id())
        .send()
        .await
        .map_err(|e| format!("读取局域网图片失败: {}", e))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("读取局域网图片失败: {}", response.status()));
    }
    response
        .bytes()
        .await
        .map(|bytes| Some(bytes.to_vec()))
        .map_err(|e| format!("读取局域网图片内容失败: {}", e))
}

pub async fn push_peer_image(peer: &super::peer_store::PairedPeer, image_id: &str, bytes: Vec<u8>) -> Result<(), String> {
    let client = reqwest::Client::new();
    let config = LanHttpClientConfig {
        base_url: peer.base_url.clone(),
        peer_token: peer.peer_token.clone(),
    };
    let response = client
        .put(format!("{}/qc-sync/files/{}.png", config.base_url.trim_end_matches('/'), image_id))
        .header("Authorization", config.authorization_header())
        .header("X-Device-Id", super::runtime::device_id())
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("推送局域网图片失败: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("推送局域网图片失败: {}", response.status()));
    }
    Ok(())
}

pub async fn send_peer_file(peer: &super::peer_store::PairedPeer, file_name: &str, bytes: Vec<u8>) -> Result<super::FileTransferResult, String> {
    let client = reqwest::Client::new();
    let config = LanHttpClientConfig {
        base_url: peer.base_url.clone(),
        peer_token: peer.peer_token.clone(),
    };
    let response = client
        .put(format!(
            "{}/qc-transfer/files/{}",
            config.base_url.trim_end_matches('/'),
            encode_path_segment(file_name)
        ))
        .header("Authorization", config.authorization_header())
        .header("X-Device-Id", super::runtime::device_id())
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("发送局域网文件失败: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("发送局域网文件失败: {}", response.status()));
    }
    response
        .json::<super::FileTransferResult>()
        .await
        .map_err(|e| format!("解析局域网文件传输结果失败: {}", e))
}

async fn authorized_get<T: serde::de::DeserializeOwned>(peer: &super::peer_store::PairedPeer, path: &str) -> Result<T, String> {
    let client = reqwest::Client::new();
    let config = LanHttpClientConfig {
        base_url: peer.base_url.clone(),
        peer_token: peer.peer_token.clone(),
    };
    let response = client
        .get(format!("{}{}", config.base_url.trim_end_matches('/'), path))
        .header("Authorization", config.authorization_header())
        .header("X-Device-Id", super::runtime::device_id())
        .send()
        .await
        .map_err(|e| format!("读取局域网同步数据失败: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("读取局域网同步数据失败: {}", response.status()));
    }
    response.json::<T>().await.map_err(|e| format!("解析局域网同步数据失败: {}", e))
}

async fn authorized_post<T, B>(peer: &super::peer_store::PairedPeer, path: &str, body: &B) -> Result<T, String>
where
    T: serde::de::DeserializeOwned,
    B: Serialize + ?Sized,
{
    let client = reqwest::Client::new();
    let config = LanHttpClientConfig {
        base_url: peer.base_url.clone(),
        peer_token: peer.peer_token.clone(),
    };
    let response = client
        .post(format!("{}{}", config.base_url.trim_end_matches('/'), path))
        .header("Authorization", config.authorization_header())
        .header("X-Device-Id", super::runtime::device_id())
        .json(body)
        .send()
        .await
        .map_err(|e| format!("推送局域网同步数据失败: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("推送局域网同步数据失败: {}", response.status()));
    }
    response.json::<T>().await.map_err(|e| format!("解析局域网推送结果失败: {}", e))
}

fn normalize_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("局域网设备地址不能为空".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }
    Ok(format!("http://{}", trimmed))
}

fn local_base_url() -> String {
    let port = super::http_server::running_port().unwrap_or(super::DEFAULT_HTTP_PORT);
    format!("http://127.0.0.1:{}", port)
}

fn encode_path_segment(raw: &str) -> String {
    raw.bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => vec![byte as char],
            b' ' => vec!['%', '2', '0'],
            _ => format!("%{:02X}", byte).chars().collect::<Vec<_>>(),
        })
        .collect()
}

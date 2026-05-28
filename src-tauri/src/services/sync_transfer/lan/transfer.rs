use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTransferResult {
    pub saved: bool,
    pub path: String,
}

pub async fn send_file_to_peer(device_id: &str, file_path: &str) -> Result<FileTransferResult, String> {
    let peer = super::peer_store::list_peers()
        .into_iter()
        .find(|peer| peer.device_id == device_id)
        .ok_or_else(|| "未找到已配对设备".to_string())?;
    let (file_name, bytes) = super::files::read_outgoing_file(file_path)?;
    super::http_client::send_peer_file(&peer, &file_name, bytes).await
}

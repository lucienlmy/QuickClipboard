use serde::{Deserialize, Serialize};

const PAIRED_PEERS_KEY: &str = "sync_transfer_lan_paired_peers";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedPeer {
    pub device_id: String,
    pub device_name: String,
    pub base_url: String,
    pub peer_token: String,
    pub paired_at_ms: i64,
    pub last_seen_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedPeerInfo {
    pub device_id: String,
    pub device_name: String,
    pub base_url: String,
    pub paired_at_ms: i64,
    pub last_seen_at_ms: Option<i64>,
}

impl PairedPeer {
    pub fn new(device_id: String, device_name: String, base_url: String, peer_token: String) -> Self {
        Self {
            device_id,
            device_name,
            base_url,
            peer_token,
            paired_at_ms: chrono::Utc::now().timestamp_millis(),
            last_seen_at_ms: None,
        }
    }

    pub fn info(&self) -> PairedPeerInfo {
        PairedPeerInfo {
            device_id: self.device_id.clone(),
            device_name: self.device_name.clone(),
            base_url: self.base_url.clone(),
            paired_at_ms: self.paired_at_ms,
            last_seen_at_ms: self.last_seen_at_ms,
        }
    }
}

pub fn list_peers() -> Vec<PairedPeer> {
    crate::services::store::get::<Vec<PairedPeer>>(PAIRED_PEERS_KEY).unwrap_or_default()
}

pub fn list_peer_infos() -> Vec<PairedPeerInfo> {
    list_peers().into_iter().map(|peer| peer.info()).collect()
}

pub fn save_peers(peers: &[PairedPeer]) -> Result<(), String> {
    crate::services::store::set(PAIRED_PEERS_KEY, &peers.to_vec())
}

pub fn upsert_peer(peer: PairedPeer) -> Result<(), String> {
    let mut peers = list_peers();
    if let Some(existing) = peers.iter_mut().find(|item| item.device_id == peer.device_id) {
        *existing = peer;
    } else {
        peers.push(peer);
    }
    save_peers(&peers)
}

pub fn mark_peer_seen(device_id: &str) -> Result<(), String> {
    let mut peers = list_peers();
    let Some(peer) = peers.iter_mut().find(|peer| peer.device_id == device_id) else {
        return Ok(());
    };
    peer.last_seen_at_ms = Some(chrono::Utc::now().timestamp_millis());
    save_peers(&peers)
}

pub fn remove_peer(device_id: &str) -> Result<bool, String> {
    let mut peers = list_peers();
    let before = peers.len();
    peers.retain(|peer| peer.device_id != device_id);
    if peers.len() == before {
        return Ok(false);
    }
    save_peers(&peers)?;
    Ok(true)
}

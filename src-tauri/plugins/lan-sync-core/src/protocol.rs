use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelloMessage {
    pub device_id: String,
    pub version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pair_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthChallenge {
    pub nonce: String,
    pub ts_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub nonce: String,
    pub ts_ms: u64,
    pub sig: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardRecord {
    pub uuid: String,
    pub source_device_id: String,
    pub is_remote: bool,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html_content: Option<String>,
    pub content_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_app: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_icon_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub char_count: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub uuid: String,
    pub source_device_id: String,
    pub content: String,
    pub html_content: Option<String>,
    pub content_type: String,
    pub image_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LanSyncMessage {
    Hello(HelloMessage),
    AuthChallenge(AuthChallenge),
    AuthResponse(AuthResponse),
    PairAccepted {
        #[serde(skip_serializing_if = "Option::is_none")]
        pair_secret: Option<String>,
    },
    PairDenied { reason: String },
    ClipboardRecord { record: ClipboardRecord },
    ClipboardItem(ClipboardItem),
}

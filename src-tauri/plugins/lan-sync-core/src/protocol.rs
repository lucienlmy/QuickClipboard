use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelloMessage {
    pub device_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
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
pub struct ClipboardRawFormat {
    pub format_name: String,
    pub raw_data: Vec<u8>,
    pub is_primary: bool,
    pub format_order: i64,
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub raw_formats: Vec<ClipboardRawFormat>,
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
pub struct ChatTextMessage {
    pub message_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub text: String,
    pub sent_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileMeta {
    pub file_id: String,
    pub file_name: String,
    pub file_size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileOfferMessage {
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
pub struct ChatFileDecisionMessage {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub decided_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFileDoneMessage {
    pub transfer_id: String,
    pub from_device_id: String,
    pub to_device_id: String,
    pub sent_at_ms: u64,
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
    ChatText(ChatTextMessage),
    ChatFileOffer(ChatFileOfferMessage),
    ChatFileAccept(ChatFileDecisionMessage),
    ChatFileReject(ChatFileDecisionMessage),
    ChatFileExpired(ChatFileDecisionMessage),
    ChatFileDone(ChatFileDoneMessage),
}

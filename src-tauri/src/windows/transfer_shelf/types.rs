use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const LABEL_PREFIX: &str = "transfer-shelf-";
pub const FILES_DROPPED_EVENT: &str = "transfer-shelf-files-dropped";
pub const DROP_ACTIVE_EVENT: &str = "transfer-shelf-drop-active";
pub const TASK_PROGRESS_EVENT: &str = "transfer-shelf-task-progress";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub exists: bool,
    pub icon: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfSummary {
    pub id: String,
    pub label: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfDroppedFilesPayload {
    pub shelf_id: String,
    pub paths: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfDropActivePayload {
    pub shelf_id: String,
    pub active: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfSendTarget {
    pub peer_id: String,
    pub path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfSendError {
    pub peer_id: String,
    pub path: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfSendTaskPayload {
    pub shelf_id: String,
    pub status: String,
    pub total: usize,
    pub done: usize,
    pub failed: usize,
    pub errors: Vec<ShelfSendError>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfStateSnapshot {
    pub id: String,
    pub name: String,
    pub files: Vec<ShelfFileInfo>,
    pub selected_peer_ids: Vec<String>,
}

pub fn label_for(id: &str) -> String {
    format!("{}{}", LABEL_PREFIX, id)
}

pub fn id_from_label(label: &str) -> Option<&str> {
    label.strip_prefix(LABEL_PREFIX)
}

pub fn describe_path(path: &str) -> ShelfFileInfo {
    let path_buf = PathBuf::from(path);
    let metadata = std::fs::metadata(&path_buf).ok();
    let name = Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(path)
        .to_string();

    ShelfFileInfo {
        path: path.to_string(),
        name,
        size: metadata.as_ref().map(|value| value.len()).unwrap_or(0),
        is_dir: metadata.as_ref().map(|value| value.is_dir()).unwrap_or(false),
        exists: metadata.is_some(),
        icon: metadata
            .as_ref()
            .filter(|value| value.is_file())
            .and_then(|_| crate::utils::icon::get_file_icon_base64(path)),
    }
}

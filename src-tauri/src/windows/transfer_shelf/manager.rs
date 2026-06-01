use std::collections::HashSet;

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use super::storage::{
    self, ShelfFilePersisted, ShelfPersisted, ShelfStatePersisted,
};
use super::types::{label_for, ShelfFileInfo, ShelfSummary};
use super::window::create_shelf_window;

#[derive(Clone, Debug)]
struct ShelfRecord {
    id: String,
    name: String,
}

static SHELVES: Lazy<Mutex<Vec<ShelfRecord>>> = Lazy::new(|| Mutex::new(Vec::new()));

const DEFAULT_SHELF_NAME_PREFIX: &str = "文件盒_";

fn ensure_state_loaded() -> ShelfStatePersisted {
    storage::load()
}

fn default_shelf_name_index(name: &str) -> Option<u32> {
    let suffix = name.strip_prefix(DEFAULT_SHELF_NAME_PREFIX)?;
    let index = suffix.parse::<u32>().ok()?;
    if index == 0 || index.to_string() != suffix {
        return None;
    }
    Some(index)
}

fn next_default_shelf_name(persisted: &[ShelfPersisted], active: &[ShelfRecord]) -> String {
    let mut used = HashSet::new();
    for name in persisted
        .iter()
        .map(|item| item.name.as_str())
        .chain(active.iter().map(|item| item.name.as_str()))
    {
        if let Some(index) = default_shelf_name_index(name) {
            used.insert(index);
        }
    }

    let mut index = 1;
    while used.contains(&index) {
        index += 1;
    }
    format!("{}{}", DEFAULT_SHELF_NAME_PREFIX, index)
}

/// 创建一个新的文件盒窗口，自动分配 id 与默认名称。
pub fn open_or_create_shelf(app: &AppHandle) -> Result<ShelfSummary, String> {
    let state = ensure_state_loaded();

    let id = Uuid::new_v4().to_string();
    let (stagger_index, name) = {
        let guard = SHELVES.lock();
        (
            guard.len() as u32,
            next_default_shelf_name(&state.shelves, &guard),
        )
    };

    create_shelf_window(app, &id, &name, stagger_index)?;

    let record = ShelfRecord {
        id: id.clone(),
        name: name.clone(),
    };
    SHELVES.lock().push(record.clone());

    let _ = storage::upsert_shelf(ShelfPersisted {
        id: id.clone(),
        name: name.clone(),
        files: Vec::new(),
        selected_peer_ids: Vec::new(),
    });

    Ok(ShelfSummary {
        label: label_for(&id),
        id,
        name,
    })
}

/// 应用启动时恢复持久化的 shelf 列表。
pub fn restore_persisted_shelves(app: &AppHandle) {
    let state = ensure_state_loaded();
    if state.shelves.is_empty() {
        return;
    }

    for (index, persisted) in state.shelves.iter().enumerate() {
        if SHELVES.lock().iter().any(|item| item.id == persisted.id) {
            continue;
        }
        if let Err(err) = create_shelf_window(app, &persisted.id, &persisted.name, index as u32) {
            eprintln!("[transfer_shelf] 恢复文件盒窗口失败 {}: {}", persisted.id, err);
            continue;
        }
        SHELVES.lock().push(ShelfRecord {
            id: persisted.id.clone(),
            name: persisted.name.clone(),
        });
    }
}

pub fn list_shelves() -> Vec<ShelfSummary> {
    SHELVES
        .lock()
        .iter()
        .map(|item| ShelfSummary {
            label: label_for(&item.id),
            id: item.id.clone(),
            name: item.name.clone(),
        })
        .collect()
}

pub fn focus_shelf(app: &AppHandle, id: &str) -> Result<(), String> {
    let label = label_for(id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("找不到文件盒窗口: {}", id))?;
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    let _ = window.show();
    window
        .set_focus()
        .map_err(|e| format!("聚焦文件盒窗口失败: {}", e))
}

pub fn rename_shelf(app: &AppHandle, id: &str, name: String) -> Result<ShelfSummary, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("文件盒名称不能为空".to_string());
    }
    let next_name = trimmed.chars().take(48).collect::<String>();

    {
        let mut guard = SHELVES.lock();
        let record = guard
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| format!("找不到文件盒窗口: {}", id))?;
        record.name = next_name.clone();
    }

    let mut persisted = load_shelf_state(id);
    persisted.name = next_name.clone();
    let _ = storage::upsert_shelf(persisted);

    let label = label_for(id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_title(&next_name);
    }

    Ok(ShelfSummary {
        label,
        id: id.to_string(),
        name: next_name,
    })
}

pub fn close_shelf(app: &AppHandle, id: &str) -> Result<(), String> {
    let label = label_for(id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .close()
            .map_err(|e| format!("关闭文件盒窗口失败: {}", e))?;
    }

    {
        let mut guard = SHELVES.lock();
        guard.retain(|item| item.id != id);
    }

    let _ = storage::remove_shelf(id);
    Ok(())
}

/// 读取持久化的 shelf 暂存数据。
pub fn load_shelf_state(id: &str) -> ShelfPersisted {
    storage::load()
        .shelves
        .into_iter()
        .find(|item| item.id == id)
        .unwrap_or_else(|| ShelfPersisted {
            id: id.to_string(),
            ..Default::default()
        })
}

/// 写入 shelf 文件队列与目标设备。
pub fn save_shelf_state(
    id: &str,
    files: Vec<ShelfFileInfo>,
    selected_peer_ids: Vec<String>,
) -> Result<(), String> {
    let mut existing = load_shelf_state(id);

    let now = chrono::Utc::now().timestamp_millis();
    let previous: std::collections::HashMap<String, i64> = existing
        .files
        .iter()
        .map(|item| (item.path.clone(), item.added_at_ms))
        .collect();

    existing.files = files
        .into_iter()
        .map(|file| ShelfFilePersisted {
            added_at_ms: previous.get(&file.path).copied().unwrap_or(now),
            path: file.path,
        })
        .collect();
    existing.selected_peer_ids = selected_peer_ids;
    if existing.name.is_empty() {
        if let Some(record) = SHELVES.lock().iter().find(|item| item.id == id) {
            existing.name = record.name.clone();
        }
    }

    storage::upsert_shelf(existing)
}

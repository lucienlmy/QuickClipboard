use std::sync::atomic::{AtomicU32, Ordering};

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
static NAME_COUNTER: AtomicU32 = AtomicU32::new(0);
static STATE_LOADED: AtomicU32 = AtomicU32::new(0);

fn ensure_state_loaded() -> ShelfStatePersisted {
    let state = storage::load();
    if STATE_LOADED.swap(1, Ordering::SeqCst) == 0 {
        let counter = state.name_counter.max(state.shelves.len() as u32);
        NAME_COUNTER.store(counter, Ordering::SeqCst);
    }
    state
}

/// 创建一个新的文件盒窗口，自动分配 id 与默认名称。
pub fn open_or_create_shelf(app: &AppHandle) -> Result<ShelfSummary, String> {
    let _ = ensure_state_loaded();

    let id = Uuid::new_v4().to_string();
    let stagger_index = SHELVES.lock().len() as u32;
    let counter = NAME_COUNTER.fetch_add(1, Ordering::SeqCst).saturating_add(1);
    let name = format!("文件盒 {}", counter);

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
    let _ = storage::save_name_counter(counter);

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

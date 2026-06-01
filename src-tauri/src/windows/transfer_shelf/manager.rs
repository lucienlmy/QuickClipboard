use std::sync::atomic::{AtomicU32, Ordering};

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use super::types::{label_for, ShelfSummary};
use super::window::create_shelf_window;

#[derive(Clone, Debug)]
struct ShelfRecord {
    id: String,
    name: String,
}

static SHELVES: Lazy<Mutex<Vec<ShelfRecord>>> = Lazy::new(|| Mutex::new(Vec::new()));
static NAME_COUNTER: AtomicU32 = AtomicU32::new(0);

/// 创建一个新的中转架窗口，自动分配 id 与默认名称。
pub fn open_or_create_shelf(app: &AppHandle) -> Result<ShelfSummary, String> {
    let id = Uuid::new_v4().to_string();
    let stagger_index = SHELVES.lock().len() as u32;
    let counter = NAME_COUNTER.fetch_add(1, Ordering::SeqCst).saturating_add(1);
    let name = format!("中转架 {}", counter);

    create_shelf_window(app, &id, &name, stagger_index)?;

    let record = ShelfRecord {
        id: id.clone(),
        name: name.clone(),
    };
    SHELVES.lock().push(record.clone());

    Ok(ShelfSummary {
        label: label_for(&id),
        id,
        name,
    })
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
        .ok_or_else(|| format!("找不到中转架窗口: {}", id))?;
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    let _ = window.show();
    window
        .set_focus()
        .map_err(|e| format!("聚焦中转架窗口失败: {}", e))
}

pub fn close_shelf(app: &AppHandle, id: &str) -> Result<(), String> {
    let label = label_for(id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .close()
            .map_err(|e| format!("关闭中转架窗口失败: {}", e))?;
    }

    let mut guard = SHELVES.lock();
    guard.retain(|item| item.id != id);
    Ok(())
}

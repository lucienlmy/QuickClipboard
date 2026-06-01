use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

use super::manager::{
    close_shelf, focus_shelf, list_shelves, load_shelf_state, open_or_create_shelf,
    save_shelf_state,
};
use super::storage::{self, ShelfGeometryPersisted};
use super::types::{describe_path, label_for, ShelfFileInfo, ShelfStateSnapshot, ShelfSummary};

#[tauri::command]
pub async fn transfer_shelf_create(app: AppHandle) -> Result<ShelfSummary, String> {
    open_or_create_shelf(&app)
}

#[tauri::command]
pub fn transfer_shelf_list() -> Vec<ShelfSummary> {
    list_shelves()
}

#[tauri::command]
pub fn transfer_shelf_focus(app: AppHandle, id: String) -> Result<(), String> {
    focus_shelf(&app, &id)
}

#[tauri::command]
pub fn transfer_shelf_close(app: AppHandle, id: String) -> Result<(), String> {
    close_shelf(&app, &id)
}

#[tauri::command]
pub fn transfer_shelf_describe_paths(paths: Vec<String>) -> Vec<ShelfFileInfo> {
    paths.into_iter().map(|path| describe_path(&path)).collect()
}

#[tauri::command]
pub fn transfer_shelf_load_state(id: String) -> ShelfStateSnapshot {
    let persisted = load_shelf_state(&id);
    let files = persisted
        .files
        .into_iter()
        .map(|item| describe_path(&item.path))
        .collect();
    ShelfStateSnapshot {
        id: persisted.id,
        name: persisted.name,
        files,
        selected_peer_ids: persisted.selected_peer_ids,
    }
}

#[tauri::command]
pub fn transfer_shelf_save_state(
    id: String,
    files: Vec<ShelfFileInfo>,
    selected_peer_ids: Vec<String>,
) -> Result<(), String> {
    save_shelf_state(&id, files, selected_peer_ids)
}

#[tauri::command]
pub fn transfer_shelf_save_geometry(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let label = label_for(&id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("找不到中转架窗口: {}", id))?;
    let position = window
        .outer_position()
        .map_err(|e| format!("读取窗口位置失败: {}", e))?;
    let size = window
        .outer_size()
        .map_err(|e| format!("读取窗口尺寸失败: {}", e))?;
    storage::upsert_geometry(
        &id,
        ShelfGeometryPersisted {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        },
    )
}

#[tauri::command]
pub fn transfer_shelf_apply_geometry(app: AppHandle, id: String) -> Result<bool, String> {
    let geometry = match storage::load().geometries.get(&id).cloned() {
        Some(value) => value,
        None => return Ok(false),
    };
    let label = label_for(&id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("找不到中转架窗口: {}", id))?;
    if geometry.width > 0 && geometry.height > 0 {
        let _ = window.set_size(PhysicalSize::new(geometry.width, geometry.height));
    }
    let _ = window.set_position(PhysicalPosition::new(geometry.x, geometry.y));
    Ok(true)
}

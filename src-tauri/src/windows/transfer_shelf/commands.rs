use tauri::AppHandle;

use super::manager::{close_shelf, focus_shelf, list_shelves, open_or_create_shelf};
use super::types::{describe_path, ShelfFileInfo, ShelfSummary};

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

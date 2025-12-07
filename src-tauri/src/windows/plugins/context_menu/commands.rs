use super::window::{ContextMenuOptions, MenuItem, show_menu};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager};

#[tauri::command]
pub fn get_context_menu_options() -> Result<ContextMenuOptions, String> {
    super::get_options().ok_or_else(|| "配置未初始化".into())
}

#[tauri::command]
pub fn update_context_menu_regions(main_menu: super::MenuRegion, submenus: Vec<super::MenuRegion>) {
    super::update_menu_regions(main_menu, submenus);
}

#[tauri::command]
pub fn submit_context_menu(item_id: Option<String>) {
    let session_id = super::get_active_menu_session();
    super::set_result(item_id);
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        super::clear_active_menu_session(session_id);
        super::clear_options_for_session(session_id);
    });
}

#[tauri::command]
pub async fn show_context_menu(app: AppHandle, items: Vec<MenuItem>, x: i32, y: i32, width: Option<i32>, theme: Option<String>) -> Result<Option<String>, String> {
    show_menu(app, ContextMenuOptions {
        items, x, y, cursor_x: 0, cursor_y: 0, width, theme, session_id: 0,
        monitor_x: 0.0, monitor_y: 0.0, monitor_width: 0.0, monitor_height: 0.0,
    }).await
}

#[tauri::command]
pub fn close_all_context_menus(app: AppHandle) {
    if let Some(w) = app.get_webview_window("context-menu") {
        let _ = w.hide();
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let sid = super::get_active_menu_session();
            super::clear_active_menu_session(sid);
            super::clear_options_for_session(sid);
        });
    }
}

#[tauri::command]
pub fn resize_context_menu(app: AppHandle, width: f64, height: f64, x: f64, y: f64) {
    if let Some(w) = app.get_webview_window("context-menu") {
        let _ = w.set_size(LogicalSize::new(width, height));
        let _ = w.set_position(LogicalPosition::new(x, y));
    }
}

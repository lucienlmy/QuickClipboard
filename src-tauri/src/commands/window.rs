use tauri::{AppHandle, WebviewWindow};

#[tauri::command]
pub fn start_custom_drag(window: WebviewWindow, mouse_screen_x: i32, mouse_screen_y: i32) -> Result<(), String> {
    crate::start_drag(&window, mouse_screen_x, mouse_screen_y)
}

#[tauri::command]
pub fn stop_custom_drag(window: WebviewWindow) -> Result<(), String> {
    crate::stop_drag(&window)
}

#[tauri::command]
pub fn toggle_main_window(app: AppHandle) -> Result<(), String> {
    crate::toggle_main_window_visibility(&app);
    Ok(())
}

#[tauri::command]
pub fn hide_main_window(window: WebviewWindow) -> Result<(), String> {
    crate::hide_main_window(&window);
    Ok(())
}

#[tauri::command]
pub fn show_main_window(window: WebviewWindow) -> Result<(), String> {
    crate::show_main_window(&window);
    Ok(())
}

#[tauri::command]
pub fn check_window_snap(window: WebviewWindow) -> Result<(), String> {
    crate::check_snap(&window)
}

#[tauri::command]
pub fn position_window_at_cursor(window: WebviewWindow) -> Result<(), String> {
    crate::position_at_cursor(&window)
}

#[tauri::command]
pub fn center_main_window(window: WebviewWindow) -> Result<(), String> {
    crate::center_window(&window)
}

#[tauri::command]
pub fn get_data_directory() -> Result<String, String> {
    let data_dir = crate::services::get_data_directory()?;
    data_dir.to_str()
        .ok_or("数据目录路径转换失败".to_string())
        .map(|s| s.to_string())
}

#[tauri::command]
pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
    crate::services::system::focus_clipboard_window(window)
}

#[tauri::command]
pub fn restore_last_focus() -> Result<(), String> {
    crate::services::system::restore_last_focus()
}

#[tauri::command]
pub fn hide_main_window_if_auto_shown(window: WebviewWindow) -> Result<(), String> {
    crate::hide_main_window(&window);
    Ok(())
}

#[tauri::command]
pub fn set_window_pinned(window: WebviewWindow, pinned: bool) -> Result<(), String> {
    window.set_always_on_top(pinned)
        .map_err(|e| format!("设置窗口置顶失败: {}", e))
}

#[tauri::command]
pub fn toggle_window_visibility(app: AppHandle) -> Result<(), String> {
    crate::toggle_main_window_visibility(&app);
    Ok(())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    let _ = app;
    Ok(())
}

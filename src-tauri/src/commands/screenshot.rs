use tauri::Manager;

// 启动内置截图功能
#[tauri::command]
pub fn start_builtin_screenshot(app: tauri::AppHandle) -> Result<(), String> {
    crate::windows::screenshot_window::auto_selection::clear_auto_selection_cache();
    crate::windows::screenshot_window::start_screenshot(&app)
}

// 捕获所有显示器截图
#[tauri::command]
pub fn capture_all_screenshots(app: tauri::AppHandle) -> Result<Vec<crate::services::screenshot::MonitorScreenshotInfo>, String> {
    crate::services::screenshot::capture_all_monitors_to_files(&app)
}

// 获取最近一次截屏结果
#[tauri::command]
pub fn get_last_screenshot_captures() -> Result<Vec<crate::services::screenshot::MonitorScreenshotInfo>, String> {
    crate::services::screenshot::get_last_captures()
}

// 取消当前截屏会话
#[tauri::command]
pub fn cancel_screenshot_session(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::screenshot::clear_last_captures();
    crate::windows::screenshot_window::auto_selection::clear_auto_selection_cache();
    if let Some(win) = app.get_webview_window("screenshot") {
        let _ = win.hide();
        let _ = win.eval("window.location.reload()");
    }
    Ok(())
}

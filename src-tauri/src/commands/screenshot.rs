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

// 启用长截屏模式的鼠标穿透控制
#[tauri::command]
pub fn enable_long_screenshot_passthrough(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    toolbar_x: f64,
    toolbar_y: f64,
    toolbar_width: f64,
    toolbar_height: f64,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("screenshot") {
        crate::windows::screenshot_window::long_screenshot::enable_passthrough(
            window, x, y, width, height,
            toolbar_x, toolbar_y, toolbar_width, toolbar_height
        );
        Ok(())
    } else {
        Err("Screenshot window not found".to_string())
    }
}

// 禁用长截屏模式的鼠标穿透控制
#[tauri::command]
pub fn disable_long_screenshot_passthrough() -> Result<(), String> {
    crate::windows::screenshot_window::long_screenshot::disable_passthrough();
    Ok(())
}

// 开始长截屏捕获
#[tauri::command]
pub fn start_long_screenshot_capture() -> Result<(), String> {
    crate::windows::screenshot_window::long_screenshot::start_capturing()
}

// 停止长截屏捕获
#[tauri::command]
pub fn stop_long_screenshot_capture() -> Result<(), String> {
    crate::windows::screenshot_window::long_screenshot::stop_capturing();
    Ok(())
}

// 保存长截屏
#[tauri::command]
pub async fn save_long_screenshot(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::windows::screenshot_window::long_screenshot::save_long_screenshot(path)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

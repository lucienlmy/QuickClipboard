use tauri::{AppHandle, Manager};
use super::creator::create_settings_window;

/// 打开设置窗口（如果已存在则激活，否则创建新窗口）
pub fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        if window.is_minimized().unwrap_or(false) {
            window.unminimize().map_err(|e| format!("取消最小化设置窗口失败: {}", e))?;
        }
        window.show().map_err(|e| format!("显示设置窗口失败: {}", e))?;
        window.set_focus().map_err(|e| format!("聚焦设置窗口失败: {}", e))?;
    } else {
        create_settings_window(app)?;
    }

    Ok(())
}


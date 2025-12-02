use tauri::AppHandle;

// 创建设置窗口
pub fn create_settings_window(app: &AppHandle) -> Result<(), String> {
    let _settings_window = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("windows/settings/index.html".into()),
    )
    .title("设置 - 快速剪贴板")
    .inner_size(900.0, 630.0)
    .min_inner_size(800.0, 600.0)
    .center()
    .resizable(false)
    .maximizable(false)
    .decorations(false)
    .transparent(true)
    .skip_taskbar(false)
    .visible(true)
    .focused(true)
    .build()
    .map_err(|e| format!("创建设置窗口失败: {}", e))?;

    Ok(())
}


use tauri::{AppHandle, Manager};

/// 设置窗口管理
pub struct SettingsWindow;

impl SettingsWindow {
    /// 打开设置窗口
    pub async fn open(app: AppHandle) -> Result<(), String> {
        // 检查设置窗口是否已经存在
        if let Some(settings_window) = app.get_webview_window("settings") {
            // 如果窗口已存在，检查是否最小化并恢复
            let is_minimized = settings_window.is_minimized().unwrap_or(false);

            if is_minimized {
                settings_window
                    .unminimize()
                    .map_err(|e| format!("取消最小化设置窗口失败: {}", e))?;
            }

            let _ = settings_window.set_always_on_top(true);
            
            settings_window
                .show()
                .map_err(|e| format!("显示设置窗口失败: {}", e))?;
            settings_window
                .set_focus()
                .map_err(|e| format!("聚焦设置窗口失败: {}", e))?;

            let _ = settings_window.set_always_on_top(false);
        } else {
            Self::create_window(&app)?;
        }

        Ok(())
    }

    /// 创建设置窗口
    fn create_window(app: &AppHandle) -> Result<(), String> {
        let settings_window = tauri::WebviewWindowBuilder::new(
            app,
            "settings",
            tauri::WebviewUrl::App("settings/index.html".into()),
        )
        .title("设置 - 快速剪贴板")
        .inner_size(900.0, 630.0)
        .min_inner_size(800.0, 600.0)
        .center()
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .transparent(false)
        .always_on_top(false)
        .skip_taskbar(false)
        .visible(true)
        .focused(true)
        .build()
        .map_err(|e| format!("创建设置窗口失败: {}", e))?;

        let _ = settings_window.set_always_on_top(true);
        
        settings_window
            .show()
            .map_err(|e| format!("显示设置窗口失败: {}", e))?;

        let _ = settings_window.set_always_on_top(false);

        // 设置窗口关闭事件处理
        Self::setup_close_handler(&settings_window, app);

        Ok(())
    }

    /// 设置窗口关闭事件处理
    fn setup_close_handler(settings_window: &tauri::WebviewWindow, app: &AppHandle) {
        let app_handle = app.clone();
        settings_window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // 当设置窗口关闭时，隐藏主窗口（如果它是自动显示的）
                if let Some(main_window) = app_handle.get_webview_window("main") {
                    let _ = crate::window_management::hide_main_window_if_auto_shown(&main_window);
                }
            }
        });
    }
}

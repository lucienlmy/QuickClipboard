use tauri::{AppHandle, Manager, WebviewWindow};
use crate::state_manager;

/// 窗口服务 - 处理窗口相关的业务逻辑
pub struct WindowService;

impl WindowService {
    /// 设置窗口固定状态
    pub fn set_pinned(pinned: bool) -> Result<(), String> {
        state_manager::set_window_pinned(pinned);
        Ok(())
    }

    /// 获取窗口固定状态
    pub fn is_pinned() -> bool {
        state_manager::is_window_pinned()
    }

    /// 切换窗口可见性
    pub fn toggle_visibility(app: &AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("main") {
            // 如果窗口固定且可见，则不隐藏
            if window.is_visible().unwrap_or(true) && Self::is_pinned() {
                return Ok(());
            }

            // 使用统一的窗口显示/隐藏逻辑
            crate::window_management::toggle_webview_window_visibility(window);
        }
        
        Ok(())
    }

    /// 隐藏主窗口（如果是自动显示的）
    pub fn hide_if_auto_shown(app: &AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("main") {
            crate::window_management::hide_main_window_if_auto_shown(&window)
        } else {
            Err("找不到主窗口".to_string())
        }
    }

    /// 恢复最后的焦点
    pub fn restore_last_focus() -> Result<(), String> {
        crate::window_management::restore_last_focus()
    }

    /// 聚焦剪贴板窗口
    pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
        crate::window_management::focus_clipboard_window(window)
    }

    /// 打开文本编辑窗口
    pub async fn open_text_editor_window(app: AppHandle) -> Result<(), String> {
        // 检查文本编辑窗口是否已经存在
        if let Some(editor_window) = app.get_webview_window("text-editor") {
            // 如果窗口已存在，显示并聚焦
            editor_window
                .show()
                .map_err(|e| format!("显示文本编辑窗口失败: {}", e))?;
            editor_window
                .set_focus()
                .map_err(|e| format!("聚焦文本编辑窗口失败: {}", e))?;
        } else {
            // 如果窗口不存在，创建新窗口
            let editor_window = tauri::WebviewWindowBuilder::new(
                &app,
                "text-editor",
                tauri::WebviewUrl::App("textEditor.html".into()),
            )
            .title("文本编辑器 - 快速剪贴板")
            .inner_size(800.0, 600.0)
            .min_inner_size(400.0, 300.0)
            .center()
            .resizable(true)
            .maximizable(true)
            .decorations(false) // 去除标题栏
            .build()
            .map_err(|e| format!("创建文本编辑窗口失败: {}", e))?;

            editor_window
                .show()
                .map_err(|e| format!("显示文本编辑窗口失败: {}", e))?;

            // 设置窗口关闭事件处理
            let app_handle = app.clone();
            editor_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    println!("文本编辑窗口已关闭");
                }
            });

            // 在开发模式下打开开发者工具
            // #[cfg(debug_assertions)]
            // {
            //     editor_window.open_devtools();
            // }
        }

        Ok(())
    }
}
use tauri::{AppHandle, Manager, WebviewWindow};
use crate::state_manager;

// 窗口服务 - 处理窗口相关的业务逻辑
pub struct WindowService;

impl WindowService {
    // 设置窗口固定状态
    pub fn set_pinned(pinned: bool) -> Result<(), String> {
        state_manager::set_window_pinned(pinned);
        Ok(())
    }

    // 获取窗口固定状态
    pub fn is_pinned() -> bool {
        state_manager::is_window_pinned()
    }

    // 切换窗口可见性
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

    // 隐藏主窗口（如果是自动显示的）
    pub fn hide_if_auto_shown(app: &AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("main") {
            crate::window_management::hide_main_window_if_auto_shown(&window)
        } else {
            Err("找不到主窗口".to_string())
        }
    }

    // 恢复最后的焦点
    pub fn restore_last_focus() -> Result<(), String> {
        crate::window_management::restore_last_focus()
    }

    // 聚焦剪贴板窗口
    pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
        crate::window_management::focus_clipboard_window(window)
    }

    // 打开文本编辑窗口
    pub async fn open_text_editor_window(
        app: AppHandle,
        item_id: String,
        item_type: String,
        item_index: Option<i64>,
    ) -> Result<(), String> {
        let url = format!(
            "windows/textEditor/index.html?id={}&type={}&index={}",
            item_id,
            item_type,
            item_index.unwrap_or(0)
        );

        let window_label = format!("text-editor-{}", chrono::Local::now().timestamp_millis());
        
        let editor_window = tauri::WebviewWindowBuilder::new(
            &app,
            &window_label,
            tauri::WebviewUrl::App(url.into()),
        )
        .title("文本编辑器 - 快速剪贴板")
        .inner_size(800.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .center()
        .resizable(true)
        .maximizable(true)
        .decorations(false) 
        .build()
        .map_err(|e| format!("创建文本编辑窗口失败: {}", e))?;

        editor_window
            .show()
            .map_err(|e| format!("显示文本编辑窗口失败: {}", e))?;

        // 设置窗口关闭事件处理
        editor_window.on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                println!("文本编辑窗口已关闭");
            }
        });

        Ok(())
    }
}
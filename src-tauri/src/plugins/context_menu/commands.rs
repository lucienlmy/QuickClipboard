/// 右键菜单命令
use tauri::{AppHandle, Manager};
use super::window::{ContextMenuOptions, MenuItem, show_menu};

/// 前端获取菜单配置
#[tauri::command]
pub fn get_context_menu_options() -> Result<ContextMenuOptions, String> {
    super::get_options().ok_or_else(|| "配置未初始化".to_string())
}

/// 前端提交菜单选择结果
#[tauri::command]
pub fn submit_context_menu(item_id: Option<String>) -> Result<(), String> {
    let session_id = super::get_active_menu_session();
    super::set_result(item_id);
    
    // 延迟标记菜单为不可见，避免点击菜单项时主窗口被误隐藏
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        super::clear_active_menu_session(session_id);
        super::clear_options_for_session(session_id);
    });
    
    Ok(())
}

/// 前端调用显示右键菜单的命令
#[tauri::command]
pub async fn show_context_menu(
    app: AppHandle,
    items: Vec<MenuItem>,
    x: i32,
    y: i32,
    width: Option<i32>,
    theme: Option<String>,
) -> Result<Option<String>, String> {
    let options = ContextMenuOptions {
        items,
        x,
        y,
        width,
        theme,
        session_id: 0,
    };
    
    show_menu(app, options).await
}

/// 隐藏所有右键菜单窗口
#[tauri::command]
pub fn close_all_context_menus(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("context-menu") {
        let _ = window.hide();
        // 延迟标记菜单为不可见
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let session_id = super::get_active_menu_session();
            super::clear_active_menu_session(session_id);
            super::clear_options_for_session(session_id);
        });
    }
    Ok(())
}


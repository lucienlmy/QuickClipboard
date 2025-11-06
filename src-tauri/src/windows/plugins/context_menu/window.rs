// 右键菜单窗口管理
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};

// 菜单项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItem {
    // 菜单项 ID
    pub id: String,
    // 菜单项显示文本
    pub label: String,
    // 图标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    // Favicon URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favicon: Option<String>,
    // 是否禁用
    #[serde(default)]
    pub disabled: bool,
    // 是否为分割线
    #[serde(default)]
    pub separator: bool,
    // 子菜单（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<MenuItem>>,
}

// 右键菜单配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuOptions {
    // 菜单项列表
    pub items: Vec<MenuItem>,
    // 菜单显示位置 x 坐标
    pub x: i32,
    // 菜单显示位置 y 坐标
    pub y: i32,
    // 菜单宽度
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,
    // 主题
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    // 菜单会话 ID
    pub session_id: u64,
}

// 创建并显示右键菜单窗口
pub async fn show_menu(
    app: AppHandle,
    mut options: ContextMenuOptions,
) -> Result<Option<String>, String> {
    use tauri::{LogicalPosition, LogicalSize};
    
    const MENU_WINDOW_LABEL: &str = "context-menu";
    
    super::clear_result();
    super::clear_options();
    
    let session_id = super::next_menu_session_id();
    options.session_id = session_id;

    super::set_active_menu_session(session_id);
    super::set_options(options.clone());

    let menu_width = options.width.unwrap_or(200);
    let item_height = 36;
    let separator_height = 9;
    let shadow_padding = 16;
    
    let content_height: i32 = options.items.iter().map(|item| {
        if item.separator {
            separator_height
        } else {
            item_height
        }
    }).sum();
    let menu_height = content_height + 16;
    
    let width = menu_width + shadow_padding;
    let height = menu_height + shadow_padding;

    let window = if let Some(existing_window) = app.get_webview_window(MENU_WINDOW_LABEL) {
        let _ = existing_window.hide();
        let _ = existing_window.set_always_on_top(false);
        
        let size = LogicalSize::new(width as f64, height as f64);
        existing_window.set_size(size)
            .map_err(|e| format!("设置窗口大小失败: {}", e))?;
        
        existing_window.set_focusable(false)
            .map_err(|e| format!("设置窗口焦点失败: {}", e))?;
        
        existing_window
    } else {
        let new_window = WebviewWindowBuilder::new(
            &app,
            MENU_WINDOW_LABEL,
            tauri::WebviewUrl::App("plugins/context_menu/contextMenu.html".into()),
        )
        .title("菜单")
        .inner_size(width as f64, height as f64)
        .position(0.0, 0.0)
        .resizable(false) 
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false) 
        .always_on_top(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("创建菜单窗口失败: {}", e))?;
        
        new_window
    };
    
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let physical_x = (options.x as f64 * scale_factor).round() as i32;
    let physical_y = (options.y as f64 * scale_factor).round() as i32;
    let physical_width = (width as f64 * scale_factor).round() as i32;
    let physical_height = (height as f64 * scale_factor).round() as i32;
    
    let (constrained_x, constrained_y) = if let Ok(monitor) = window.current_monitor() {
        if let Some(monitor) = monitor {
            let screen_size = monitor.size();
            let max_x = (screen_size.width as i32).saturating_sub(physical_width);
            let max_y = (screen_size.height as i32).saturating_sub(physical_height);
            
            (
                physical_x.min(max_x).max(0),
                physical_y.min(max_y).max(0)
            )
        } else {
            (physical_x, physical_y)
        }
    } else {
        (physical_x, physical_y)
    };
    
    let logical_x = (constrained_x as f64) / scale_factor;
    let logical_y = (constrained_y as f64) / scale_factor;
    
    let position = LogicalPosition::new(logical_x, logical_y);
    window.set_position(position)
        .map_err(|e| format!("设置菜单位置失败: {}", e))?;

    window
        .set_always_on_top(true)
        .map_err(|e| format!("设置窗口置顶失败: {}", e))?;
    
    window
        .show()
        .map_err(|e| format!("显示菜单失败: {}", e))?;
    
    window
        .set_always_on_top(true)
        .map_err(|e| format!("重新设置窗口置顶失败: {}", e))?;
    
    let _ = window.emit("reload-menu", ());

    let (tx, rx) = tokio::sync::oneshot::channel();
    
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
            if super::MENU_RESULT.get().and_then(|m| m.lock().ok()).map(|r| r.is_some()).unwrap_or(false) {
                let _ = tx.send(());
                break;
            }
            if super::get_active_menu_session() != session_id {
                let _ = tx.send(());
                break;
            }
        }
    });

    let _ = rx.await;

    if super::get_active_menu_session() == session_id {
        let result = super::get_result();
        super::clear_active_menu_session(session_id);
        super::clear_options_for_session(session_id);
        Ok(result)
    } else {
        super::clear_options_for_session(session_id);
        Ok(None)
    }
}


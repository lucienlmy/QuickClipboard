/// 右键菜单窗口管理
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};

/// 菜单项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItem {
    /// 菜单项 ID
    pub id: String,
    /// 菜单项显示文本
    pub label: String,
    /// 图标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Favicon URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favicon: Option<String>,
    /// 是否禁用
    #[serde(default)]
    pub disabled: bool,
    /// 是否为分割线
    #[serde(default)]
    pub separator: bool,
    /// 子菜单（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<MenuItem>>,
}

/// 右键菜单配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuOptions {
    /// 菜单项列表
    pub items: Vec<MenuItem>,
    /// 菜单显示位置 x 坐标
    pub x: i32,
    /// 菜单显示位置 y 坐标
    pub y: i32,
    /// 菜单宽度
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,
    /// 主题
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    /// 菜单会话 ID
    pub session_id: u64,
}

/// 创建并显示右键菜单窗口
pub async fn show_menu(
    app: AppHandle,
    mut options: ContextMenuOptions,
) -> Result<Option<String>, String> {
    use tauri::{LogicalPosition, LogicalSize};
    
    const MENU_WINDOW_LABEL: &str = "context-menu";
    
    // 清空之前的结果和配置
    super::clear_result();
    super::clear_options();
    
    // 分配新的菜单会话 ID
    let session_id = super::next_menu_session_id();
    options.session_id = session_id;

    // 记录当前可见菜单会话
    super::set_active_menu_session(session_id);
    // 保存配置供前端读取
    super::set_options(options.clone());

    // 计算主菜单窗口尺寸
    let menu_width = options.width.unwrap_or(200);
    let item_height = 36;
    let separator_height = 9;
    let shadow_padding = 16;
    
    // 计算总高度
    let content_height: i32 = options.items.iter().map(|item| {
        if item.separator {
            separator_height
        } else {
            item_height
        }
    }).sum();
    let menu_height = content_height + 16;
    
    // 窗口尺寸需要包含阴影空间
    let width = menu_width + shadow_padding;
    let height = menu_height + shadow_padding;

    // 尝试获取已存在的菜单窗口
    let window = if let Some(existing_window) = app.get_webview_window(MENU_WINDOW_LABEL) {
        // 更新窗口大小
        let size = LogicalSize::new(width as f64, height as f64);
        existing_window.set_size(size)
            .map_err(|e| format!("设置窗口大小失败: {}", e))?;
        
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
        .focused(true)
        .visible(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("创建菜单窗口失败: {}", e))?;
        
        new_window
    };
    
    // 约束菜单位置到屏幕边界内
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let physical_x = (options.x as f64 * scale_factor) as i32;
    let physical_y = (options.y as f64 * scale_factor) as i32;
    let physical_width = (width as f64 * scale_factor) as i32;
    let physical_height = (height as f64 * scale_factor) as i32;
    
    let (constrained_x, constrained_y) = crate::screenshot::screen_utils::ScreenUtils::constrain_to_physical_bounds(
        physical_x,
        physical_y,
        physical_width,
        physical_height,
        &window,
    ).unwrap_or((physical_x, physical_y));
    
    // 转回逻辑坐标
    let logical_x = (constrained_x as f64) / scale_factor;
    let logical_y = (constrained_y as f64) / scale_factor;
    
    // 设置约束后的位置
    let position = LogicalPosition::new(logical_x, logical_y);
    window.set_position(position)
        .map_err(|e| format!("设置菜单位置失败: {}", e))?;

    // 显示窗口前重新设置置顶状态，确保在其他置顶窗口之上
    window
        .set_always_on_top(true)
        .map_err(|e| format!("设置窗口置顶失败: {}", e))?;
    
    window
        .show()
        .map_err(|e| format!("显示菜单失败: {}", e))?;
    
    // 确保窗口获得焦点
    window
        .set_focus()
        .map_err(|e| format!("设置窗口焦点失败: {}", e))?;
    
    // 通知前端重新加载菜单
    let _ = window.emit("reload-menu", ());

    // 等待用户选择
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


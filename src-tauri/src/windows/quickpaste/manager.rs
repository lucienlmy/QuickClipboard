use tauri::{AppHandle, Manager, Emitter, WebviewUrl, WebviewWindowBuilder};
use super::state::set_visible;
use super::positioning::*;

fn get_or_create_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("quickpaste") {
        return Ok(window);
    }

    let settings = crate::get_settings();
    let width = settings.quickpaste_window_width as f64;
    let height = settings.quickpaste_window_height as f64;

    let window = WebviewWindowBuilder::new(
        app,
        "quickpaste",
        WebviewUrl::App("windows/quickpaste/index.html".into())
    )
    .title("便捷粘贴")
    .inner_size(width, height)
    .min_inner_size(200.0, 300.0)
    .max_inner_size(800.0, 1000.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .visible(false)
    .resizable(true)
    .focused(false)
    .focusable(false)
    .maximizable(false)
    .minimizable(false)
    .drag_and_drop(false)
    .build()
    .map_err(|e| format!("创建快捷粘贴窗口失败: {}", e))?;
    
    Ok(window)
}

pub fn show_quickpaste_window(app: &AppHandle) -> Result<(), String> {
    let settings = crate::get_settings();
    
    if !settings.quickpaste_enabled {
        return Ok(());
    }
    
    let window = get_or_create_window(app)?;
    
    #[cfg(debug_assertions)]
    {
        if !window.is_devtools_open() {
            let _ = window.open_devtools();
        }
    }
    
    position_at_cursor(&window)?;
    
    window.show()
        .map_err(|e| format!("显示窗口失败: {}", e))?;
    
    window.set_always_on_top(true)
        .map_err(|e| format!("设置窗口置顶失败: {}", e))?;
    
    set_visible(true);
    
    let _ = window.emit("quickpaste-show", ());
    
    Ok(())
}

/// 隐藏快捷粘贴窗口
pub fn hide_quickpaste_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quickpaste") {
        window.hide()
            .map_err(|e| format!("隐藏窗口失败: {}", e))?;
    }
    
    set_visible(false);
    Ok(())
}


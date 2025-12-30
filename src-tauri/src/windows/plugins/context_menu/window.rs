use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalSize, WebviewWindowBuilder, Manager};

fn enable_passthrough(window: tauri::WebviewWindow, session_id: u64) {
    std::thread::spawn(move || {
        let mut last = true;
        while super::get_active_menu_session() == session_id {
            let (mx, my) = crate::utils::mouse::get_cursor_position();
            let in_region = super::is_point_in_menu_region(mx, my);
            if in_region != last {
                last = in_region;
                let _ = window.set_ignore_cursor_events(!in_region);
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let _ = window.set_ignore_cursor_events(false);
        super::clear_menu_regions();
    });
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuItem {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favicon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_color: Option<String>,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub separator: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<MenuItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMenuOptions {
    pub items: Vec<MenuItem>,
    pub x: i32,
    pub y: i32,
    pub cursor_x: i32,
    pub cursor_y: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    pub session_id: u64,
    #[serde(default)]
    pub monitor_x: f64,
    #[serde(default)]
    pub monitor_y: f64,
    #[serde(default)]
    pub monitor_width: f64,
    #[serde(default)]
    pub monitor_height: f64,
    #[serde(default)]
    pub is_tray_menu: bool,
    #[serde(default)]
    pub force_focus: bool,
}

pub async fn show_menu(
    app: AppHandle,
    mut options: ContextMenuOptions,
) -> Result<Option<String>, String> {
    const LABEL: &str = "context-menu";
    let old_session = super::get_active_menu_session();
    if old_session != 0 {
        super::clear_active_menu_session(old_session);
        if let Some(w) = app.get_webview_window(LABEL) {
            let _ = w.hide();
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    }

    super::clear_result();
    super::clear_options();

    let session_id = super::next_menu_session_id();
    options.session_id = session_id;
    super::set_active_menu_session(session_id);

    let (cursor_phys_x, cursor_phys_y) = crate::mouse::get_cursor_position();
    
    let (monitor_phys_x, monitor_phys_y, monitor_phys_w, monitor_phys_h, scale) = 
        crate::screen::ScreenUtils::get_monitor_at_cursor(&app)
            .map(|m| {
                let pos = m.position();
                let size = m.size();
                (pos.x as f64, pos.y as f64, size.width as f64, size.height as f64, m.scale_factor())
            })
            .unwrap_or((0.0, 0.0, 1920.0, 1080.0, 1.0));

    let cursor_rel_x = (cursor_phys_x as f64 - monitor_phys_x) / scale;
    let cursor_rel_y = (cursor_phys_y as f64 - monitor_phys_y) / scale;
    
    let monitor_logical_w = monitor_phys_w / scale;
    let monitor_logical_h = monitor_phys_h / scale;

    options.cursor_x = cursor_rel_x as i32;
    options.cursor_y = cursor_rel_y as i32;
    options.monitor_x = monitor_phys_x;
    options.monitor_y = monitor_phys_y;
    options.monitor_width = monitor_logical_w;
    options.monitor_height = monitor_logical_h;

    super::set_options(options.clone());

    let (width, height) = (300.0, 400.0);
    
    let init_phys_x = monitor_phys_x as i32;
    let init_phys_y = monitor_phys_y as i32;

    let is_tray = options.is_tray_menu;
    
    let window = if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
        let _ = w.set_always_on_top(false);
        let _ = w.set_position(tauri::PhysicalPosition::new(init_phys_x, init_phys_y));
        let _ = w.set_size(LogicalSize::new(width, height));
        let _ = w.set_focusable(is_tray);
        let _ = w.set_ignore_cursor_events(false);
        w
    } else {
        let init_logical_x = init_phys_x as f64 / scale;
        let init_logical_y = init_phys_y as f64 / scale;
        let w = WebviewWindowBuilder::new(&app, LABEL, tauri::WebviewUrl::App("plugins/context_menu/contextMenu.html".into()))
            .title("菜单").inner_size(width, height).position(init_logical_x, init_logical_y)
            .resizable(false).maximizable(false).minimizable(false)
            .decorations(false).transparent(true).shadow(false)
            .always_on_top(true).focused(is_tray).focusable(is_tray).visible(false).skip_taskbar(true)
            .build().map_err(|e| format!("创建菜单窗口失败: {}", e))?;
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.set_position(tauri::PhysicalPosition::new(init_phys_x, init_phys_y));
        w
    };
    let _ = window.emit("reload-menu", ());
    std::thread::sleep(std::time::Duration::from_millis(100));
    let _ = window.set_always_on_top(true);
    let _ = window.show();
    if is_tray || options.force_focus {
        let _ = window.set_focus();
    }
    let _ = window.set_always_on_top(true);

    enable_passthrough(window.clone(), session_id);

    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(50));
            let has_result = super::MENU_RESULT.get().and_then(|m| m.lock().ok()).map_or(false, |r| r.is_some());
            if has_result || super::get_active_menu_session() != session_id {
                let _ = tx.send(());
                break;
            }
        }
    });
    let _ = rx.await;

    let result = if super::get_active_menu_session() == session_id { super::get_result() } else { None };
    super::clear_active_menu_session(session_id);
    super::clear_options_for_session(session_id);
    Ok(result)
}

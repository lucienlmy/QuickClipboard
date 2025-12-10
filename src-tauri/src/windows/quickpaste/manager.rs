use tauri::{AppHandle, Manager, Emitter, WebviewUrl, WebviewWindowBuilder};
use super::state::set_visible;
use crate::utils::positioning::position_at_cursor;

fn create_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    let settings = crate::get_settings();
    WebviewWindowBuilder::new(app, "quickpaste", WebviewUrl::App("windows/quickpaste/index.html".into()))
        .title("便捷粘贴")
        .inner_size(settings.quickpaste_window_width as f64, settings.quickpaste_window_height as f64)
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
        .map_err(|e| e.to_string())
}

fn get_or_create_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("quickpaste")
        .map(Ok)
        .unwrap_or_else(|| create_window(app))
}

pub fn init_quickpaste_window(app: &AppHandle) -> Result<(), String> {
    if !crate::get_settings().quickpaste_enabled || app.get_webview_window("quickpaste").is_some() {
        return Ok(());
    }
    create_window(app).map(|_| ())
}

pub fn show_quickpaste_window(app: &AppHandle) -> Result<(), String> {
    if !crate::get_settings().quickpaste_enabled {
        return Ok(());
    }
    let _ = crate::services::system::save_current_focus(app.clone());

    let window = get_or_create_window(app)?;
    position_at_cursor(&window)?;
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    set_visible(true);
    let _ = window.emit("quickpaste-show", ());
    Ok(())
}

pub fn hide_quickpaste_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("quickpaste") {
        let _ = window.hide();
        let _ = window.eval("window.location.reload()");
    }
    set_visible(false);
    Ok(())
}


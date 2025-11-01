use tauri::{AppHandle, WebviewWindow};

pub fn show_main_window(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn hide_main_window(window: &WebviewWindow) {
    let _ = window.hide();
}

pub fn toggle_main_window_visibility(app: &AppHandle) {
    if let Some(window) = super::manager::get_main_window(app) {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            hide_main_window(&window);
        } else {
            show_main_window(&window);
        }
    }
}


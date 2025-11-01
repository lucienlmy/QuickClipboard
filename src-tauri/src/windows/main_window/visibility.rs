use tauri::{AppHandle, WebviewWindow};
use super::state::{WindowState, set_window_state};

pub fn show_main_window(window: &WebviewWindow) {
    // 检查是否吸附隐藏
    if super::is_window_snapped() {
        let _ = super::restore_from_snap(window);
    }
    
    // 根据配置定位窗口
    let settings = crate::get_settings();
    match settings.window_position_mode.as_str() {
        "remember" => {
            if let Some((x, y)) = settings.saved_window_position {
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }
        "center" => {
            let _ = super::center_window(window);
        }
        _ => {
            let _ = super::position_at_cursor(window);
        }
    }
    
    // 恢复窗口大小
    if settings.remember_window_size {
        if let Some((w, h)) = settings.saved_window_size {
            let _ = window.set_size(tauri::PhysicalSize::new(w, h));
        }
    }
    
    let _ = window.show();
    
    set_window_state(WindowState::Visible);
    
    // 启用鼠标监听
    crate::input_monitor::enable_mouse_monitoring();
}

pub fn hide_main_window(window: &WebviewWindow) {
    // 检查是否需要吸附隐藏
    let settings = crate::get_settings();
    if settings.edge_hide_enabled && super::is_window_snapped() {
        let state = super::state::get_window_state();
        let _ = super::snap_to_edge(window, state.snap_edge);
        set_window_state(WindowState::Hidden);
        // 禁用鼠标监听
        crate::input_monitor::disable_mouse_monitoring();
        return;
    }
    
    let _ = window.hide();
    set_window_state(WindowState::Hidden);
    
    // 禁用鼠标监听
    crate::input_monitor::disable_mouse_monitoring();
}

pub fn toggle_main_window_visibility(app: &AppHandle) {
    if let Some(window) = super::get_main_window(app) {
        let state = super::state::get_window_state();
        
        match state.state {
            WindowState::Visible => hide_main_window(&window),
            _ => show_main_window(&window),
        }
    }
}

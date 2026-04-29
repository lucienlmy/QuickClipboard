use super::state::{set_window_state, WindowState};
use tauri::{AppHandle, Manager, WebviewWindow};

const ALWAYS_ON_TOP_REFRESH_DELAY_MS: u64 = 10;

// 显示主窗口
pub fn show_main_window(window: &WebviewWindow) {
    if crate::services::system::is_front_app_globally_disabled_from_settings() {
        return;
    }

    let state = super::state::get_window_state();

    if state.is_snapped && state.is_hidden {
        let _ = super::show_snapped_window(window);
        return;
    }

    if state.is_snapped && !state.is_hidden {
        let _ = super::restore_from_snap(window);
    }

    show_normal_window(window);
    let _ = refresh_always_on_top(window);
}

// 隐藏主窗口
pub fn hide_main_window(window: &WebviewWindow) {
    let _ = crate::windows::chat_drop_proxy::hide_chat_drop_proxy(&window.app_handle());

    if crate::is_context_menu_visible() {
        return;
    }

    let state = super::state::get_window_state();

    if state.is_snapped {
        if !state.is_hidden {
            let _ = super::hide_snapped_window(window);
        }
        return;
    }

    hide_normal_window(window);
}

pub fn toggle_main_window_visibility(app: &AppHandle) {
    if crate::services::low_memory::is_low_memory_mode() {
        if let Err(e) = crate::services::low_memory::toggle_panel() {
            eprintln!("切换低占用列表失败: {}", e);
        }
        return;
    }

    if let Some(window) = super::get_main_window(app) {
        if crate::services::system::is_front_app_globally_disabled_from_settings() {
            return;
        }

        let state = super::state::get_window_state();

        let should_show =
            state.is_snapped && state.is_hidden || state.state != WindowState::Visible;

        if should_show {
            show_main_window(&window);
        } else {
            hide_main_window(&window);
        }
    }
}

fn show_normal_window(window: &WebviewWindow) {
    crate::windows::preview_window::resume_preview_after_main_window_show();

    let state = super::state::get_window_state();
    let was_visible = state.state == WindowState::Visible;

    // 根据配置定位窗口
    let settings = crate::get_settings();
    match settings.window_position_mode.as_str() {
        "remember" => {
            if let Some((x, y)) = settings.saved_window_position {
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            } else {
                let _ = crate::utils::positioning::position_at_cursor(window);
            }
        }
        "center" => {
            let _ = crate::utils::positioning::center_window(window);
        }
        _ => {
            let _ = crate::utils::positioning::position_at_cursor(window);
        }
    }

    // 恢复窗口大小
    if settings.remember_window_size {
        if let Some((w, h)) = settings.saved_window_size {
            let _ = window.set_size(tauri::PhysicalSize::new(w, h));
        }
    }

    let _ = window.show();

    if !was_visible {
        use tauri::Emitter;
        let _ = window.emit("window-show-animation", ());
    }

    set_window_state(WindowState::Visible);

    crate::input_monitor::enable_mouse_monitoring();
    crate::input_monitor::enable_navigation_keys();
}

pub fn refresh_always_on_top(window: &WebviewWindow) -> Result<(), String> {
    window
        .set_always_on_top(false)
        .map_err(|e| format!("取消窗口置顶失败: {}", e))?;
    std::thread::sleep(std::time::Duration::from_millis(
        ALWAYS_ON_TOP_REFRESH_DELAY_MS,
    ));
    window
        .set_always_on_top(true)
        .map_err(|e| format!("恢复窗口置顶失败: {}", e))?;
    Ok(())
}

fn hide_normal_window(window: &WebviewWindow) {
    use tauri::Emitter;
    use tauri::Manager;

    crate::windows::preview_window::suppress_preview_for_main_window_hide(&window.app_handle());
    let _ = crate::windows::pin_image_window::close_image_preview(window.app_handle().clone());
    let _ = crate::windows::chat_drop_proxy::hide_chat_drop_proxy(&window.app_handle());
    #[cfg(feature = "gpu-image-viewer")]
    let _ = crate::windows::native_pin_window::close_native_image_preview();
    let _ = crate::windows::preview_window::close_preview_window(window.app_handle().clone());
    
    let _ = window.emit("window-hide-animation", ());

    let settings = crate::get_settings();
    if settings.clipboard_animation_enabled {
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    if settings.window_position_mode == "remember" {
        if let Ok(position) = window.outer_position() {
            let mut settings = crate::get_settings();
            settings.saved_window_position = Some((position.x, position.y));

            if settings.remember_window_size {
                if let Ok(size) = window.outer_size() {
                    settings.saved_window_size = Some((size.width, size.height));
                }
            }

            let _ = crate::services::update_settings(settings);
        }
    }

    if !super::state::is_pinned() {
        let _ = window.set_always_on_top(false);
    }

    let _ = window.hide();
    set_window_state(WindowState::Hidden);

    crate::input_monitor::disable_mouse_monitoring();
    crate::input_monitor::disable_navigation_keys();
}

use tauri::{WebviewWindow, Emitter, Manager};
use super::state::{SnapEdge, set_snap_edge, set_hidden, clear_snap, is_snapped};
use std::time::Duration;

const SNAP_THRESHOLD: i32 = 30;
const FRONTEND_CONTENT_INSET_LOGICAL: f64 = 5.0;

fn get_content_inset(scale_factor: f64) -> i32 {
    (FRONTEND_CONTENT_INSET_LOGICAL * scale_factor) as i32
}

pub fn check_snap(window: &WebviewWindow) -> Result<(), String> {
    let settings = crate::get_settings();
    if !settings.edge_hide_enabled {
        return Ok(());
    }
    
    let (x, y, w, h) = crate::utils::positioning::get_window_bounds(window)?;
    
    let app = window.app_handle();
    let (monitor_x, monitor_y, monitor_w, monitor_h) = 
        crate::utils::screen::ScreenUtils::get_monitor_at_point(app, x, y)?;
    let monitor_right = monitor_x + monitor_w;
    let monitor_bottom = monitor_y + monitor_h;
    
    let (left_is_edge, right_is_edge, top_is_edge, bottom_is_edge) = 
        crate::utils::screen::ScreenUtils::get_real_edges_at_point(app, x, y)?;
    
    let edge = if left_is_edge && (x - monitor_x).abs() <= SNAP_THRESHOLD {
        Some(SnapEdge::Left)
    } else if right_is_edge && (monitor_right - (x + w as i32)).abs() <= SNAP_THRESHOLD {
        Some(SnapEdge::Right)
    } else if top_is_edge && (y - monitor_y).abs() <= SNAP_THRESHOLD {
        Some(SnapEdge::Top)
    } else if bottom_is_edge && (monitor_bottom - (y + h as i32)).abs() <= SNAP_THRESHOLD {
        Some(SnapEdge::Bottom)
    } else {
        None
    };
    
    if let Some(edge) = edge {
        set_snap_edge(edge, Some((x, y)));
        snap_to_edge(window, edge)?;
        super::edge_monitor::start_edge_monitoring();
    } else {
        clear_snap();
        super::edge_monitor::stop_edge_monitoring();
    }
    
    Ok(())
}

pub fn snap_to_edge(window: &WebviewWindow, edge: SnapEdge) -> Result<(), String> {
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y, _, _) = crate::utils::positioning::get_window_bounds(window)?;
    
    // 使用当前显示器边界
    let (monitor_x, monitor_y, monitor_w, monitor_h) = 
        crate::utils::screen::ScreenUtils::get_monitor_at_point(window.app_handle(), x, y)?;
    let monitor_right = monitor_x + monitor_w;
    let monitor_bottom = monitor_y + monitor_h;
    
    let scale_factor = crate::utils::screen::ScreenUtils::get_scale_factor_at_point(
        window.app_handle(), x, y
    );
    let content_inset = get_content_inset(scale_factor);
    
    let (new_x, new_y) = match edge {
        SnapEdge::Left => (monitor_x - content_inset, y),
        SnapEdge::Right => (monitor_right - size.width as i32 + content_inset, y),
        SnapEdge::Top => (x, monitor_y - content_inset),
        SnapEdge::Bottom => (x, monitor_bottom - size.height as i32 + content_inset),
        SnapEdge::None => return Ok(()),
    };
    
    window.set_position(tauri::PhysicalPosition::new(new_x, new_y))
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

pub fn hide_snapped_window(window: &WebviewWindow) -> Result<(), String> {
    use tauri::Manager;
    
    let state = super::state::get_window_state();
    
    if !state.is_snapped || state.is_hidden {
        return Ok(());
    }
    
    if crate::is_context_menu_visible() {
        return Ok(());
    }

    let _ = crate::windows::pin_image_window::close_image_preview(window.app_handle().clone());
    
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y, _, _) = crate::utils::positioning::get_window_bounds(window)?;
    
    // 使用当前显示器边界
    let (monitor_x, monitor_y, monitor_w, monitor_h) = 
        crate::utils::screen::ScreenUtils::get_monitor_at_point(window.app_handle(), x, y)?;
    let monitor_right = monitor_x + monitor_w;
    let monitor_bottom = monitor_y + monitor_h;
    
    let settings = crate::get_settings();
    
    let scale_factor = crate::utils::screen::ScreenUtils::get_scale_factor_at_point(
        window.app_handle(), x, y
    );
    let content_inset = get_content_inset(scale_factor);
    
    let hide_offset = if settings.edge_hide_offset == 0 {
        0
    } else {
        content_inset + settings.edge_hide_offset
    };
    let (hide_x, hide_y) = match state.snap_edge {
        SnapEdge::Left => {
            (monitor_x - size.width as i32 + hide_offset, y)
        }
        SnapEdge::Right => {
            (monitor_right - hide_offset, y)
        }
        SnapEdge::Top => {
            (x, monitor_y - size.height as i32 + hide_offset)
        }
        SnapEdge::Bottom => {
            (x, monitor_bottom - hide_offset)
        }
        SnapEdge::None => return Ok(()),
    };
    
    // 根据动画配置决定是否使用过渡
    if settings.clipboard_animation_enabled {
        animate_window_position(window, x, y, hide_x, hide_y, 200)?;
    } else {
        window.set_position(tauri::PhysicalPosition::new(hide_x, hide_y))
            .map_err(|e| e.to_string())?;
    }
    set_hidden(true);
    
    // 保存贴边隐藏位置到设置
    save_edge_snap_position(hide_x, hide_y);
    
    super::state::set_window_state(super::state::WindowState::Hidden);
    
    crate::input_monitor::disable_mouse_monitoring();
    crate::input_monitor::disable_navigation_keys();
    
    Ok(())
}

pub fn show_snapped_window(window: &WebviewWindow) -> Result<(), String> {
    let state = super::state::get_window_state();
    
    if !state.is_snapped || !state.is_hidden {
        return Ok(());
    }
    
    if let Err(e) = crate::services::paste::keyboard::release_modifier_keys() {
        eprintln!("释放修饰键失败: {}", e);
    }
    
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y, _, _) = crate::utils::positioning::get_window_bounds(window)?;
    
    // 使用当前显示器边界
    let (monitor_x, monitor_y, monitor_w, monitor_h) = 
        crate::utils::screen::ScreenUtils::get_monitor_at_point(window.app_handle(), x, y)?;
    let monitor_right = monitor_x + monitor_w;
    let monitor_bottom = monitor_y + monitor_h;
    
    let scale_factor = crate::utils::screen::ScreenUtils::get_scale_factor_at_point(
        window.app_handle(), x, y
    );
    let content_inset = get_content_inset(scale_factor);
    
    let (show_x, show_y) = match state.snap_edge {
        SnapEdge::Left => (monitor_x - content_inset, y),
        SnapEdge::Right => (monitor_right - size.width as i32 + content_inset, y),
        SnapEdge::Top => (x, monitor_y - content_inset),
        SnapEdge::Bottom => (x, monitor_bottom - size.height as i32 + content_inset),
        SnapEdge::None => return Ok(()),
    };
    
    let _ = window.show();
    
    // 根据动画配置决定是否使用过渡
    let settings = crate::get_settings();
    let direction = match state.snap_edge {
        SnapEdge::Left => "left",
        SnapEdge::Right => "right",
        SnapEdge::Top => "top",
        SnapEdge::Bottom => "bottom",
        SnapEdge::None => "top",
    };
    
    if settings.clipboard_animation_enabled {
        animate_window_position(window, x, y, show_x, show_y, 200)?;
        let _ = window.emit("edge-snap-bounce-animation", direction);
    } else {
        window.set_position(tauri::PhysicalPosition::new(show_x, show_y))
            .map_err(|e| e.to_string())?;
        let _ = window.emit("edge-snap-bounce-animation", direction);
    }
    set_hidden(false);
    
    super::state::set_window_state(super::state::WindowState::Visible);
    let _ = window.set_always_on_top(false);
    std::thread::sleep(std::time::Duration::from_millis(10));
    let _ = window.set_always_on_top(true);
    
    crate::input_monitor::enable_mouse_monitoring();
    crate::input_monitor::enable_navigation_keys();
    
    Ok(())
}

fn animate_window_position(
    window: &WebviewWindow,
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    duration_ms: u64,
) -> Result<(), String> {
    let window_clone = window.clone();
    
    std::thread::spawn(move || {
        let frame_duration = Duration::from_millis(16);
        let total_frames = duration_ms / 16;
        
        if total_frames == 0 {
            let _ = window_clone.set_position(tauri::PhysicalPosition::new(end_x, end_y));
            return;
        }
        
        let dx = end_x - start_x;
        let dy = end_y - start_y;
        
        for frame in 0..=total_frames {
            let progress = frame as f32 / total_frames as f32;
            let eased_progress = 1.0 - (1.0 - progress).powi(3);
            
            let current_x = start_x + (dx as f32 * eased_progress) as i32;
            let current_y = start_y + (dy as f32 * eased_progress) as i32;
            
            let _ = window_clone.set_position(tauri::PhysicalPosition::new(current_x, current_y));
            
            if frame < total_frames {
                std::thread::sleep(frame_duration);
            }
        }
    });
    
    Ok(())
}

pub fn restore_from_snap(window: &WebviewWindow) -> Result<(), String> {
    let state = super::state::get_window_state();
    
    if let Some(pos) = state.snap_position {
        window.set_position(tauri::PhysicalPosition::new(pos.0, pos.1))
            .map_err(|e| e.to_string())?;
    }
    
    clear_snap();
    Ok(())
}

pub fn is_window_snapped() -> bool {
    is_snapped()
}

// 保存贴边隐藏位置到设置
fn save_edge_snap_position(x: i32, y: i32) {
    let _ = crate::services::settings::update_with(|settings| {
        settings.edge_snap_position = Some((x, y));
    });
}

// 启动时恢复贴边隐藏状态
pub fn restore_edge_snap_on_startup(window: &WebviewWindow) -> Result<(), String> {
    let settings = crate::get_settings();

    if !settings.edge_hide_enabled {
        return Ok(());
    }
    
    let (saved_x, saved_y) = match settings.edge_snap_position {
        Some(pos) => pos,
        None => return Ok(()),
    };
    
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (w, h) = (size.width as i32, size.height as i32);
    
    let monitors = crate::utils::screen::ScreenUtils::get_all_monitors_with_edges(window.app_handle())?;
    
    let find_monitor = |x: i32, y: i32| -> Option<(i32, i32, i32, i32, bool, bool, bool, bool)> {
        let cx = x + w / 2;
        let cy = y + h / 2;
        
        for m in &monitors {
            let (mx, my, mw, mh, _, _, _, _) = *m;
            if cx >= mx && cx < mx + mw && cy >= my && cy < my + mh {
                return Some(*m);
            }
        }
        
        for m in &monitors {
            let (mx, my, mw, mh, _, _, _, _) = *m;
            let m_right = mx + mw;
            let m_bottom = my + mh;
            
            if x < m_right && x + w > mx && y < m_bottom && y + h > my {
                return Some(*m);
            }
        }
        
        None
    };
    
    let monitor = match find_monitor(saved_x, saved_y) {
        Some(m) => m,
        None => {
            let _ = crate::services::settings::update_with(|s| {
                s.edge_snap_position = None;
            });
            return Ok(());
        }
    };
    
    let (monitor_x, monitor_y, monitor_w, monitor_h, left_edge, right_edge, top_edge, bottom_edge) = monitor;
    let monitor_right = monitor_x + monitor_w;
    let monitor_bottom = monitor_y + monitor_h;
    
    let snapped_edge = if saved_x <= monitor_x && left_edge {
        SnapEdge::Left
    } else if saved_x >= monitor_right - w && right_edge {
        SnapEdge::Right
    } else if saved_y <= monitor_y && top_edge {
        SnapEdge::Top
    } else if saved_y >= monitor_bottom - h && bottom_edge {
        SnapEdge::Bottom
    } else {
        let _ = crate::services::settings::update_with(|s| {
            s.edge_snap_position = None;
        });
        return Ok(());
    };
    
    let scale_factor = crate::utils::screen::ScreenUtils::get_scale_factor_at_point(
        window.app_handle(), saved_x, saved_y
    );
    let content_inset = get_content_inset(scale_factor);
    
    let corrected_y = saved_y.max(monitor_y).min(monitor_bottom - h);
    let corrected_x = saved_x.max(monitor_x - w + content_inset).min(monitor_right - content_inset);
    
    let (final_x, final_y) = match snapped_edge {
        SnapEdge::Left | SnapEdge::Right => (saved_x, corrected_y),
        SnapEdge::Top | SnapEdge::Bottom => (corrected_x, saved_y),
        SnapEdge::None => (saved_x, saved_y),
    };
    
    set_snap_edge(snapped_edge, Some((final_x, final_y)));
    set_hidden(true);
    
    window.set_position(tauri::PhysicalPosition::new(final_x, final_y))
        .map_err(|e| e.to_string())?;
    
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    
    super::state::set_window_state(super::state::WindowState::Hidden);
    
    crate::input_monitor::disable_mouse_monitoring();
    crate::input_monitor::disable_navigation_keys();
    
    super::edge_monitor::start_edge_monitoring();
    
    Ok(())
}


use tauri::{WebviewWindow, Emitter};
use super::state::{SnapEdge, set_snap_edge, set_hidden, clear_snap, is_snapped};
use std::time::Duration;

const SNAP_THRESHOLD: i32 = 30;
const FRONTEND_CONTENT_INSET: i32 = 5;
const FRONTEND_SHADOW_PADDING: i32 = 7;

pub fn check_snap(window: &WebviewWindow) -> Result<(), String> {
    let settings = crate::get_settings();
    if !settings.edge_hide_enabled {
        return Ok(());
    }
    
    let (x, y, w, h) = crate::utils::positioning::get_window_bounds(window)?;
    
    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size()?;
    let monitor_bottom = crate::utils::screen::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);
    
    // 检查窗口是否在边缘附近
    let edge = if (x - vx).abs() <= SNAP_THRESHOLD {
        Some(SnapEdge::Left)
    } else if ((vx + vw) - (x + w as i32)).abs() <= SNAP_THRESHOLD {
        Some(SnapEdge::Right)
    } else if (y - vy).abs() <= SNAP_THRESHOLD {
        Some(SnapEdge::Top)
    } else if (monitor_bottom - (y + h as i32)).abs() <= SNAP_THRESHOLD {
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
    
    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size()?;
    let monitor_bottom = crate::utils::screen::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);
    
    let (new_x, new_y) = match edge {
        SnapEdge::Left => (vx - FRONTEND_CONTENT_INSET, y),
        SnapEdge::Right => (vx + vw - size.width as i32 + FRONTEND_CONTENT_INSET, y),
        SnapEdge::Top => (x, vy - FRONTEND_CONTENT_INSET),
        SnapEdge::Bottom => (x, monitor_bottom - size.height as i32 + FRONTEND_CONTENT_INSET),
        SnapEdge::None => return Ok(()),
    };
    
    window.set_position(tauri::PhysicalPosition::new(new_x, new_y))
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

pub fn hide_snapped_window(window: &WebviewWindow) -> Result<(), String> {
    let state = super::state::get_window_state();
    
    if !state.is_snapped || state.is_hidden {
        return Ok(());
    }
    
    if crate::is_context_menu_visible() {
        return Ok(());
    }
    
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y, _, _) = crate::utils::positioning::get_window_bounds(window)?;
    
    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size()?;
    let monitor_bottom = crate::utils::screen::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);
    
    let settings = crate::get_settings();
    
    let hide_offset = if settings.edge_hide_offset == 0 {
        0
    } else {
        settings.edge_hide_offset + FRONTEND_SHADOW_PADDING
    };
    let (hide_x, hide_y) = match state.snap_edge {
        SnapEdge::Left => {
            (vx - size.width as i32 + hide_offset, y)
        }
        SnapEdge::Right => {
            (vx + vw - hide_offset, y)
        }
        SnapEdge::Top => {
            (x, vy - size.height as i32 + hide_offset)
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
    
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y, _, _) = crate::utils::positioning::get_window_bounds(window)?;
    
    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size()?;
    let monitor_bottom = crate::utils::screen::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);
    
    let (show_x, show_y) = match state.snap_edge {
        SnapEdge::Left => (vx - FRONTEND_CONTENT_INSET, y),
        SnapEdge::Right => (vx + vw - size.width as i32 + FRONTEND_CONTENT_INSET, y),
        SnapEdge::Top => (x, vy - FRONTEND_CONTENT_INSET),
        SnapEdge::Bottom => (x, monitor_bottom - size.height as i32 + FRONTEND_CONTENT_INSET),
        SnapEdge::None => return Ok(()),
    };
    
    let _ = window.show();
    
    // 根据动画配置决定是否使用过渡
    let settings = crate::get_settings();
    if settings.clipboard_animation_enabled {
        animate_window_position(window, x, y, show_x, show_y, 200)?;
        
        let direction = match state.snap_edge {
            SnapEdge::Left => "left",
            SnapEdge::Right => "right",
            SnapEdge::Top => "top",
            SnapEdge::Bottom => "bottom",
            SnapEdge::None => "top",
        };
        
        let _ = window.emit("edge-snap-bounce-animation", direction);
    } else {
        window.set_position(tauri::PhysicalPosition::new(show_x, show_y))
            .map_err(|e| e.to_string())?;
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
    
    let (x, y) = match settings.edge_snap_position {
        Some(pos) => pos,
        None => return Ok(()),
    };
    
    // 根据保存的位置推断贴边的边缘
    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size()?;
    let _monitor_bottom = crate::utils::screen::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);
    
    let snapped_edge = if x <= vx {
        SnapEdge::Left
    } else if x >= vx + vw - 100 {
        SnapEdge::Right
    } else if y <= vy {
        SnapEdge::Top
    } else {
        SnapEdge::Bottom
    };
    
    // 设置贴边状态
    set_snap_edge(snapped_edge, Some((x, y)));
    set_hidden(true);
    
    // 设置窗口位置
    window.set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    
    // 显示窗口
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    
    super::state::set_window_state(super::state::WindowState::Hidden);
    
    // 禁用输入监听
    crate::input_monitor::disable_mouse_monitoring();
    crate::input_monitor::disable_navigation_keys();
    
    // 启动边缘监听
    super::edge_monitor::start_edge_monitoring();
    
    Ok(())
}


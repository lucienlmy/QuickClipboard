use tauri::WebviewWindow;
use super::state::{SnapEdge, set_snap_edge, set_hidden, clear_snap, is_snapped};
use std::time::Duration;

const SNAP_THRESHOLD: i32 = 30;
const FRONTEND_CONTENT_INSET: i32 = 5;

pub fn check_snap(window: &WebviewWindow) -> Result<(), String> {
    let settings = crate::get_settings();
    if !settings.edge_hide_enabled {
        return Ok(());
    }
    
    let (x, y, w, h) = super::positioning::get_window_bounds(window)?;
    
    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size()?;
    let monitor_bottom = crate::utils::screen::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);
    
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
    let (x, y, _, _) = super::positioning::get_window_bounds(window)?;
    
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

    if state.is_pinned {
        return Ok(());
    }
    
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (x, y, _, _) = super::positioning::get_window_bounds(window)?;
    
    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size()?;
    let monitor_bottom = crate::utils::screen::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);
    
    let settings = crate::get_settings();
    
    let (hide_x, hide_y) = match state.snap_edge {
        SnapEdge::Left => {
            let hide_offset = settings.edge_hide_offset + FRONTEND_CONTENT_INSET;
            (vx - size.width as i32 + hide_offset, y)
        }
        SnapEdge::Right => {
            let hide_offset = settings.edge_hide_offset + FRONTEND_CONTENT_INSET;
            (vx + vw - hide_offset, y)
        }
        SnapEdge::Top => {
            let hide_offset = settings.edge_hide_offset + FRONTEND_CONTENT_INSET;
            (x, vy - size.height as i32 + hide_offset)
        }
        SnapEdge::Bottom => {
            let hide_offset = settings.edge_hide_offset + FRONTEND_CONTENT_INSET;
            (x, monitor_bottom - hide_offset)
        }
        SnapEdge::None => return Ok(()),
    };
    
    animate_window_position(window, x, y, hide_x, hide_y, 200)?;
    set_hidden(true);
    
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
    let (x, y, _, _) = super::positioning::get_window_bounds(window)?;
    
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
    
    animate_window_position(window, x, y, show_x, show_y, 200)?;
    set_hidden(false);
    
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


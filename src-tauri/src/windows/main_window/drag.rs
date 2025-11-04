use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::time::Duration;
use tauri::{PhysicalPosition, WebviewWindow};

const MAGNETIC_DISTANCE: i32 = 40;
const MAGNETIC_SNAP_INSET: i32 = 5;
const DRAG_UPDATE_INTERVAL_MICROS: u64 = 500;

#[derive(Debug, Clone)]
struct CustomDragState {
    is_dragging: bool,
    window: WebviewWindow,
    mouse_offset_x: i32,
    mouse_offset_y: i32,
}

static CUSTOM_DRAG_STATE: Lazy<Mutex<Option<CustomDragState>>> = Lazy::new(|| Mutex::new(None));

// 开始自定义拖拽
pub fn start_drag(window: &WebviewWindow, mouse_screen_x: i32, mouse_screen_y: i32) -> Result<(), String> {
    let physical_position = window
        .outer_position()
        .map_err(|e| format!("获取窗口位置失败: {}", e))?;
    let scale_factor = window.scale_factor().map_err(|e| format!("获取缩放因子失败: {}", e))?;

    let mouse_physical_x = (mouse_screen_x as f64 * scale_factor).round() as i32;
    let mouse_physical_y = (mouse_screen_y as f64 * scale_factor).round() as i32;

    let mouse_offset_x = mouse_physical_x - physical_position.x;
    let mouse_offset_y = mouse_physical_y - physical_position.y;

    {
        let mut drag_state = CUSTOM_DRAG_STATE.lock();
        *drag_state = Some(CustomDragState {
            is_dragging: true,
            window: window.clone(),
            mouse_offset_x,
            mouse_offset_y,
        });
    }

    super::state::set_dragging(true);

    if super::state::is_snapped() {
        super::clear_snap();
        super::edge_monitor::stop_edge_monitoring();
    }
    
    start_drag_monitoring_thread();

    Ok(())
}

// 停止自定义拖拽
pub fn stop_drag(window: &WebviewWindow) -> Result<(), String> {
    {
        let mut drag_state = CUSTOM_DRAG_STATE.lock();
        if let Some(ref mut state) = drag_state.as_mut() {
            state.is_dragging = false;
        }
    }

    super::state::set_dragging(false);

    let window = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(100));
        let _ = super::check_snap(&window);
    });

    Ok(())
}

// 启动拖拽监控线程
fn start_drag_monitoring_thread() {
    std::thread::spawn(|| {
        loop {
            let (window, mouse_offset_x, mouse_offset_y) = {
                let state = CUSTOM_DRAG_STATE.lock();
                if let Some(ref drag_state) = state.as_ref() {
                    if !drag_state.is_dragging {
                        break;
                    }
                    (
                        drag_state.window.clone(),
                        drag_state.mouse_offset_x,
                        drag_state.mouse_offset_y,
                    )
                } else {
                    break;
                }
            };

            let (cursor_x, cursor_y) = match crate::mouse::get_cursor_position() {
                Ok(pos) => pos,
                Err(_) => continue,
            };

            let new_physical_x = cursor_x - mouse_offset_x;
            let new_physical_y = cursor_y - mouse_offset_y;

            if let Ok((final_x, final_y)) = apply_magnetic_snap_and_bounds(new_physical_x, new_physical_y, &window) {
                let _ = window.set_position(PhysicalPosition::new(final_x, final_y));
            }

            std::thread::sleep(Duration::from_micros(DRAG_UPDATE_INTERVAL_MICROS));
        }
    });
}

// 应用磁性吸附和边界约束
fn apply_magnetic_snap_and_bounds(mut x: i32, mut y: i32, window: &WebviewWindow) -> Result<(i32, i32), String> {
    let window_size = window.outer_size().map_err(|e| e.to_string())?;
    let pw = window_size.width as i32;
    let ph = window_size.height as i32;

    let (constrained_x, constrained_y) = crate::utils::screen::ScreenUtils::constrain_to_physical_bounds(x, y, pw, ph, window)
        .unwrap_or((x, y));

    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size_from_window(window)?;
    let monitor_bottom = crate::utils::screen::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);

    // 应用磁性吸附
    if (constrained_x - vx).abs() <= MAGNETIC_DISTANCE {
        // 左边缘
        x = vx - MAGNETIC_SNAP_INSET;
    } else if ((vx + vw) - (constrained_x + pw)).abs() <= MAGNETIC_DISTANCE {
        // 右边缘
        x = vx + vw - pw + MAGNETIC_SNAP_INSET;
    } else {
        x = constrained_x;
    }

    if (constrained_y - vy).abs() <= MAGNETIC_DISTANCE {
        // 上边缘
        y = vy - MAGNETIC_SNAP_INSET;
    } else if (monitor_bottom - (constrained_y + ph)).abs() <= MAGNETIC_DISTANCE {
        // 下边缘
        y = monitor_bottom - ph + MAGNETIC_SNAP_INSET;
    } else {
        y = constrained_y;
    }

    Ok((x, y))
}

// 检查是否正在拖拽
pub fn is_dragging() -> bool {
    let state = CUSTOM_DRAG_STATE.lock();
    state.as_ref().map_or(false, |s| s.is_dragging)
}

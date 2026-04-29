use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{WebviewWindow, Manager};

static MAIN_WINDOW: Mutex<Option<WebviewWindow>> = Mutex::new(None);
static MONITORING_ACTIVE: AtomicBool = AtomicBool::new(false);
static RESIZE_SUPPRESS_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

const RESIZE_SUPPRESS_DURATION_MS: u64 = 400;

pub fn init_edge_monitor(window: WebviewWindow) {
    let window_for_event = window.clone();
    window_for_event.on_window_event(|event| {
        match event {
            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. } => {
                // 调整窗口大小时，系统会持续重算边框位置，短暂暂停贴边自动切换避免闪烁
                suppress_edge_actions_after_resize();
            }
            _ => {}
        }
    });

    *MAIN_WINDOW.lock() = Some(window);
}

pub fn start_edge_monitoring() {
    let was_active = MONITORING_ACTIVE.swap(true, Ordering::Relaxed);
    
    if was_active {
        return;
    }
    
    std::thread::spawn(|| {
        // 初始缓冲期，避免贴边后立即触发隐藏
        std::thread::sleep(Duration::from_millis(200));
        
        let mut last_near_state = false;
        let mut last_hidden_state = false;
        
        loop {
            if !MONITORING_ACTIVE.load(Ordering::Relaxed) {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            
            let window = match MAIN_WINDOW.lock().clone() {
                Some(w) => w,
                None => {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
            };

            let state = crate::get_window_state();

            if is_resize_suppressed() {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }

            // 拖拽时跳过监控
            if !state.is_snapped || state.is_dragging {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
 
            if last_hidden_state != state.is_hidden {
                last_hidden_state = state.is_hidden;
                if let Ok(is_near) = check_mouse_near_edge(&window, &state) {
                    last_near_state = is_near;
                }
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }

            let is_near = match check_mouse_near_edge(&window, &state) {
                Ok(near) => near,
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(100));
                    continue;
                }
            };

            let state_changed = is_near != last_near_state;
            if !state_changed {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }

            if is_near && state.is_hidden {
                if !crate::services::system::is_front_app_globally_disabled_from_settings() {
                    let _ = crate::show_snapped_window(&window);
                }
            } else if !is_near && !state.is_hidden && !state.is_pinned {
                let _ = crate::hide_snapped_window(&window);
            }
            
            last_near_state = is_near;
            std::thread::sleep(Duration::from_millis(50));
        }
    });
}

pub fn stop_edge_monitoring() {
    MONITORING_ACTIVE.store(false, Ordering::Relaxed);
}

fn suppress_edge_actions_after_resize() {
    let now_ms = current_time_millis();
    RESIZE_SUPPRESS_UNTIL_MS.store(
        now_ms.saturating_add(RESIZE_SUPPRESS_DURATION_MS),
        Ordering::SeqCst,
    );
}

fn is_resize_suppressed() -> bool {
    current_time_millis() < RESIZE_SUPPRESS_UNTIL_MS.load(Ordering::SeqCst)
}

fn current_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

const CONTENT_INSET_LOGICAL: f64 = 5.0;

fn check_mouse_near_edge(
    window: &WebviewWindow,
    state: &super::state::MainWindowState,
) -> Result<bool, String> {
    let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
    let (win_x, win_y, win_width, win_height) = crate::get_window_bounds(window)?;
    let (reference_x, reference_y) =
        super::snap::get_snap_monitor_reference_point(state, win_x, win_y);
    
    let (monitor_x, monitor_y, monitor_w, monitor_h) = 
        crate::utils::screen::ScreenUtils::get_monitor_at_point(
            window.app_handle(),
            reference_x,
            reference_y,
        )?;
    let monitor_right = monitor_x + monitor_w;
    let monitor_bottom = monitor_y + monitor_h;

    let scale_factor = crate::utils::screen::ScreenUtils::get_scale_factor_at_point(
        window.app_handle(), reference_x, reference_y
    );
    
    let settings = crate::get_settings();
    let base_trigger = if settings.edge_hide_offset >= 10 {
        settings.edge_hide_offset
    } else {
        10
    };
    
    // 检查鼠标是否在窗口内
    let mouse_in_window = cursor_x >= win_x
        && cursor_x <= win_x + win_width as i32
        && cursor_y >= win_y
        && cursor_y <= win_y + win_height as i32;
    
    // 检查鼠标是否接近对应边缘（使用当前显示器边界）
    let content_inset = (CONTENT_INSET_LOGICAL * scale_factor) as i32;
    let trigger_distance = base_trigger + content_inset;
    
    let is_near = match state.snap_edge {
        super::state::SnapEdge::Left => {
            cursor_x <= monitor_x + trigger_distance
                && cursor_y >= win_y
                && cursor_y <= win_y + win_height as i32
        }
        super::state::SnapEdge::Right => {
            cursor_x >= monitor_right - trigger_distance
                && cursor_y >= win_y
                && cursor_y <= win_y + win_height as i32
        }
        super::state::SnapEdge::Top => {
            cursor_y <= monitor_y + trigger_distance
                && cursor_x >= win_x
                && cursor_x <= win_x + win_width as i32
        }
        super::state::SnapEdge::Bottom => {
            cursor_y >= monitor_bottom - trigger_distance
                && cursor_x >= win_x
                && cursor_x <= win_x + win_width as i32
        }
        super::state::SnapEdge::None => false,
    };
    
    Ok(is_near || mouse_in_window)
}


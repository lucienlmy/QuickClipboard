use parking_lot::Mutex;
use std::time::{Duration, Instant};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::WebviewWindow;
use windows::Win32::Foundation::{POINT, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

// 边缘吸附配置
#[derive(Debug, Clone)]
pub struct EdgeSnapConfig {
    pub snap_distance: i32,
}

impl Default for EdgeSnapConfig {
    fn default() -> Self {
        Self {
            snap_distance: 20, // 窗口吸附到边缘的距离
        }
    }
}

// 获取隐藏偏移量
fn get_hide_offset() -> i32 {
    let settings = crate::settings::get_global_settings();
    settings.edge_hide_offset
}

// 获取触发距离
fn get_trigger_distance() -> i32 {
    let hide_offset = get_hide_offset();
    if hide_offset >= 10 {
        hide_offset 
    } else {
        10 
    }
}

// 吸附边缘枚举
#[derive(Debug, Clone, PartialEq)]
pub enum SnapEdge {
    Left,
    Right,
    Top,
    Bottom,
}

// 边缘吸附状态
#[derive(Debug, Clone)]
pub struct EdgeSnapState {
    pub is_enabled: bool,
    pub is_snapped: bool,
    pub snapped_edge: Option<SnapEdge>,
    pub original_position: Option<(i32, i32)>,
    pub is_hidden: bool,
}

// 全局状态管理
use once_cell::sync::Lazy;
static EDGE_SNAP_CONFIG: Lazy<EdgeSnapConfig> = Lazy::new(|| EdgeSnapConfig::default());
static EDGE_SNAP_MANAGER: Lazy<Mutex<EdgeSnapState>> = Lazy::new(|| Mutex::new(EdgeSnapState {
    is_enabled: false,
    is_snapped: false,
    snapped_edge: None,
    original_position: None,
    is_hidden: false,
}));
// 鼠标监听线程控制
static MOUSE_MONITORING_ACTIVE: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));

// 初始化边缘吸附功能
pub fn init_edge_snap() -> Result<(), String> {
    let settings = crate::settings::get_global_settings();
    let mut state = EDGE_SNAP_MANAGER.lock();
    state.is_enabled = settings.edge_hide_enabled;
    
    // 同步到状态管理器
    crate::state_manager::set_edge_snap_enabled(settings.edge_hide_enabled);
    Ok(())
}


// 检查窗口是否需要吸附到边缘
pub fn check_window_snap(window: &WebviewWindow) -> Result<(), String> {
    // 使用新的状态管理器检查是否应该启用贴边隐藏
    if !crate::state_manager::should_enable_edge_hide() {
        return Ok(());
    }

    let window_rect = get_window_rect(window)?;
    let _virtual_desktop = get_virtual_screen_size()?;
    let snap_target = get_snap_target(window, &window_rect);

    // 处理状态更新
    {
        let mut state = EDGE_SNAP_MANAGER.lock();

        if !state.is_enabled {
            return Ok(());
        }

        if let Some((ref edge, snap_x, snap_y)) = snap_target {
            // 保存原始位置
            if state.original_position.is_none() {
                state.original_position = Some((window_rect.left, window_rect.top));
            }

            // 设置窗口到吸附位置
            set_window_position(window, snap_x, snap_y)?;

            // 更新状态
            state.is_snapped = true;
            state.snapped_edge = Some(edge.clone());
            state.is_hidden = false;
            
            // 同步到状态管理器
            crate::state_manager::set_edge_snap_active(true);
        } else if state.is_snapped {
            // 窗口不在边缘但之前是贴边状态，清除贴边状态
            state.is_snapped = false;
            state.snapped_edge = None;
            state.original_position = None;
            state.is_hidden = false;
            
            // 同步到状态管理器
            crate::state_manager::set_edge_snap_active(false);
        }
    }

    // 释放锁后启动监听（不立即隐藏，让用户有机会操作）
    if snap_target.is_some() {
        // 启动鼠标监听，让鼠标监听决定何时隐藏
        start_mouse_monitoring(window.clone())?;
    }

    Ok(())
}

// 恢复窗口到原始位置
pub fn restore_window_from_snap(window: &WebviewWindow) -> Result<(), String> {
    // 停止鼠标监听
    stop_mouse_monitoring();
    
    let mut state = EDGE_SNAP_MANAGER.lock();

    if let Some((orig_x, orig_y)) = state.original_position {
        set_window_position(window, orig_x, orig_y)?;

        // 清理状态
        state.is_snapped = false;
        state.snapped_edge = None;
        state.original_position = None;
        state.is_hidden = false;
    }

    Ok(())
}

// 获取虚拟桌面尺寸（screen_utils）
pub fn get_virtual_screen_size() -> Result<(i32, i32, i32, i32), String> {
    crate::screenshot::screen_utils::ScreenUtils::get_virtual_screen_size()
}

// 检查是否需要吸附到边缘（通用边界信息）
fn get_snap_target(window: &WebviewWindow, window_rect: &RECT) -> Option<(SnapEdge, i32, i32)> {
    let snap_distance = EDGE_SNAP_CONFIG.snap_distance;

    // 使用通用函数获取边界信息
    let virtual_desktop = crate::screenshot::screen_utils::ScreenUtils::get_virtual_screen_size().ok()?;
    let (vx, vy, vw, vh) = virtual_desktop;
    let monitor_bottom = crate::screenshot::screen_utils::ScreenUtils::get_monitor_bounds(window)
        .map(|(_, my, _, mh)| my + mh)
        .unwrap_or(vy + vh);

    let window_width = window_rect.right - window_rect.left;
    let window_height = window_rect.bottom - window_rect.top;

    // 检查各边缘（左右上用虚拟桌面，下用当前显示器）
    if (window_rect.left - vx).abs() <= snap_distance {
        Some((SnapEdge::Left, vx, window_rect.top))
    } else if ((vx + vw) - window_rect.right).abs() <= snap_distance {
        Some((SnapEdge::Right, vx + vw - window_width, window_rect.top))
    } else if (window_rect.top - vy).abs() <= snap_distance {
        Some((SnapEdge::Top, window_rect.left, vy))
    } else if (monitor_bottom - window_rect.bottom).abs() <= snap_distance {
        Some((
            SnapEdge::Bottom,
            window_rect.left,
            monitor_bottom - window_height,
        ))
    } else {
        None
    }
}

// 隐藏已吸附的窗口
pub fn hide_snapped_window(window: &WebviewWindow) -> Result<(), String> {
    // 如果右键菜单正在显示，不隐藏窗口
    if crate::state_manager::is_context_menu_visible() {
        return Ok(());
    }
    
    // 使用新的状态管理器检查是否应该启用贴边隐藏
    if !crate::state_manager::should_enable_edge_hide() {
        return Ok(());
    }

    let edge = {
        let state = EDGE_SNAP_MANAGER.lock();
        if !state.is_snapped || state.is_hidden {
            return Ok(());
        }
        state
            .snapped_edge
            .as_ref()
            .ok_or("没有吸附边缘信息")?
            .clone()
    };

    let hide_offset = get_hide_offset();
    let window_rect = get_window_rect(window)?;
    let (vx, vy, vw, vh) = get_virtual_screen_size()?;
        let monitor_bottom = crate::screenshot::screen_utils::ScreenUtils::get_monitor_bounds(window)
            .map(|(_, my, _, mh)| my + mh)
            .unwrap_or(vy + vh);

    let window_width = window_rect.right - window_rect.left;
    let window_height = window_rect.bottom - window_rect.top;

    // 计算隐藏位置
    let (hide_x, hide_y) = match edge {
        SnapEdge::Left => (vx - window_width + hide_offset, window_rect.top),
        SnapEdge::Right => (vx + vw - hide_offset, window_rect.top),
        SnapEdge::Top => (window_rect.left, vy - window_height + hide_offset),
        SnapEdge::Bottom => (window_rect.left, monitor_bottom - hide_offset),
    };

    // 执行平滑隐藏动画
    animate_window_position(
        window,
        window_rect.left,
        window_rect.top,
        hide_x,
        hide_y,
        200,
    )?;
    EDGE_SNAP_MANAGER.lock().is_hidden = true;

    #[cfg(windows)]
    crate::mouse_hook::release_mouse_monitoring("main_window");

    // 禁用导航按键，避免影响用户在其他应用中的操作
    #[cfg(windows)]
    crate::shortcut_interceptor::disable_navigation_keys();

    // 保存贴边位置
    let mut settings = crate::settings::get_global_settings();
    settings.edge_snap_position = Some((hide_x, hide_y));
    let _ = crate::settings::update_global_settings(settings);

    // 发送贴边隐藏事件给前端
    {
        use tauri::Emitter;
        let _ = window.emit("edge-snap-hide-animation", ());
        // println!("发送贴边隐藏动画事件 (webview)");
    }

    Ok(())
}

// 显示已隐藏的窗口
pub fn show_snapped_window(window: &WebviewWindow) -> Result<(), String> {
    let edge = {
        let state = EDGE_SNAP_MANAGER.lock();
        if !state.is_snapped || !state.is_hidden {
            return Ok(());
        }
        state
            .snapped_edge
            .as_ref()
            .ok_or("没有吸附边缘信息")?
            .clone()
    };

    let window_rect = get_window_rect(window)?;
    let (vx, vy, vw, vh) = get_virtual_screen_size()?;
        let monitor_bottom = crate::screenshot::screen_utils::ScreenUtils::get_monitor_bounds(window)
            .map(|(_, my, _, mh)| my + mh)
            .unwrap_or(vy + vh);

    let window_width = window_rect.right - window_rect.left;
    let window_height = window_rect.bottom - window_rect.top;

    // 计算显示位置
    let (show_x, show_y) = match edge {
        SnapEdge::Left => (vx, window_rect.top),
        SnapEdge::Right => (vx + vw - window_width, window_rect.top),
        SnapEdge::Top => (window_rect.left, vy),
        SnapEdge::Bottom => (window_rect.left, monitor_bottom - window_height),
    };

    // 发送贴边弹动动画事件给前端，包含方向信息
    {
        use tauri::Emitter;
        let direction = match edge {
            SnapEdge::Left => "left",
            SnapEdge::Right => "right", 
            SnapEdge::Top => "top",
            SnapEdge::Bottom => "bottom",
        };
        let _ = window.emit("edge-snap-bounce-animation", direction);
        // println!("发送贴边弹动动画事件 (webview): {}", direction);
    }

    // 执行平滑显示动画
    animate_window_position(
        window,
        window_rect.left,
        window_rect.top,
        show_x,
        show_y,
        200,
    )?;
    EDGE_SNAP_MANAGER.lock().is_hidden = false;

    #[cfg(windows)]
    crate::mouse_hook::request_mouse_monitoring("main_window");

    // 重新启用导航按键
    #[cfg(windows)]
    crate::shortcut_interceptor::enable_navigation_keys();
    Ok(())
}

// 停止鼠标监听
pub fn stop_mouse_monitoring() {
    if MOUSE_MONITORING_ACTIVE.load(Ordering::Relaxed) {
        println!("请求停止鼠标监听线程");
        MOUSE_MONITORING_ACTIVE.store(false, Ordering::Relaxed);
    }
}

// 重新启动鼠标监听（如果窗口处于贴边状态）
pub fn restart_mouse_monitoring_if_snapped(window: &WebviewWindow) -> Result<(), String> {
    let is_snapped = {
        let state = EDGE_SNAP_MANAGER.lock();
        state.is_snapped
    };
    
    if is_snapped {
        start_mouse_monitoring(window.clone())?;
    }
    
    Ok(())
}

// 启动鼠标监听
fn start_mouse_monitoring(window: WebviewWindow) -> Result<(), String> {
    // 如果已有监听线程在运行，先停止它
    if MOUSE_MONITORING_ACTIVE.load(Ordering::Relaxed) {
        println!("停止之前的鼠标监听线程");
        MOUSE_MONITORING_ACTIVE.store(false, Ordering::Relaxed);
        // 等待之前的线程退出
        std::thread::sleep(Duration::from_millis(100));
    }
    
    // 启动新的监听线程
    MOUSE_MONITORING_ACTIVE.store(true, Ordering::Relaxed);
    let monitoring_active = &*MOUSE_MONITORING_ACTIVE;
    
    std::thread::spawn(move || {
        println!("启动新的鼠标监听线程");
        // 初始缓冲期，避免拖拽结束后的立即触发
        std::thread::sleep(Duration::from_millis(150));

        // 缓冲期结束后，立即检查一次鼠标位置，决定是否需要隐藏
        let mut last_near_state = false;
        let mut show_timer: Option<Instant> = None;
        let mut hide_timer: Option<Instant> = None;
        let mut first_check = true;

        loop {
            // 检查线程是否应该继续运行
            if !monitoring_active.load(Ordering::Relaxed) {
                println!("鼠标监听线程收到停止信号，退出");
                break;
            }
            
            // 检查是否还在吸附状态
            let (is_hidden, edge) = {
                let state = EDGE_SNAP_MANAGER.lock();

                if !state.is_enabled || !state.is_snapped {
                    println!("贴边状态已取消，鼠标监听线程退出");
                    break;
                }

                (
                    state.is_hidden,
                    state.snapped_edge.clone(),
                )
            };

            // 使用新的状态管理器检查是否应该启用贴边隐藏
            if !crate::state_manager::should_enable_edge_hide() {
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }

            if let Some(edge) = edge {
                // 获取窗口位置信息
                let window_rect = match get_window_rect(&window) {
                    Ok(rect) => (
                        rect.left,
                        rect.top,
                        rect.right - rect.left,
                        rect.bottom - rect.top,
                    ),
                    Err(_) => continue,
                };

                // 检查是否正在拖拽，如果是则跳过鼠标监听
                if crate::window_drag::is_dragging() {
                    std::thread::sleep(Duration::from_millis(50));
                    continue;
                }

                // 检查鼠标位置
                match check_mouse_near_edge(&window, &edge, window_rect) {
                    Ok(is_near) => {
                        let now = Instant::now();

                        // 首次检查：如果鼠标不在边缘附近，立即隐藏
                        if first_check {
                            first_check = false;
                            if !is_near && !is_hidden {
                                let _ = hide_snapped_window(&window);
                            }
                            last_near_state = is_near;
                            continue;
                        }

                        if is_near && !last_near_state {
                            hide_timer = None;
                            if is_hidden {
                                show_timer = Some(now);
                            }
                        } else if !is_near && last_near_state {
                            show_timer = None;
                            if !is_hidden {
                                hide_timer = Some(now);
                            }
                        }

                        // 检查显示定时器 - 立即执行显示
                        if let Some(_timer) = show_timer {
                            if is_hidden {
                                let _ = show_snapped_window(&window);
                            }
                            show_timer = None;
                        }

                        // 检查隐藏定时器 - 立即执行隐藏
                        if let Some(_timer) = hide_timer {
                            if !is_hidden {
                                let _ = hide_snapped_window(&window);
                            }
                            hide_timer = None;
                        }

                        last_near_state = is_near;
                    }
                    Err(_) => break,
                }
            }

            std::thread::sleep(Duration::from_millis(50));
        }
        
        // 线程退出时清理状态
        monitoring_active.store(false, Ordering::Relaxed);
        println!("鼠标监听线程已退出");
    });

    Ok(())
}

// 检查鼠标是否接近指定边缘
fn check_mouse_near_edge(
    window: &WebviewWindow,
    edge: &SnapEdge,
    window_rect: (i32, i32, i32, i32),
) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let mut cursor_pos = POINT::default();
        unsafe {
            GetCursorPos(&mut cursor_pos).map_err(|e| format!("获取鼠标位置失败: {}", e))?;
        }

        let (vx, vy, vw, vh) = get_virtual_screen_size()?;
        let monitor_bottom = crate::screenshot::screen_utils::ScreenUtils::get_monitor_bounds(window)
            .map(|(_, my, _, mh)| my + mh)
            .unwrap_or(vy + vh);
        let trigger_distance = get_trigger_distance();
        let (win_x, win_y, win_width, win_height) = window_rect;

        // 检查鼠标是否在窗口内或接近对应边缘
        let mouse_in_window = cursor_pos.x >= win_x
            && cursor_pos.x <= win_x + win_width
            && cursor_pos.y >= win_y
            && cursor_pos.y <= win_y + win_height;

        let is_near = match edge {
            SnapEdge::Left => {
                cursor_pos.x <= vx + trigger_distance
                    && cursor_pos.y >= win_y
                    && cursor_pos.y <= win_y + win_height
            }
            SnapEdge::Right => {
                cursor_pos.x >= vx + vw - trigger_distance
                    && cursor_pos.y >= win_y
                    && cursor_pos.y <= win_y + win_height
            }
            SnapEdge::Top => {
                cursor_pos.y <= vy + trigger_distance
                    && cursor_pos.x >= win_x
                    && cursor_pos.x <= win_x + win_width
            }
            SnapEdge::Bottom => {
                cursor_pos.y >= monitor_bottom - trigger_distance
                    && cursor_pos.x >= win_x
                    && cursor_pos.x <= win_x + win_width
            }
        };

        Ok(is_near || mouse_in_window)
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

// 设置窗口位置
fn set_window_position(window: &WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    let position = tauri::PhysicalPosition::new(x, y);
    window
        .set_position(position)
        .map_err(|e| format!("设置窗口位置失败: {}", e))?;
    Ok(())
}

// 窗口位置动画
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
        let frame_duration = Duration::from_millis(16); // ~60fps
        let total_frames = duration_ms / 16;

        if total_frames == 0 {
            let _ = set_window_position(&window_clone, end_x, end_y);
            return;
        }

        let dx = end_x - start_x;
        let dy = end_y - start_y;

        for frame in 0..=total_frames {
            let progress = frame as f32 / total_frames as f32;

            // 使用缓动函数（ease-out）
            let eased_progress = 1.0 - (1.0 - progress).powi(3);

            let current_x = start_x + (dx as f32 * eased_progress) as i32;
            let current_y = start_y + (dy as f32 * eased_progress) as i32;

            let _ = set_window_position(&window_clone, current_x, current_y);

            if frame < total_frames {
                std::thread::sleep(frame_duration);
            }
        }
    });

    Ok(())
}

// 获取窗口矩形
fn get_window_rect(window: &WebviewWindow) -> Result<RECT, String> {
    let position = window
        .outer_position()
        .map_err(|e| format!("获取窗口位置失败: {}", e))?;
    let size = window
        .inner_size()
        .map_err(|e| format!("获取窗口大小失败: {}", e))?;

    let rect = RECT {
        left: position.x,
        top: position.y,
        right: position.x + size.width as i32,
        bottom: position.y + size.height as i32,
    };

    Ok(rect)
}

// 获取屏幕尺寸
pub fn get_screen_size() -> Result<(i32, i32), String> {
    let (_, _, w, h) = get_virtual_screen_size()?;
    Ok((w, h))
}

// 恢复窗口位置
pub fn restore_from_snap(window: &WebviewWindow) -> Result<(), String> {
    restore_window_from_snap(window)
}

// 检查窗口是否处于边缘隐藏状态
pub fn is_window_edge_hidden() -> bool {
    let state = EDGE_SNAP_MANAGER.lock();
    state.is_snapped && state.is_hidden
}

// 启动时恢复贴边隐藏状态
pub fn restore_edge_snap_on_startup(window: &WebviewWindow) -> Result<(), String> {
    let settings = crate::settings::get_global_settings();

    // 只有在功能启用且有保存位置时才恢复
    if !crate::state_manager::is_edge_snap_enabled() {
        return Ok(());
    }

    if let Some((x, y)) = settings.edge_snap_position {
        // 显示窗口
        crate::window_management::show_webview_window(window.clone());

        // 根据保存的位置推断贴边的边缘
        let (vx, vy, vw, vh) = get_virtual_screen_size()?;
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
        {
            let mut state = EDGE_SNAP_MANAGER.lock();
            state.is_snapped = true;
            state.is_hidden = true; // 恢复时应该是隐藏状态
            state.snapped_edge = Some(snapped_edge);
        }

        // 设置到贴边隐藏位置
        set_window_position(window, x, y)?;

        // 禁用导航按键，避免影响用户在其他应用中的操作
        #[cfg(windows)]
        crate::shortcut_interceptor::disable_navigation_keys();

        // 启动鼠标监听（此时窗口在隐藏位置但状态为显示，鼠标监听会根据鼠标位置决定是否隐藏）
        start_mouse_monitoring(window.clone())?;
    }

    Ok(())
}

// 检查窗口是否处于边缘吸附状态
pub fn is_window_edge_snapped() -> bool {
    crate::state_manager::is_edge_snap_active()
}


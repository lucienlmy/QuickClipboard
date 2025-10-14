use parking_lot::Mutex;
use std::time::Duration;
use tauri::WebviewWindow;
use windows::Win32::Foundation::{POINT, HWND};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, SetWindowPos, HWND_TOP, SWP_NOSIZE, SWP_NOZORDER
};

// 自定义拖拽状态
#[derive(Debug, Clone)]
pub struct CustomDragState {
    pub is_dragging: bool,
    pub window: WebviewWindow,
    pub mouse_offset_x: i32,
    pub mouse_offset_y: i32,
    pub hwnd: HWND,
}

// 全局拖拽状态管理
use once_cell::sync::Lazy;
static CUSTOM_DRAG_STATE: Lazy<Mutex<Option<CustomDragState>>> = Lazy::new(|| Mutex::new(None));

// 开始自定义拖拽
pub fn start_custom_drag(window: WebviewWindow, mouse_screen_x: i32, mouse_screen_y: i32) -> Result<(), String> {
    // 获取窗口句柄和位置信息
    let hwnd = HWND(window.hwnd().map_err(|e| format!("获取窗口句柄失败: {}", e))?.0 as isize);
    let physical_position = window.outer_position().map_err(|e| format!("获取窗口位置失败: {}", e))?;
    let scale_factor = window.scale_factor().map_err(|e| format!("获取缩放因子失败: {}", e))?;
    
    // 将前端逻辑坐标转换为物理坐标
    let mouse_physical_x = (mouse_screen_x as f64 * scale_factor) as i32;
    let mouse_physical_y = (mouse_screen_y as f64 * scale_factor) as i32;
    
    // 计算鼠标相对窗口的偏移（物理像素）
    let mouse_offset_x = mouse_physical_x - physical_position.x;
    let mouse_offset_y = mouse_physical_y - physical_position.y;
    
    // 保存拖拽状态
    {
        let mut drag_state = CUSTOM_DRAG_STATE.lock();
        *drag_state = Some(CustomDragState {
            is_dragging: true,
            window: window.clone(),
            mouse_offset_x,
            mouse_offset_y,
            hwnd,
        });
    }
    
    // 启动拖拽监听线程
    start_drag_monitoring_thread();
    
    Ok(())
}

// 停止自定义拖拽
pub fn stop_custom_drag() -> Result<(), String> {
    // 停止拖拽
    let window = {
        let mut drag_state = CUSTOM_DRAG_STATE.lock();
        if let Some(ref mut state) = drag_state.as_mut() {
            state.is_dragging = false;
            Some(state.window.clone())
        } else {
            None
        }
    };
    
    // 延迟检查边缘吸附和保存位置
    if let Some(window) = window {
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            
            // 通知边缘吸附模块检查窗口位置
            let _ = crate::edge_snap::check_window_snap(&window);

            let settings = crate::settings::get_global_settings();
            if settings.window_position_mode == "remember" {
                if let Ok(position) = window.outer_position() {
                    let _ = crate::settings::save_window_position(position.x, position.y);
                }
            }
        });
    }
    
    Ok(())
}

// 拖拽监听线程
fn start_drag_monitoring_thread() {
    std::thread::spawn(|| {
        loop {
            let (window, mouse_offset_x, mouse_offset_y, hwnd) = {
                let state = CUSTOM_DRAG_STATE.lock();
                if let Some(ref drag_state) = state.as_ref() {
                    if !drag_state.is_dragging {
                        break;
                    }
                    (
                        drag_state.window.clone(),
                        drag_state.mouse_offset_x,
                        drag_state.mouse_offset_y,
                        drag_state.hwnd,
                    )
                } else {
                    break;
                }
            };
            
            // 获取当前鼠标位置
            let mut cursor_pos = POINT::default();
            unsafe {
                if GetCursorPos(&mut cursor_pos).is_err() {
                    continue;
                }
            }
            
            // 计算新的窗口位置
            let new_physical_x = cursor_pos.x - mouse_offset_x;
            let new_physical_y = cursor_pos.y - mouse_offset_y;
            
            // 获取虚拟桌面边界并应用磁性吸附
            if let Ok(virtual_desktop) = get_virtual_screen_size() {
                let (virtual_x, virtual_y, virtual_width, virtual_height) = virtual_desktop;
                let (final_x, final_y) = apply_magnetic_snap_and_bounds(
                    new_physical_x, new_physical_y,
                    virtual_x, virtual_y, virtual_width, virtual_height,
                    &window
                );
                
                // 直接使用Win32 API设置窗口位置
                unsafe {
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_TOP,
                        final_x,
                        final_y,
                        0,
                        0,
                        SWP_NOSIZE | SWP_NOZORDER,
                    );
                }
            }
            
            std::thread::sleep(Duration::from_micros(500));
        }
    });
}

// 获取虚拟桌面尺寸（screen_utils）
pub fn get_virtual_screen_size() -> Result<(i32, i32, i32, i32), String> {
    crate::screenshot::screen_utils::ScreenUtils::get_virtual_screen_size()
}

// 获取窗口所在显示器的边界（screen_utils）
#[cfg(windows)]
fn apply_magnetic_snap_and_bounds(
    mut x: i32, mut y: i32, 
    _vx: i32, _vy: i32, _vw: i32, _vh: i32,
    window: &WebviewWindow
) -> (i32, i32) {
    const MAGNETIC_DISTANCE: i32 = 40;
    
    if let Ok(window_size) = window.outer_size() {
        let pw = window_size.width as i32;
        let ph = window_size.height as i32;
        
        // 使用通用物理像素边界约束
        let (constrained_x, constrained_y) = 
            crate::screenshot::screen_utils::ScreenUtils::constrain_to_physical_bounds(x, y, pw, ph, window)
                .unwrap_or((x, y));
        
        // 应用磁性吸附（在约束后的位置基础上）
        if let Ok(virtual_screen) = crate::screenshot::screen_utils::ScreenUtils::get_virtual_screen_size() {
            let (vx, vy, vw, vh) = virtual_screen;
            let monitor_bottom = crate::screenshot::screen_utils::ScreenUtils::get_monitor_bounds(window)
                .map(|(_, my, _, mh)| my + mh)
                .unwrap_or(vy + vh);
            
            // 磁性吸附检查
            if (constrained_x - vx).abs() <= MAGNETIC_DISTANCE { x = vx; }
            else if ((vx + vw) - (constrained_x + pw)).abs() <= MAGNETIC_DISTANCE { x = vx + vw - pw; }
            else { x = constrained_x; }
            
            if (constrained_y - vy).abs() <= MAGNETIC_DISTANCE { y = vy; }
            else if (monitor_bottom - (constrained_y + ph)).abs() <= MAGNETIC_DISTANCE { y = monitor_bottom - ph; }
            else { y = constrained_y; }
        } else {
            x = constrained_x;
            y = constrained_y;
        }
    }
    
    (x, y)
}

// 检查是否正在拖拽
pub fn is_dragging() -> bool {
    let state = CUSTOM_DRAG_STATE.lock();
    state.as_ref().map_or(false, |s| s.is_dragging)
}

// 获取当前拖拽的窗口
#[allow(dead_code)]
pub fn get_dragging_window() -> Option<WebviewWindow> {
    let state = CUSTOM_DRAG_STATE.lock();
    state.as_ref().map(|s| s.window.clone())
}


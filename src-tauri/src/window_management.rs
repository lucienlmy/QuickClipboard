use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::WebviewWindow;

static MAIN_WINDOW_AUTO_SHOWN: AtomicBool = AtomicBool::new(false);

/// 显示窗口
pub fn show_webview_window(window: tauri::WebviewWindow) {
    // 检查是否处于边缘吸附隐藏状态
    if crate::edge_snap::is_window_edge_hidden() {
        // 窗口处于贴边隐藏状态，使用贴边显示
        if let Err(_) = crate::edge_snap::show_snapped_window(&window) {
            // 贴边显示失败，恢复到正常状态并继续执行正常显示
            let _ = crate::edge_snap::restore_window_from_snap(&window);
        } else {
            #[cfg(windows)]
            crate::mouse_hook::request_mouse_monitoring("main_window");
            // 贴边显示成功，直接返回
            return;
        }
    }
    // 检查窗口是否已经显示
    let was_visible = window.is_visible().unwrap_or(false);

    // 根据设置决定窗口定位策略
    #[cfg(windows)]
    {
        let settings = crate::settings::get_global_settings();
        match settings.window_position_mode.as_str() {
            "remember" => {
                // 记住位置模式：使用保存的位置，如果没有则回退到智能定位
                if let Some((x, y)) = settings.saved_window_position {
                    let position = tauri::PhysicalPosition::new(x, y);
                    let _ = window.set_position(position);
                } else {
                    // 没有保存的位置，使用智能定位
                    let _ = position_window_at_cursor(&window);
                }
            }
            _ => {
                // 智能位置模式（默认）：智能定位窗口到光标位置（带缓动动画）
                if was_visible {
                    // 窗口已显示，使用缓动动画移动到新位置
                    let _ = position_window_at_cursor_with_animation(&window);
                } else {
                    // 窗口未显示，直接定位
                    let _ = position_window_at_cursor(&window);
                }
            }
        }
    }

    // 根据设置恢复窗口大小
    let settings = crate::settings::get_global_settings();
    if settings.remember_window_size {
        if let Some((width, height)) = settings.saved_window_size {
            let size = tauri::PhysicalSize::new(width, height);
            let _ = window.set_size(size);
        }
    }

    // 显示窗口
    let _ = window.show();
    // 只有在窗口之前不可见时才发送显示动画事件
    if !was_visible {
        use tauri::Emitter;
        let _ = window.emit("window-show-animation", ());
    }
    // Windows平台特定设置
    #[cfg(windows)]
    {
        // 启用导航按键监听
        crate::shortcut_interceptor::enable_navigation_keys();
        // 启用鼠标监听
        crate::mouse_hook::request_mouse_monitoring("main_window");
    }
}

/// 隐藏窗口
pub fn hide_webview_window(window: tauri::WebviewWindow) {
    // 如果右键菜单正在显示，不隐藏主窗口
    if crate::state_manager::is_context_menu_visible() {
        return;
    }
    
    // 检查是否处于边缘吸附隐藏状态
    if crate::edge_snap::is_window_edge_hidden() {
        // 如果窗口已经处于贴边隐藏状态，确保停止鼠标监听
        #[cfg(windows)]
        crate::mouse_hook::release_mouse_monitoring("edge_snap");
        // 窗口已经处于贴边隐藏状态，不需要再次隐藏
        return;
    }
    
    // 先检查当前窗口位置，更新贴边状态
    let _ = crate::edge_snap::check_window_snap(&window);
    
    // 如果窗口处于贴边显示状态，点击外部应该隐藏到贴边位置
    if crate::edge_snap::is_window_edge_snapped() {
        // 使用贴边隐藏方式
        if let Err(_) = crate::edge_snap::hide_snapped_window(&window) {
            // 贴边隐藏失败，使用正常隐藏
        } else {
            #[cfg(windows)]
            crate::mouse_hook::release_mouse_monitoring("edge_snap");
            // 贴边隐藏成功，直接返回
            return;
        }
    }
    
    // 发送隐藏动画事件给前端
    {
        use tauri::Emitter;
        let _ = window.emit("window-hide-animation", ());
        // println!("发送隐藏动画事件 (webview)");
    }

    // 等待动画完成后再隐藏窗口
    std::thread::sleep(std::time::Duration::from_millis(300));

    // 隐藏窗口前恢复焦点并停止鼠标监听
    let _ = restore_last_focus();
    let _ = window.hide();
    #[cfg(windows)]
    crate::mouse_hook::release_mouse_monitoring("main_window");
    // 禁用导航按键监听
    #[cfg(windows)]
    crate::shortcut_interceptor::disable_navigation_keys();
}

/// 切换窗口显示/隐藏状态
pub fn toggle_webview_window_visibility(window: tauri::WebviewWindow) {
    // 检查是否处于边缘吸附隐藏状态
    if crate::edge_snap::is_window_edge_hidden() {
        // 贴边隐藏状态，应该显示
        show_webview_window(window);
    } else if window.is_visible().unwrap_or(true) {
        // 窗口可见，应该隐藏
        hide_webview_window(window);
    } else {
        // 窗口不可见，应该显示
        show_webview_window(window);
    }
}

#[cfg(windows)]
static mut LAST_FOCUS_HWND: Option<isize> = None;
#[cfg(windows)]
static LAST_FOCUS_MUTEX: Mutex<()> = Mutex::new(());

#[cfg(windows)]
pub fn set_last_focus_hwnd(hwnd_val: isize) {
    let _lock = LAST_FOCUS_MUTEX.lock().unwrap();
    unsafe {
        LAST_FOCUS_HWND = Some(hwnd_val);
    }
}

pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let _lock = LAST_FOCUS_MUTEX.lock().unwrap();
        unsafe {
            // 获取当前前台窗口
            let current_hwnd = GetForegroundWindow();
            println!("当前前台窗口句柄：{:x}", current_hwnd.0);
            // 获取剪贴板窗口句柄
            if let Ok(hwnd_raw) = window.hwnd() {
                let clipboard_hwnd = HWND(hwnd_raw.0 as usize as isize);

                // 只有当前台窗口不是剪贴板窗口时，才记录当前前台窗口
                if current_hwnd.0 != 0 && current_hwnd.0 != clipboard_hwnd.0 {
                    LAST_FOCUS_HWND = Some(current_hwnd.0);
                }
            }
        }
    }

    // 窗口获得焦点
    if let Err(e) = window.set_focus() {
        println!("设置窗口焦点失败: {}", e);
    }

    Ok(())
}

pub fn restore_last_focus() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
        let _lock = LAST_FOCUS_MUTEX.lock().unwrap();
        unsafe {
            if let Some(hwnd_val) = LAST_FOCUS_HWND {
                let hwnd = HWND(hwnd_val);
                let _ = SetForegroundWindow(hwnd);
                LAST_FOCUS_HWND = None;
            }
        }
    }
    Ok(())
}


// 检查当前前台窗口是否是自己的应用窗口
#[cfg(windows)]
pub fn is_current_window_own_app(window: &tauri::WebviewWindow) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    unsafe {
        let foreground_hwnd = GetForegroundWindow();
        if let Ok(app_hwnd_raw) = window.hwnd() {
            let app_hwnd = HWND(app_hwnd_raw.0 as usize as isize);
            return foreground_hwnd == app_hwnd;
        }
    }
    false
}

#[cfg(not(windows))]
pub fn is_current_window_own_app(_window: &tauri::WebviewWindow) -> bool {
    false
}

// 检查窗口是否应该接收导航按键
#[cfg(windows)]
pub fn should_receive_navigation_keys(window: &tauri::WebviewWindow) -> bool {
    window.is_visible().unwrap_or(false)
}

#[cfg(not(windows))]
pub fn should_receive_navigation_keys(_window: &tauri::WebviewWindow) -> bool {
    false
}

// 激活窗口，用于隐藏系统剪贴板
pub fn simulate_click_on_window(window: &tauri::WebviewWindow) {
    // 设置窗口焦点
    if let Err(e) = window.set_focus() {
        println!("设置窗口焦点失败: {}", e);
    }

    // 设置窗口置顶
    if let Err(e) = window.set_always_on_top(true) {
        println!("设置窗口置顶失败: {}", e);
    }
}

// 如果主窗口是自动显示的，则隐藏它
pub fn hide_main_window_if_auto_shown(window: &WebviewWindow) -> Result<(), String> {
    if MAIN_WINDOW_AUTO_SHOWN.load(Ordering::SeqCst) {
        // 重置自动显示状态
        MAIN_WINDOW_AUTO_SHOWN.store(false, Ordering::SeqCst);

        // 使用专门的窗口隐藏逻辑
        hide_webview_window(window.clone());

        println!("主窗口已隐藏（因设置窗口关闭）");
    }
    Ok(())
}


// 智能窗口定位算法：计算最佳窗口位置
#[cfg(windows)]
fn calculate_optimal_window_position(window: &WebviewWindow) -> Result<(i32, i32), String> {
    use windows::Win32::Foundation::{POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
    };

    unsafe {
        // 直接获取鼠标位置作为定位基准
        let mut cursor_pos = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut cursor_pos).is_err() {
            return Err("获取鼠标位置失败".to_string());
        }

        // 获取鼠标所在的显示器信息
        let monitor = MonitorFromPoint(cursor_pos, MONITOR_DEFAULTTONEAREST);
        let mut monitor_info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            rcMonitor: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            rcWork: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            dwFlags: 0,
        };

        let (work_left, work_top, work_width, work_height) =
            if GetMonitorInfoW(monitor, &mut monitor_info).as_bool() {
                let work_left = monitor_info.rcWork.left;
                let work_top = monitor_info.rcWork.top;
                let work_width = monitor_info.rcWork.right - monitor_info.rcWork.left;
                let work_height = monitor_info.rcWork.bottom - monitor_info.rcWork.top;

                (work_left, work_top, work_width, work_height)
            } else {
                // 回退到主屏幕
                let screen_width = GetSystemMetrics(SM_CXSCREEN);
                let screen_height = GetSystemMetrics(SM_CYSCREEN);
                (0, 0, screen_width, screen_height)
            };

        // 获取窗口尺寸
        let window_size = window
            .outer_size()
            .map_err(|e| format!("获取窗口尺寸失败: {}", e))?;
        let window_width = window_size.width as i32;
        let window_height = window_size.height as i32;

        // 智能定位算法：优先在鼠标的右下角和右上角显示（使用工作区域）
        let margin = 12; // 边距
        let mut target_x;
        let mut target_y;

        // 策略1：尝试在右下角显示（优先策略）
        target_x = cursor_pos.x + margin;
        target_y = cursor_pos.y + margin;

        // 检查右下角是否在工作区域内有足够空间
        if target_x + window_width <= work_left + work_width
            && target_y + window_height <= work_top + work_height
        {
            // 右下角有足够空间
        } else {
            // 策略2：尝试在右上角显示
            target_x = cursor_pos.x + margin;
            target_y = cursor_pos.y - window_height - margin;

            if target_x + window_width <= work_left + work_width && target_y >= work_top {
                // 右上角有足够空间
            } else {
                // 策略3：尝试在左下角显示
                target_x = cursor_pos.x - window_width - margin;
                target_y = cursor_pos.y + margin;

                if target_x >= work_left && target_y + window_height <= work_top + work_height {
                    // 左下角有足够空间
                } else {
                    // 策略4：尝试在左上角显示
                    target_x = cursor_pos.x - window_width - margin;
                    target_y = cursor_pos.y - window_height - margin;

                    if target_x >= work_left && target_y >= work_top {
                        // 左上角有足够空间
                    } else {
                        // 策略5：上下空间都不足时，放到鼠标右侧并垂直居中
                        target_x = cursor_pos.x + margin;
                        target_y = cursor_pos.y - (window_height / 2);
                        
                        // 如果右侧空间不足，则放到左侧
                        if target_x + window_width > work_left + work_width {
                            target_x = cursor_pos.x - window_width - margin;
                        }
                        
                        // 确保垂直方向在工作区域内，如果超出则调整
                        if target_y < work_top {
                            target_y = work_top;
                        } else if target_y + window_height > work_top + work_height {
                            target_y = work_top + work_height - window_height;
                        }
                    }
                }
            }
        }

        // 最终边界检查和调整（确保在工作区域内）
        if target_x < work_left {
            target_x = work_left;
        } else if target_x + window_width > work_left + work_width {
            target_x = work_left + work_width - window_width;
        }

        if target_y < work_top {
            target_y = work_top;
        } else if target_y + window_height > work_top + work_height {
            target_y = work_top + work_height - window_height;
        }

        // 返回计算出的最佳位置
        Ok((target_x, target_y))
    }
}

// 窗口定位函数：直接使用鼠标位置
#[cfg(windows)]
pub fn position_window_at_cursor(window: &WebviewWindow) -> Result<(), String> {
    let (target_x, target_y) = calculate_optimal_window_position(window)?;
    
    // 设置窗口位置
    let position = tauri::PhysicalPosition::new(target_x, target_y);
    window
        .set_position(position)
        .map_err(|e| format!("设置窗口位置失败: {}", e))?;

    Ok(())
}

#[cfg(not(windows))]
pub fn position_window_at_cursor(_window: &WebviewWindow) -> Result<(), String> {
    // 非Windows平台暂不实现
    Ok(())
}

// 缓动函数：ease-out-cubic
fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

// 带缓动动画的窗口定位函数
#[cfg(windows)]
pub fn position_window_at_cursor_with_animation(window: &WebviewWindow) -> Result<(), String> {
    // 获取当前窗口位置
    let current_position = window
        .outer_position()
        .map_err(|e| format!("获取当前窗口位置失败: {}", e))?;
    let start_x = current_position.x as f64;
    let start_y = current_position.y as f64;

    // 使用共享的定位算法计算目标位置
    let (target_x, target_y) = calculate_optimal_window_position(window)?;
    let end_x = target_x as f64;
    let end_y = target_y as f64;

    // 如果目标位置和当前位置相同，不需要动画
    let distance = ((end_x - start_x).powi(2) + (end_y - start_y).powi(2)).sqrt();
    if distance < 5.0 {
        return Ok(());
    }

    // 执行缓动动画
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let animation_duration = Duration::from_millis(200); // 200ms动画时长
        let frame_duration = Duration::from_millis(16); // ~60fps
        let start_time = Instant::now();

        loop {
            let elapsed = start_time.elapsed();
            let progress = elapsed.as_secs_f64() / animation_duration.as_secs_f64();

            if progress >= 1.0 {
                // 动画结束，设置最终位置
                let final_position = tauri::PhysicalPosition::new(end_x as i32, end_y as i32);
                let _ = window_clone.set_position(final_position);
                break;
            }

            // 应用缓动函数
            let eased_progress = ease_out_cubic(progress);

            // 计算当前帧的位置
            let current_x = start_x + (end_x - start_x) * eased_progress;
            let current_y = start_y + (end_y - start_y) * eased_progress;

            // 设置窗口位置
            let position = tauri::PhysicalPosition::new(current_x as i32, current_y as i32);
            let _ = window_clone.set_position(position);

            // 等待下一帧
            std::thread::sleep(frame_duration);
        }
    });

    Ok(())
}

#[cfg(not(windows))]
pub fn position_window_at_cursor_with_animation(_window: &WebviewWindow) -> Result<(), String> {
    // 非Windows平台暂不实现
    Ok(())
}

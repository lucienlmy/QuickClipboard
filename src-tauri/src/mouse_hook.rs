use once_cell::sync::OnceCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{ WebviewWindow};

#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_MENU, VK_SHIFT};

// 全局状态变量

#[cfg(windows)]
pub static MAIN_WINDOW_HANDLE: OnceCell<WebviewWindow> = OnceCell::new();

// 鼠标监听相关的全局状态
#[cfg(windows)]
pub static MOUSE_MONITORING_ENABLED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
static MOUSE_HOOK_HANDLE: Mutex<Option<windows::Win32::UI::WindowsAndMessaging::HHOOK>> =
    Mutex::new(None);

// 鼠标监听需求跟踪
#[cfg(windows)]
static MOUSE_MONITORING_REQUESTS: std::sync::LazyLock<Mutex<std::collections::HashSet<String>>> =
    std::sync::LazyLock::new(|| Mutex::new(std::collections::HashSet::new()));

// =================== 鼠标监听功能 ===================

// 检查鼠标中键修饰键是否匹配
#[cfg(windows)]
fn check_mouse_modifier_match(modifier: &str) -> bool {
    unsafe {
        let ctrl_pressed = (GetAsyncKeyState(VK_CONTROL.0 as i32) & 0x8000u16 as i16) != 0;
        let alt_pressed = (GetAsyncKeyState(VK_MENU.0 as i32) & 0x8000u16 as i16) != 0;
        let shift_pressed = (GetAsyncKeyState(VK_SHIFT.0 as i32) & 0x8000u16 as i16) != 0;

        match modifier {
            "None" => !ctrl_pressed && !alt_pressed && !shift_pressed,
            "Ctrl" => ctrl_pressed && !alt_pressed && !shift_pressed,
            "Alt" => !ctrl_pressed && alt_pressed && !shift_pressed,
            "Shift" => !ctrl_pressed && !alt_pressed && shift_pressed,
            "Ctrl+Shift" => ctrl_pressed && !alt_pressed && shift_pressed,
            "Ctrl+Alt" => ctrl_pressed && alt_pressed && !shift_pressed,
            "Alt+Shift" => !ctrl_pressed && alt_pressed && shift_pressed,
            _ => !ctrl_pressed && !alt_pressed && !shift_pressed, // 默认为无修饰键
        }
    }
}

#[cfg(not(windows))]
fn check_mouse_modifier_match(_modifier: &str) -> bool {
    true // 非Windows平台总是返回true
}

#[cfg(windows)]
unsafe extern "system" fn mouse_hook_proc(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, HC_ACTION, MSLLHOOKSTRUCT, WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_MOUSEWHEEL,
        WM_RBUTTONDOWN,
    };

    if code == HC_ACTION as i32 {
        let settings = crate::settings::get_global_settings();
        
        // 检查应用黑白名单过滤
        if settings.app_filter_enabled {
            if !crate::app_filter::is_current_app_allowed() {
                return CallNextHookEx(None, code, wparam, lparam);
            }
        }

        let is_window_pinned = crate::state_manager::is_window_pinned();
        let preview_visible = crate::preview_window::is_preview_window_visible();
        let mouse_monitoring_enabled = MOUSE_MONITORING_ENABLED.load(Ordering::Relaxed);

        // 处理鼠标事件
        match wparam.0 as u32 {
            WM_MBUTTONDOWN => {
                // 鼠标中键点击事件：全局监听
                let settings = crate::settings::get_global_settings();
                if settings.mouse_middle_button_enabled {
                    // 检查修饰键是否匹配
                    if check_mouse_modifier_match(&settings.mouse_middle_button_modifier) {
                        // 在新线程中切换窗口显示状态，避免阻塞钩子
                        if let Some(window) = MAIN_WINDOW_HANDLE.get() {
                            let window_clone = window.clone();
                            std::thread::spawn(move || {
                                crate::window_management::show_webview_window(window_clone);
                            });
                        }
                        // 拦截鼠标中键事件，防止传递给其他应用
                        return windows::Win32::Foundation::LRESULT(1);
                    }
                }
            }
            WM_LBUTTONDOWN | WM_RBUTTONDOWN => {
                // 左键和右键点击事件：只有在鼠标监听启用且窗口未固定时才处理点击外部关闭
                if mouse_monitoring_enabled && !is_window_pinned {
                    // 获取鼠标点击位置
                    let mouse_data = &*(lparam.0 as *const MSLLHOOKSTRUCT);
                    let click_point = POINT {
                        x: mouse_data.pt.x,
                        y: mouse_data.pt.y,
                    };

                    // 检查点击是否在主窗口区域外
                    if let Some(window) = MAIN_WINDOW_HANDLE.get() {
                        if is_click_outside_window(window, click_point) {
                            // 在新线程中隐藏主窗口，避免阻塞钩子
                            let window_clone = window.clone();
                            std::thread::spawn(move || {
                                crate::window_management::hide_webview_window(window_clone);
                            });
                        }
                    }
                }
            }

            WM_MOUSEWHEEL => {
                // 滚轮事件：只有在鼠标监听启用且预览窗口显示时才处理，不受固定状态影响
                if mouse_monitoring_enabled && preview_visible {
                    let mouse_data = &*(lparam.0 as *const MSLLHOOKSTRUCT);
                    let wheel_delta = ((mouse_data.mouseData >> 16) & 0xFFFF) as i16;

                    // 根据滚轮方向发送滚动事件
                    let direction = if wheel_delta > 0 { "up" } else { "down" };

                    // 发送滚动事件到预览窗口
                    if let Err(e) = crate::preview_window::handle_preview_scroll(direction) {
                        println!("处理滚轮事件失败: {}", e);
                    }

                    // 拦截滚轮事件，防止传递给其他应用
                    return windows::Win32::Foundation::LRESULT(1);
                }
            }
            _ => {}
        }
    }

    CallNextHookEx(None, code, wparam, lparam)
}

// 检查点击是否在窗口区域外
#[cfg(windows)]
fn is_click_outside_window(
    window: &WebviewWindow,
    click_point: windows::Win32::Foundation::POINT,
) -> bool {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    if let Ok(hwnd) = window.hwnd() {
        let mut window_rect = RECT::default();
        unsafe {
            if GetWindowRect(
                windows::Win32::Foundation::HWND(hwnd.0 as isize),
                &mut window_rect,
            )
            .is_ok()
            {
                return click_point.x < window_rect.left
                    || click_point.x > window_rect.right
                    || click_point.y < window_rect.top
                    || click_point.y > window_rect.bottom;
            }
        }
    }
    true // 如果无法获取窗口矩形，默认认为点击在外部
}

// 请求启用鼠标监听（带来源标识）
#[cfg(windows)]
pub fn request_mouse_monitoring(source: &str) {
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowsHookExW, WH_MOUSE_LL};

    // 添加监听请求
    if let Ok(mut requests) = MOUSE_MONITORING_REQUESTS.lock() {
        requests.insert(source.to_string());
    }

    MOUSE_MONITORING_ENABLED.store(true, Ordering::Relaxed);

    // 如果钩子还没有安装，则安装它
    let mut hook_handle = MOUSE_HOOK_HANDLE.lock().unwrap();
    if hook_handle.is_none() {
        unsafe {
            match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), HINSTANCE(0), 0) {
                Ok(hook) => {
                    *hook_handle = Some(hook);
                }
                Err(e) => {
                    println!("安装鼠标钩子失败: {:?}", e);
                }
            }
        }
    }
}

// 安装鼠标钩子（不启用监听状态，仅用于鼠标中键全局监听）
#[cfg(windows)]
pub fn install_mouse_hook() {
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowsHookExW, WH_MOUSE_LL};

    // 如果钩子还没有安装，则安装它
    let mut hook_handle = MOUSE_HOOK_HANDLE.lock().unwrap();
    if hook_handle.is_none() {
        unsafe {
            match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), HINSTANCE(0), 0) {
                Ok(hook) => {
                    *hook_handle = Some(hook);
                    println!("鼠标钩子已安装（用于全局鼠标中键监听）");
                }
                Err(e) => {
                    println!("安装鼠标钩子失败: {:?}", e);
                }
            }
        }
    }
}

// 启用鼠标监听
#[cfg(windows)]
pub fn enable_mouse_monitoring() {
    request_mouse_monitoring("legacy");
}

// 释放鼠标监听请求（带来源标识）
#[cfg(windows)]
pub fn release_mouse_monitoring(source: &str) {
    // 移除监听请求
    if let Ok(mut requests) = MOUSE_MONITORING_REQUESTS.lock() {
        requests.remove(source);

        // 只有当没有任何请求时才禁用监听
        if requests.is_empty() {
            MOUSE_MONITORING_ENABLED.store(false, Ordering::Relaxed);
        }
    }
}

// 禁用鼠标监听（保持向后兼容）
#[cfg(windows)]
pub fn disable_mouse_monitoring() {
    release_mouse_monitoring("legacy");
}

// 检查鼠标监听是否启用
#[cfg(windows)]
pub fn is_mouse_monitoring_enabled() -> bool {
    MOUSE_MONITORING_ENABLED.load(Ordering::Relaxed)
}

// 完全卸载鼠标钩子（用于应用退出时）
#[cfg(windows)]
pub fn uninstall_mouse_hook() {
    use windows::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx;

    MOUSE_MONITORING_ENABLED.store(false, Ordering::SeqCst);

    let mut hook_handle = MOUSE_HOOK_HANDLE.lock().unwrap();
    if let Some(hook) = hook_handle.take() {
        unsafe {
            let _ = UnhookWindowsHookEx(hook);
            println!("鼠标钩子已卸载");
        }
    }
}


// 非Windows平台的空实现
#[cfg(not(windows))]
pub fn install_mouse_hook() {}

#[cfg(not(windows))]
pub fn enable_mouse_monitoring() {}

#[cfg(not(windows))]
pub fn disable_mouse_monitoring() {}

#[cfg(not(windows))]
pub fn is_mouse_monitoring_enabled() -> bool {
    false
}

#[cfg(not(windows))]
pub fn uninstall_mouse_hook() {}

#[cfg(not(windows))]
pub fn set_window_pinned(_pinned: bool) {}

#[cfg(not(windows))]
pub fn is_window_pinned() -> bool {
    false
}

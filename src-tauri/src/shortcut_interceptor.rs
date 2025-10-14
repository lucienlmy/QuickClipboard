// 快捷键拦截器 - 专门用于拦截主窗口快捷键，防止触发系统剪贴板

use once_cell::sync::OnceCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Manager;

// 全局状态
#[cfg(windows)]
static SHORTCUT_HOOK_HANDLE: Mutex<Option<windows::Win32::UI::WindowsAndMessaging::HHOOK>> =
    Mutex::new(None);

#[cfg(windows)]
pub static SHORTCUT_INTERCEPTION_ENABLED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub static MAIN_WINDOW_HANDLE: OnceCell<tauri::WebviewWindow> = OnceCell::new();

// 当前配置的主窗口快捷键
#[cfg(windows)]
static CURRENT_SHORTCUT: Mutex<Option<crate::global_state::ParsedShortcut>> = Mutex::new(None);

// 当前配置的预览窗口快捷键
#[cfg(windows)]
static PREVIEW_SHORTCUT: Mutex<Option<crate::global_state::ParsedShortcut>> = Mutex::new(None);

// 快捷键拦截标志（防止重复触发）
#[cfg(windows)]
static SHORTCUT_TRIGGERED: AtomicBool = AtomicBool::new(false);

// 预览快捷键拦截标志
#[cfg(windows)]
static PREVIEW_SHORTCUT_TRIGGERED: AtomicBool = AtomicBool::new(false);

// 导航按键监听状态
#[cfg(windows)]
static NAVIGATION_KEYS_ENABLED: AtomicBool = AtomicBool::new(false);

// 翻译进行状态（用于暂时禁用导航按键）
#[cfg(windows)]
static TRANSLATION_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

// Win+V 特殊处理状态
#[cfg(windows)]
static WIN_V_INTERCEPTED: AtomicBool = AtomicBool::new(false);

// V键是否仍然按下
#[cfg(windows)]
static V_KEY_PRESSED: AtomicBool = AtomicBool::new(false);

// =================== 辅助函数 ===================

// 检查是否匹配导航快捷键
#[cfg(windows)]
fn matches_navigation_shortcut(
    vk_code: u32,
    ctrl_pressed: bool,
    shift_pressed: bool,
    alt_pressed: bool,
    win_pressed: bool,
    shortcut_str: &str,
) -> bool {
    if let Some(parsed) = crate::global_state::parse_shortcut(shortcut_str) {
        // 检查修饰键是否匹配
        if ctrl_pressed != parsed.ctrl
            || shift_pressed != parsed.shift
            || alt_pressed != parsed.alt
            || win_pressed != parsed.win
        {
            return false;
        }
        
        // 检查主键是否匹配
        vk_code == parsed.key_code
    } else {
        false
    }
}

// =================== 键盘钩子函数 ===================

#[cfg(windows)]
unsafe extern "system" fn shortcut_hook_proc(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, HC_ACTION, KBDLLHOOKSTRUCT, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN,
        WM_SYSKEYUP,
    };

    if code == HC_ACTION as i32 && SHORTCUT_INTERCEPTION_ENABLED.load(Ordering::Relaxed) {
        let kbd_data = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let vk_code = kbd_data.vkCode;

        let ctrl_pressed = (GetAsyncKeyState(0x11) & 0x8000u16 as i16) != 0; // VK_CONTROL
        let shift_pressed = (GetAsyncKeyState(0x10) & 0x8000u16 as i16) != 0; // VK_SHIFT
        let alt_pressed = (GetAsyncKeyState(0x12) & 0x8000u16 as i16) != 0; // VK_MENU
        let win_pressed = (GetAsyncKeyState(0x5B) & 0x8000u16 as i16) != 0 // VK_LWIN
            || (GetAsyncKeyState(0x5C) & 0x8000u16 as i16) != 0; // VK_RWIN

        let settings = crate::settings::get_global_settings();
        // 检查应用黑白名单过滤
        if settings.app_filter_enabled {
            if !crate::app_filter::is_current_app_allowed() {
                return CallNextHookEx(None, code, wparam, lparam);
            }
        }

        let is_own_window = if let Some(window) = MAIN_WINDOW_HANDLE.get() {
            crate::window_management::is_current_window_own_app(window)
        } else {
            false
        };

        // 特殊处理Win+V组合键，防止触发系统Win菜单
        match wparam.0 as u32 {
            WM_KEYDOWN | WM_SYSKEYDOWN => {
                if vk_code == 0x56 && win_pressed {
                    // V键 + Win键
                    V_KEY_PRESSED.store(true, Ordering::Relaxed);
                    WIN_V_INTERCEPTED.store(true, Ordering::Relaxed);
                } else if vk_code == 0x56 {
                    // 单独的V键按下
                    V_KEY_PRESSED.store(true, Ordering::Relaxed);
                }
            }
            WM_KEYUP | WM_SYSKEYUP => {
                if vk_code == 0x56 {
                    // V键松开
                    V_KEY_PRESSED.store(false, Ordering::Relaxed);

                    // 如果之前拦截了Win+V，延迟1秒后发送Win键松开事件
                    if WIN_V_INTERCEPTED.load(Ordering::Relaxed) {
                        WIN_V_INTERCEPTED.store(false, Ordering::Relaxed);

                        // 在新线程中延迟发送Win键松开事件
                        std::thread::spawn(|| {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            send_win_key_up();
                        });
                    }
                } else if (vk_code == 0x5B || vk_code == 0x5C)
                    && WIN_V_INTERCEPTED.load(Ordering::Relaxed)
                {
                    // Win键松开，但如果V键还没松开，则阻止Win键松开事件
                    if V_KEY_PRESSED.load(Ordering::Relaxed) {
                        return LRESULT(1); // 阻止Win键松开事件
                    }
                }
            }
            _ => {}
        }

        if let Some(shortcut) = CURRENT_SHORTCUT.lock().unwrap().as_ref() {
            if vk_code == shortcut.key_code {
                match wparam.0 as u32 {
                    WM_KEYDOWN | WM_SYSKEYDOWN => {
                        if ctrl_pressed == shortcut.ctrl
                            && shift_pressed == shortcut.shift
                            && alt_pressed == shortcut.alt
                            && win_pressed == shortcut.win
                        {
                            if !is_own_window {
                                if !SHORTCUT_TRIGGERED.load(Ordering::Relaxed) {
                                    SHORTCUT_TRIGGERED.store(true, Ordering::Relaxed);

                                    if let Some(window) = MAIN_WINDOW_HANDLE.get() {
                                        let window_clone = window.clone();
                                        std::thread::spawn(move || {
                                            crate::window_management::toggle_webview_window_visibility(window_clone);
                                        });
                                    }
                                }

                                return LRESULT(1);
                            }
                        }
                    }
                    WM_KEYUP | WM_SYSKEYUP => {
                        if vk_code == shortcut.key_code
                            || (shortcut.ctrl && vk_code == 0x11)
                            || (shortcut.shift && vk_code == 0x10)
                            || (shortcut.alt && vk_code == 0x12)
                            || (shortcut.win && (vk_code == 0x5B || vk_code == 0x5C))
                        {
                            SHORTCUT_TRIGGERED.store(false, Ordering::Relaxed);
                        }
                    }
                    _ => {}
                }
            }
        }

        if let Some(preview_shortcut) = PREVIEW_SHORTCUT.lock().unwrap().as_ref() {
            if vk_code == preview_shortcut.key_code {
                match wparam.0 as u32 {
                                WM_KEYDOWN | WM_SYSKEYDOWN => {
                                    if ctrl_pressed == preview_shortcut.ctrl
                                        && shift_pressed == preview_shortcut.shift
                                        && alt_pressed == preview_shortcut.alt
                                        && win_pressed == preview_shortcut.win
                                    {
                                        let settings = crate::settings::get_global_settings();
                                        if !settings.preview_enabled {
                                            // 如果预览功能被禁用，不拦截事件
                                            return CallNextHookEx(None, code, wparam, lparam);
                                        }

                                        if !is_own_window {
                                            if !PREVIEW_SHORTCUT_TRIGGERED.load(Ordering::Relaxed) {
                                                PREVIEW_SHORTCUT_TRIGGERED.store(true, Ordering::Relaxed);

                                                if let Some(window) = MAIN_WINDOW_HANDLE.get() {
                                                    let app_handle = window.app_handle().clone();
                                                    std::thread::spawn(move || {
                                                        let _ = tauri::async_runtime::block_on(
                                                            crate::preview_window::show_preview_window(
                                                                app_handle,
                                                            ),
                                                        );
                                                    });
                                                }
                                            }

                                            return LRESULT(1);
                                        }
                                    }
                                }
                    WM_KEYUP | WM_SYSKEYUP => {
                        if vk_code == preview_shortcut.key_code
                            || (preview_shortcut.ctrl && vk_code == 0x11)
                            || (preview_shortcut.shift && vk_code == 0x10)
                            || (preview_shortcut.alt && vk_code == 0x12)
                            || (preview_shortcut.win && (vk_code == 0x5B || vk_code == 0x5C))
                        {
                            if !is_own_window && PREVIEW_SHORTCUT_TRIGGERED.load(Ordering::Relaxed)
                            {
                                let settings = crate::settings::get_global_settings();
                                if settings.preview_enabled {
                                    let user_cancelled = crate::global_state::PREVIEW_CANCELLED_BY_USER
                                        .load(std::sync::atomic::Ordering::SeqCst);

                                    if user_cancelled {
                                        crate::global_state::PREVIEW_CANCELLED_BY_USER
                                            .store(false, std::sync::atomic::Ordering::SeqCst);
                                        std::thread::spawn(move || {
                                            let _ = tauri::async_runtime::block_on(
                                                crate::preview_window::hide_preview_window(),
                                            );
                                        });
                                    } else {
                                        std::thread::spawn(move || {
                                            let _ = tauri::async_runtime::block_on(
                                                crate::preview_window::paste_current_preview_item(),
                                            );
                                        });
                                    }
                                }
                            }

                            PREVIEW_SHORTCUT_TRIGGERED.store(false, Ordering::Relaxed);
                        }
                    }
                    _ => {}
                }
            }
        }

        // 处理导航按键（仅当启用且窗口应该接收按键且翻译未进行时）
        if NAVIGATION_KEYS_ENABLED.load(Ordering::Relaxed)
            && !TRANSLATION_IN_PROGRESS.load(Ordering::Relaxed)
        {
            if let Some(window) = MAIN_WINDOW_HANDLE.get() {
                // 检查窗口是否应该接收导航按键
                if crate::window_management::should_receive_navigation_keys(window) {
                    // 获取当前设置
                    let settings = crate::settings::get_global_settings();
                    
                    if wparam.0 as u32 == WM_KEYDOWN {
                        // 检查各种导航快捷键并直接发送动作事件
                        if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.navigate_up_shortcut) {
                            emit_navigation_action("navigate-up");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.navigate_down_shortcut) {
                            emit_navigation_action("navigate-down");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.tab_left_shortcut) {
                            emit_navigation_action("tab-left");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.tab_right_shortcut) {
                            emit_navigation_action("tab-right");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.focus_search_shortcut) {
                            emit_navigation_action("focus-search");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.hide_window_shortcut) {
                            emit_navigation_action("hide-window");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.execute_item_shortcut) {
                            emit_navigation_action("execute-item");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.previous_group_shortcut) {
                            emit_navigation_action("previous-group");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.next_group_shortcut) {
                            emit_navigation_action("next-group");
                            return LRESULT(1);
                        }
                        else if matches_navigation_shortcut(vk_code, ctrl_pressed, shift_pressed, alt_pressed, win_pressed, &settings.toggle_pin_shortcut) {
                            emit_navigation_action("toggle-pin");
                            return LRESULT(1);
                        }
                    }
                }
            }
        }

        // 监听 Ctrl+V 触发粘贴音效（不拦截事件）
        if wparam.0 as u32 == WM_KEYDOWN {
            if vk_code == 0x56 && ctrl_pressed && !shift_pressed && !alt_pressed && !win_pressed {
                std::thread::spawn(|| {
                    crate::sound_manager::play_paste_sound();
                });
            }
        }
    }

    CallNextHookEx(None, code, wparam, lparam)
}

// 发送导航动作事件到前端
#[cfg(windows)]
fn emit_navigation_action(action: &str) {
    use tauri::Emitter;

    if let Some(window) = MAIN_WINDOW_HANDLE.get() {
        let _ = window.emit(
            "navigation-action",
            serde_json::json!({
                "action": action
            }),
        );
    }
}


// 发送Win键松开事件
#[cfg(windows)]
fn send_win_key_up() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_LWIN,
    };

    unsafe {
        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK_LWIN,
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
}

// =================== 公共接口 ===================

// 初始化快捷键拦截器
#[cfg(windows)]
pub fn initialize_shortcut_interceptor(window: tauri::WebviewWindow) {
    MAIN_WINDOW_HANDLE.set(window).ok();
}

// 安装快捷键钩子
#[cfg(windows)]
pub fn install_shortcut_hook() {
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowsHookExW, WH_KEYBOARD_LL};

    let mut hook_handle = SHORTCUT_HOOK_HANDLE.lock().unwrap();
    if hook_handle.is_none() {
        unsafe {
            match SetWindowsHookExW(WH_KEYBOARD_LL, Some(shortcut_hook_proc), HINSTANCE(0), 0) {
                Ok(hook) => {
                    *hook_handle = Some(hook);
                }
                Err(_e) => {
                    // 静默处理错误
                }
            }
        }
    }
}

// 启用快捷键拦截
#[cfg(windows)]
pub fn enable_shortcut_interception() {
    SHORTCUT_INTERCEPTION_ENABLED.store(true, Ordering::SeqCst);
}

// 禁用快捷键拦截
#[cfg(windows)]
pub fn disable_shortcut_interception() {
    SHORTCUT_INTERCEPTION_ENABLED.store(false, Ordering::SeqCst);
}

// 查询快捷键拦截是否启用
#[cfg(windows)]
pub fn is_interception_enabled() -> bool {
    SHORTCUT_INTERCEPTION_ENABLED.load(Ordering::SeqCst)
}

// 更新要拦截的快捷键
#[cfg(windows)]
pub fn update_shortcut_to_intercept(shortcut: &str) {
    if let Some(parsed) = crate::global_state::parse_shortcut(shortcut) {
        let mut current_shortcut = CURRENT_SHORTCUT.lock().unwrap();
        *current_shortcut = Some(parsed.clone());
    }
}

// 更新要拦截的预览快捷键
#[cfg(windows)]
pub fn update_preview_shortcut_to_intercept(shortcut: &str) {
    if let Some(parsed) = crate::global_state::parse_shortcut(shortcut) {
        let mut preview_shortcut = PREVIEW_SHORTCUT.lock().unwrap();
        *preview_shortcut = Some(parsed.clone());
    }
}

// 启用导航按键监听
#[cfg(windows)]
pub fn enable_navigation_keys() {
    NAVIGATION_KEYS_ENABLED.store(true, Ordering::SeqCst);
}

// 禁用导航按键监听
#[cfg(windows)]
pub fn disable_navigation_keys() {
    NAVIGATION_KEYS_ENABLED.store(false, Ordering::SeqCst);
}

// 设置翻译进行状态（禁用导航按键）
#[cfg(windows)]
pub fn set_translation_in_progress(in_progress: bool) {
    TRANSLATION_IN_PROGRESS.store(in_progress, Ordering::SeqCst);
}

// 非Windows平台的空实现
#[cfg(not(windows))]
pub fn initialize_shortcut_interceptor(_window: tauri::WebviewWindow) {}

#[cfg(not(windows))]
pub fn install_shortcut_hook() {}

#[cfg(not(windows))]
pub fn uninstall_shortcut_hook() {}

#[cfg(not(windows))]
pub fn enable_shortcut_interception() {}

#[cfg(not(windows))]
pub fn disable_shortcut_interception() {}

#[cfg(not(windows))]
pub fn update_shortcut_to_intercept(_shortcut: &str) {}

#[cfg(not(windows))]
pub fn update_preview_shortcut_to_intercept(_shortcut: &str) {}

#[cfg(not(windows))]
pub fn is_interception_enabled() -> bool {
    false
}

#[cfg(not(windows))]
pub fn enable_navigation_keys() {}

#[cfg(not(windows))]
pub fn disable_navigation_keys() {}

#[cfg(not(windows))]
pub fn is_navigation_keys_enabled() -> bool {
    false
}

#[cfg(not(windows))]
pub fn set_translation_in_progress(_in_progress: bool) {}

#[cfg(not(windows))]
pub fn is_translation_in_progress() -> bool {
    false
}

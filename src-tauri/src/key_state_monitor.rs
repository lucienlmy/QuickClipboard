use crate::global_state::{parse_shortcut, ParsedShortcut};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU,
    VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
};

// 全局状态
static POLLING_ACTIVE: AtomicBool = AtomicBool::new(false);
static POLLING_THREAD_HANDLE: Mutex<Option<std::thread::JoinHandle<()>>> = Mutex::new(None);

// 按键状态结构
#[derive(Debug, Clone, Copy)]
struct KeyState {
    ctrl: bool,
    alt: bool,
    shift: bool,
    win: bool,
    escape: bool,
    // 数字键 1-9
    num1: bool,
    num2: bool,
    num3: bool,
    num4: bool,
    num5: bool,
    num6: bool,
    num7: bool,
    num8: bool,
    num9: bool,
    // 字母键
    a: bool,
    b: bool,
    c: bool,
    d: bool,
    e: bool,
    f: bool,
    g: bool,
    h: bool,
    i: bool,
    j: bool,
    k: bool,
    l: bool,
    m: bool,
    n: bool,
    o: bool,
    p: bool,
    q: bool,
    r: bool,
    s: bool,
    t: bool,
    u: bool,
    v: bool,
    w: bool,
    x: bool,
    y: bool,
    z: bool,
    // 功能键
    f1: bool,
    f2: bool,
    f3: bool,
    f4: bool,
    f5: bool,
    f6: bool,
    f7: bool,
    f8: bool,
    f9: bool,
    f10: bool,
    f11: bool,
    f12: bool,

    // 预览快捷键（默认反引号）
    backtick: bool,
}

impl Default for KeyState {
    fn default() -> Self {
        Self {
            ctrl: false,
            alt: false,
            shift: false,
            win: false,
            escape: false,
            num1: false,
            num2: false,
            num3: false,
            num4: false,
            num5: false,
            num6: false,
            num7: false,
            num8: false,
            num9: false,
            a: false,
            b: false,
            c: false,
            d: false,
            e: false,
            f: false,
            g: false,
            h: false,
            i: false,
            j: false,
            k: false,
            l: false,
            m: false,
            n: false,
            o: false,
            p: false,
            q: false,
            r: false,
            s: false,
            t: false,
            u: false,
            v: false,
            w: false,
            x: false,
            y: false,
            z: false,
            f1: false,
            f2: false,
            f3: false,
            f4: false,
            f5: false,
            f6: false,
            f7: false,
            f8: false,
            f9: false,
            f10: false,
            f11: false,
            f12: false,

            backtick: false,
        }
    }
}

// 基于定时器的按键检测系统
pub fn start_keyboard_polling_system() {
    if POLLING_ACTIVE.load(Ordering::SeqCst) {
        return;
    }

    let polling_handle = std::thread::spawn(|| {
        POLLING_ACTIVE.store(true, Ordering::SeqCst);

        let mut last_state = KeyState::default();

        // 主轮询循环，每15ms检查一次按键状态
        while POLLING_ACTIVE.load(Ordering::SeqCst) {
            let current_state = get_current_key_state();

            // 处理所有按键状态变化
            handle_key_state_changes(&last_state, &current_state);

            last_state = current_state;

            // 等待15ms再进行下一次检测
            std::thread::sleep(Duration::from_millis(15));
        }
    });

    if let Ok(mut handle) = POLLING_THREAD_HANDLE.lock() {
        *handle = Some(polling_handle);
    }
}

// 停止基于轮询的备用快捷键系统
pub fn stop_keyboard_polling_system() {
    POLLING_ACTIVE.store(false, Ordering::SeqCst);
    if let Ok(mut handle) = POLLING_THREAD_HANDLE.lock() {
        if let Some(join_handle) = handle.take() {
            let _ = join_handle.join();
        }
    }
}

// 查询备用快捷键系统是否处于活动状态
pub fn is_polling_active() -> bool {
    POLLING_ACTIVE.load(Ordering::SeqCst)
}

// 获取当前按键状态
fn get_current_key_state() -> KeyState {
    unsafe {
        KeyState {
            // 修饰键检测
            ctrl: (GetAsyncKeyState(VK_CONTROL.0 as i32) & 0x8000u16 as i16) != 0
                || (GetAsyncKeyState(VK_LCONTROL.0 as i32) & 0x8000u16 as i16) != 0
                || (GetAsyncKeyState(VK_RCONTROL.0 as i32) & 0x8000u16 as i16) != 0,

            alt: (GetAsyncKeyState(VK_MENU.0 as i32) & 0x8000u16 as i16) != 0
                || (GetAsyncKeyState(VK_LMENU.0 as i32) & 0x8000u16 as i16) != 0
                || (GetAsyncKeyState(VK_RMENU.0 as i32) & 0x8000u16 as i16) != 0,

            shift: (GetAsyncKeyState(VK_SHIFT.0 as i32) & 0x8000u16 as i16) != 0
                || (GetAsyncKeyState(VK_LSHIFT.0 as i32) & 0x8000u16 as i16) != 0
                || (GetAsyncKeyState(VK_RSHIFT.0 as i32) & 0x8000u16 as i16) != 0,

            win: (GetAsyncKeyState(VK_LWIN.0 as i32) & 0x8000u16 as i16) != 0
                || (GetAsyncKeyState(VK_RWIN.0 as i32) & 0x8000u16 as i16) != 0,

            escape: (GetAsyncKeyState(VK_ESCAPE.0 as i32) & 0x8000u16 as i16) != 0,

            // 数字键检测
            num1: (GetAsyncKeyState(0x31) & 0x8000u16 as i16) != 0,
            num2: (GetAsyncKeyState(0x32) & 0x8000u16 as i16) != 0,
            num3: (GetAsyncKeyState(0x33) & 0x8000u16 as i16) != 0,
            num4: (GetAsyncKeyState(0x34) & 0x8000u16 as i16) != 0,
            num5: (GetAsyncKeyState(0x35) & 0x8000u16 as i16) != 0,
            num6: (GetAsyncKeyState(0x36) & 0x8000u16 as i16) != 0,
            num7: (GetAsyncKeyState(0x37) & 0x8000u16 as i16) != 0,
            num8: (GetAsyncKeyState(0x38) & 0x8000u16 as i16) != 0,
            num9: (GetAsyncKeyState(0x39) & 0x8000u16 as i16) != 0,

            // 字母键检测
            a: (GetAsyncKeyState(0x41) & 0x8000u16 as i16) != 0,
            b: (GetAsyncKeyState(0x42) & 0x8000u16 as i16) != 0,
            c: (GetAsyncKeyState(0x43) & 0x8000u16 as i16) != 0,
            d: (GetAsyncKeyState(0x44) & 0x8000u16 as i16) != 0,
            e: (GetAsyncKeyState(0x45) & 0x8000u16 as i16) != 0,
            f: (GetAsyncKeyState(0x46) & 0x8000u16 as i16) != 0,
            g: (GetAsyncKeyState(0x47) & 0x8000u16 as i16) != 0,
            h: (GetAsyncKeyState(0x48) & 0x8000u16 as i16) != 0,
            i: (GetAsyncKeyState(0x49) & 0x8000u16 as i16) != 0,
            j: (GetAsyncKeyState(0x4A) & 0x8000u16 as i16) != 0,
            k: (GetAsyncKeyState(0x4B) & 0x8000u16 as i16) != 0,
            l: (GetAsyncKeyState(0x4C) & 0x8000u16 as i16) != 0,
            m: (GetAsyncKeyState(0x4D) & 0x8000u16 as i16) != 0,
            n: (GetAsyncKeyState(0x4E) & 0x8000u16 as i16) != 0,
            o: (GetAsyncKeyState(0x4F) & 0x8000u16 as i16) != 0,
            p: (GetAsyncKeyState(0x50) & 0x8000u16 as i16) != 0,
            q: (GetAsyncKeyState(0x51) & 0x8000u16 as i16) != 0,
            r: (GetAsyncKeyState(0x52) & 0x8000u16 as i16) != 0,
            s: (GetAsyncKeyState(0x53) & 0x8000u16 as i16) != 0,
            t: (GetAsyncKeyState(0x54) & 0x8000u16 as i16) != 0,
            u: (GetAsyncKeyState(0x55) & 0x8000u16 as i16) != 0,
            v: (GetAsyncKeyState(0x56) & 0x8000u16 as i16) != 0,
            w: (GetAsyncKeyState(0x57) & 0x8000u16 as i16) != 0,
            x: (GetAsyncKeyState(0x58) & 0x8000u16 as i16) != 0,
            y: (GetAsyncKeyState(0x59) & 0x8000u16 as i16) != 0,
            z: (GetAsyncKeyState(0x5A) & 0x8000u16 as i16) != 0,

            // 功能键检测
            f1: (GetAsyncKeyState(0x70) & 0x8000u16 as i16) != 0,
            f2: (GetAsyncKeyState(0x71) & 0x8000u16 as i16) != 0,
            f3: (GetAsyncKeyState(0x72) & 0x8000u16 as i16) != 0,
            f4: (GetAsyncKeyState(0x73) & 0x8000u16 as i16) != 0,
            f5: (GetAsyncKeyState(0x74) & 0x8000u16 as i16) != 0,
            f6: (GetAsyncKeyState(0x75) & 0x8000u16 as i16) != 0,
            f7: (GetAsyncKeyState(0x76) & 0x8000u16 as i16) != 0,
            f8: (GetAsyncKeyState(0x77) & 0x8000u16 as i16) != 0,
            f9: (GetAsyncKeyState(0x78) & 0x8000u16 as i16) != 0,
            f10: (GetAsyncKeyState(0x79) & 0x8000u16 as i16) != 0,
            f11: (GetAsyncKeyState(0x7A) & 0x8000u16 as i16) != 0,
            f12: (GetAsyncKeyState(0x7B) & 0x8000u16 as i16) != 0,

            // 反引号键检测
            backtick: (GetAsyncKeyState(0xC0) & 0x8000u16 as i16) != 0,
        }
    }
}

// 处理按键状态变化
fn handle_key_state_changes(last_state: &KeyState, current_state: &KeyState) {
    use crate::global_state::*;

    // 更新全局修饰键状态
    CTRL_HELD.store(current_state.ctrl, Ordering::SeqCst);
    ALT_HELD.store(current_state.alt, Ordering::SeqCst);
    SHIFT_HELD.store(current_state.shift, Ordering::SeqCst);
    WIN_HELD.store(current_state.win, Ordering::SeqCst);

    // 处理主窗口显示快捷键 (Win+V 或其他设置的快捷键)
    handle_main_window_shortcut_change(last_state, current_state);

    // 处理预览窗口快捷键 (Ctrl+`)
    handle_preview_shortcut_change(last_state, current_state);

    // 处理数字快捷键
    handle_number_shortcuts_change(last_state, current_state);

    // 处理其他快捷键
    handle_other_shortcuts_change(last_state, current_state);

    // 处理AI翻译取消快捷键 (Ctrl+Shift+Esc)
    handle_ai_translation_cancel_change(last_state, current_state);
}

// 处理主窗口显示快捷键变化
fn handle_main_window_shortcut_change(last_state: &KeyState, current_state: &KeyState) {
    use crate::global_state::*;

    // 获取当前设置的主窗口快捷键
    let settings = crate::settings::get_global_settings();
    let toggle_shortcut = if settings.toggle_shortcut.is_empty() {
        "Win+V".to_string()
    } else {
        settings.toggle_shortcut.clone()
    };

    // 检查应用过滤
    if settings.app_filter_enabled {
        if !crate::app_filter::is_current_app_allowed() {
            return;
        }
    }

    // 解析快捷键
    if let Some(parsed_shortcut) = parse_shortcut(&toggle_shortcut) {
        let last_combo = check_main_window_shortcut_combo(last_state, &parsed_shortcut);
        let current_combo = check_main_window_shortcut_combo(current_state, &parsed_shortcut);

        if !last_combo && current_combo {
            if let Some(window) = crate::mouse_hook::MAIN_WINDOW_HANDLE.get() {
                let window_clone = window.clone();
                std::thread::spawn(move || {
                    crate::window_management::toggle_webview_window_visibility(
                        window_clone.clone(),
                    );

                    // 延迟一点时间等窗口显示完成，然后模拟点击窗口
                    std::thread::sleep(std::time::Duration::from_millis(100));

                    #[cfg(windows)]
                    {
                        crate::window_management::simulate_click_on_window(&window_clone);
                    }
                });
            }
        }
    }
}

fn check_main_window_shortcut_combo(
    state: &KeyState,
    config: &crate::global_state::ParsedShortcut,
) -> bool {
    let ctrl_match = state.ctrl == config.ctrl;
    let shift_match = state.shift == config.shift;
    let alt_match = state.alt == config.alt;
    let win_match = state.win == config.win;

    let key_match = match config.key_code {
        0x56 => state.v,   // V 键
        0x41 => state.a,   // A 键
        0x43 => state.c,   // C 键
        0x70 => state.f1,  // F1 键
        0x71 => state.f2,  // F2 键
        0x72 => state.f3,  // F3 键
        0x73 => state.f4,  // F4 键
        0x74 => state.f5,  // F5 键
        0x75 => state.f6,  // F6 键
        0x76 => state.f7,  // F7 键
        0x77 => state.f8,  // F8 键
        0x78 => state.f9,  // F9 键
        0x79 => state.f10, // F10 键
        0x7A => state.f11, // F11 键
        0x7B => state.f12, // F12 键
        _ => false,        // 其他键暂时不支持
    };

    ctrl_match && shift_match && alt_match && win_match && key_match
}

// 处理预览窗口快捷键变化
fn handle_preview_shortcut_change(last_state: &KeyState, current_state: &KeyState) {
    use crate::global_state::*;

    let settings = crate::settings::get_global_settings();
    
    // 检查应用过滤
    if settings.app_filter_enabled {
        if !crate::app_filter::is_current_app_allowed() {
            return;
        }
    }

    if let Ok(config) = PREVIEW_SHORTCUT_CONFIG.lock() {
        let last_combo = check_shortcut_combo(last_state, &config);
        let current_combo = check_shortcut_combo(current_state, &config);

        if !last_combo && current_combo {
            if !settings.preview_enabled {
                return;
            }

            PREVIEW_SHORTCUT_HELD.store(true, Ordering::SeqCst);

            if let Some(window) = crate::mouse_hook::MAIN_WINDOW_HANDLE.get() {
                let app_handle = window.app_handle().clone();
                std::thread::spawn(move || {
                    let _ = tauri::async_runtime::block_on(
                        crate::preview_window::show_preview_window(app_handle),
                    );
                });
            }
        } else if last_combo && !current_combo {
            PREVIEW_SHORTCUT_HELD.store(false, Ordering::SeqCst);

            if !settings.preview_enabled {
                return;
            }

            let user_cancelled =
                crate::global_state::PREVIEW_CANCELLED_BY_USER.load(Ordering::SeqCst);

            if user_cancelled {
                crate::global_state::PREVIEW_CANCELLED_BY_USER.store(false, Ordering::SeqCst);

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
}

fn check_shortcut_combo(state: &KeyState, config: &crate::global_state::PreviewShortcut) -> bool {
    let ctrl_match = state.ctrl == config.ctrl;
    let shift_match = state.shift == config.shift;
    let alt_match = state.alt == config.alt;

    let key_match = match config.key_code {
        0xC0 => state.backtick, // 反引号
        _ => false,             // 其他键暂时不支持
    };

    ctrl_match && shift_match && alt_match && key_match
}

// 处理数字快捷键变化
fn handle_number_shortcuts_change(last_state: &KeyState, current_state: &KeyState) {
    use crate::global_state::*;

    if !NUMBER_SHORTCUTS_ENABLED.load(Ordering::SeqCst) {
        return;
    }

    // 获取当前配置的修饰键
    let modifier = get_number_shortcuts_modifier();
    
    // 检查修饰键是否匹配
    let modifier_matches = match modifier.as_str() {
        "Ctrl" => current_state.ctrl && !current_state.shift && !current_state.alt && !current_state.win,
        "Alt" => !current_state.ctrl && !current_state.shift && current_state.alt && !current_state.win,
        "Shift" => !current_state.ctrl && current_state.shift && !current_state.alt && !current_state.win,
        "Ctrl+Shift" => current_state.ctrl && current_state.shift && !current_state.alt && !current_state.win,
        "Ctrl+Alt" => current_state.ctrl && !current_state.shift && current_state.alt && !current_state.win,
        "Alt+Shift" => !current_state.ctrl && current_state.shift && current_state.alt && !current_state.win,
        _ => current_state.ctrl && !current_state.shift && !current_state.alt && !current_state.win, // 默认为Ctrl
    };

    if !modifier_matches {
        return;
    }

    // 检查应用过滤
    let settings = crate::settings::get_global_settings();
    if settings.app_filter_enabled {
        if !crate::app_filter::is_current_app_allowed() {
            return;
        }
    }

    let numbers = [
        (last_state.num1, current_state.num1, 0),
        (last_state.num2, current_state.num2, 1),
        (last_state.num3, current_state.num3, 2),
        (last_state.num4, current_state.num4, 3),
        (last_state.num5, current_state.num5, 4),
        (last_state.num6, current_state.num6, 5),
        (last_state.num7, current_state.num7, 6),
        (last_state.num8, current_state.num8, 7),
        (last_state.num9, current_state.num9, 8),
    ];

    for (last_pressed, current_pressed, index) in numbers {
        if !last_pressed && current_pressed {
            handle_number_shortcut_paste(index);
        }
    }
}

// 处理数字快捷键粘贴
fn handle_number_shortcut_paste(index: usize) {
    use crate::mouse_hook::MAIN_WINDOW_HANDLE;

    // 防抖检查
    let now_local = chrono::Local::now();
    let now = (now_local.timestamp_millis() + now_local.offset().local_minus_utc() as i64 * 1000) as u64;

    static LAST_PASTE_TIME: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    const PASTE_DEBOUNCE_MS: u64 = 50;

    let last_paste = LAST_PASTE_TIME.load(Ordering::Relaxed);
    if now - last_paste < PASTE_DEBOUNCE_MS {
        return;
    }

    LAST_PASTE_TIME.store(now, Ordering::Relaxed);

    if let Some(window) = MAIN_WINDOW_HANDLE.get().cloned() {
        std::thread::spawn(move || {
            use crate::window_management::set_last_focus_hwnd;
            use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

            let hwnd = unsafe { GetForegroundWindow() };
            set_last_focus_hwnd(hwnd.0);

            // 获取剪贴板历史项ID
            let clipboard_id = match crate::database::get_clipboard_history(None) {
                Ok(items) => {
                    if index < items.len() {
                        Some(items[index].id)
                    } else {
                        None
                    }
                }
                Err(_) => None,
            };
            
            if let Some(id) = clipboard_id {
                let window_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    let params = crate::services::paste_service::PasteContentParams {
                        clipboard_id: Some(id),
                        quick_text_id: None,
                    };
                    let _ = crate::commands::paste_content(params, window_clone).await;
                });
            }
        });
    }
}

// 处理其他快捷键变化
fn handle_other_shortcuts_change(last_state: &KeyState, current_state: &KeyState) {
    // 处理截屏快捷键
    handle_screenshot_shortcut_change(last_state, current_state);
}

// 处理AI翻译取消快捷键变化
fn handle_ai_translation_cancel_change(last_state: &KeyState, current_state: &KeyState) {
    use crate::global_state::*;

    if !AI_TRANSLATION_CANCEL_ENABLED.load(Ordering::SeqCst) {
        return;
    }

    // 检查应用过滤
    let settings = crate::settings::get_global_settings();
    if settings.app_filter_enabled {
        if !crate::app_filter::is_current_app_allowed() {
            return;
        }
    }

    let last_combo = last_state.ctrl && last_state.shift && last_state.escape;
    let current_combo = current_state.ctrl && current_state.shift && current_state.escape;

    if !last_combo && current_combo {
        if let Some(window) = crate::mouse_hook::MAIN_WINDOW_HANDLE.get() {
            let window_clone = window.clone();
            std::thread::spawn(move || {
                let _ = tauri::async_runtime::block_on(async {
                    let _ = crate::commands::cancel_translation();
                    let _ = window_clone.emit("ai-translation-cancelled", ());
                });
            });
        }
    }
}
// 处理截屏快捷键变化
fn handle_screenshot_shortcut_change(last_state: &KeyState, current_state: &KeyState) {
    // 如果正在录制快捷键，跳过处理
    if crate::global_state::SHORTCUT_RECORDING.load(std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    
    // 获取当前设置的截屏快捷键
    let settings = crate::settings::get_global_settings();

    if !settings.screenshot_enabled {
        return;
    }

    // 检查应用过滤
    if settings.app_filter_enabled {
        if !crate::app_filter::is_current_app_allowed() {
            return;
        }
    }

    let screenshot_shortcut = if settings.screenshot_shortcut.is_empty() {
        "Ctrl+Shift+A".to_string()
    } else {
        settings.screenshot_shortcut.clone()
    };

    // 解析快捷键
    if let Some(parsed_shortcut) = parse_shortcut(&screenshot_shortcut) {
        let last_combo = check_screenshot_shortcut_combo(last_state, &parsed_shortcut);
        let current_combo = check_screenshot_shortcut_combo(current_state, &parsed_shortcut);

        if !last_combo && current_combo {
            if let Some(window) = crate::mouse_hook::MAIN_WINDOW_HANDLE.get() {
                let app_handle = window.app_handle().clone();
                // 启动内置截屏
                if let Err(e) = crate::commands::start_builtin_screenshot(app_handle) {
                    eprintln!("截屏失败: {}", e);
                }
            }
        }
    }
}

fn check_screenshot_shortcut_combo(state: &KeyState, shortcut: &ParsedShortcut) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;

    let ctrl_match = shortcut.ctrl == state.ctrl;
    let shift_match = shortcut.shift == state.shift;
    let alt_match = shortcut.alt == state.alt;
    let win_match = shortcut.win == state.win;

    let key_match = match shortcut.key_code {
        // 字母键
        0x41 => state.a, // A键
        0x42 => state.b, // B键
        0x43 => state.c, // C键
        0x44 => state.d, // D键
        0x45 => state.e, // E键
        0x46 => state.f, // F键
        0x47 => state.g, // G键
        0x48 => state.h, // H键
        0x49 => state.i, // I键
        0x4A => state.j, // J键
        0x4B => state.k, // K键
        0x4C => state.l, // L键
        0x4D => state.m, // M键
        0x4E => state.n, // N键
        0x4F => state.o, // O键
        0x50 => state.p, // P键
        0x51 => state.q, // Q键
        0x52 => state.r, // R键
        0x53 => state.s, // S键
        0x54 => state.t, // T键
        0x55 => state.u, // U键
        0x56 => state.v, // V键
        0x57 => state.w, // W键
        0x58 => state.x, // X键
        0x59 => state.y, // Y键
        0x5A => state.z, // Z键
        // 数字键
        0x31 => state.num1, // 1键
        0x32 => state.num2, // 2键
        0x33 => state.num3, // 3键
        0x34 => state.num4, // 4键
        0x35 => state.num5, // 5键
        0x36 => state.num6, // 6键
        0x37 => state.num7, // 7键
        0x38 => state.num8, // 8键
        0x39 => state.num9, // 9键
        // 功能键
        0x70 => state.f1,  // F1键
        0x71 => state.f2,  // F2键
        0x72 => state.f3,  // F3键
        0x73 => state.f4,  // F4键
        0x74 => state.f5,  // F5键
        0x75 => state.f6,  // F6键
        0x76 => state.f7,  // F7键
        0x77 => state.f8,  // F8键
        0x78 => state.f9,  // F9键
        0x79 => state.f10, // F10键
        0x7A => state.f11, // F11键
        0x7B => state.f12, // F12键
        // 特殊键
        0xC0 => state.backtick, // 反引号键
        _ => {
            // 对于其他按键，使用GetAsyncKeyState直接检查
            unsafe { GetAsyncKeyState(shortcut.key_code as i32) as u16 & 0x8000 != 0 }
        }
    };

    ctrl_match && shift_match && alt_match && win_match && key_match
}

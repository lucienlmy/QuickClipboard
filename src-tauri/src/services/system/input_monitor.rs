use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, WebviewWindow};

use super::input_common;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LCONTROL, VK_RCONTROL, VK_MENU, VK_LMENU, VK_RMENU, VK_SHIFT, VK_LSHIFT, VK_RSHIFT, VK_LWIN, VK_RWIN};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExW, TranslateMessage,
    UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN,
    WM_SYSKEYUP,
};

#[cfg(target_os = "windows")]
static KEYBOARD_HOOK_ACTIVE: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static KEYBOARD_HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
#[cfg(target_os = "windows")]
static KEYBOARD_HOOK_THREAD: Mutex<Option<thread::JoinHandle<()>>> = Mutex::new(None);

#[cfg(target_os = "windows")]
static QUICKPASTE_HIDE_TRIGGERED: AtomicBool = AtomicBool::new(false);

static QUICKPASTE_KEYBOARD_MODE_ENABLED: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
static QUICKPASTE_REQUIRED_MODIFIER_MASK: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

static NAVIGATION_KEYS_ENABLED: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct KeyboardState {
    ctrl: bool,
    alt: bool,
    shift: bool,
    meta: bool,
}

#[cfg(target_os = "windows")]
fn get_modifier_keys_state_from_os() -> (bool, bool, bool, bool) {
    unsafe {
        let ctrl = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
        let alt = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
        let shift = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
        let meta = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000) != 0
            || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000) != 0;
        (ctrl, alt, shift, meta)
    }
}

#[cfg(target_os = "windows")]
fn refresh_modifier_state_from_os() -> (bool, bool, bool, bool) {
    let (ctrl, alt, shift, meta) = get_modifier_keys_state_from_os();
    {
        let mut state = KEYBOARD_STATE.lock();
        state.ctrl = ctrl;
        state.alt = alt;
        state.shift = shift;
        state.meta = meta;
    }
    (ctrl, alt, shift, meta)
}

#[cfg(target_os = "windows")]
fn modifier_mask_from_vk(vk: u32) -> u8 {
    if vk == VK_CONTROL.0 as u32 || vk == VK_LCONTROL.0 as u32 || vk == VK_RCONTROL.0 as u32 {
        return 0x01;
    }
    if vk == VK_MENU.0 as u32 || vk == VK_LMENU.0 as u32 || vk == VK_RMENU.0 as u32 {
        return 0x02;
    }
    if vk == VK_SHIFT.0 as u32 || vk == VK_LSHIFT.0 as u32 || vk == VK_RSHIFT.0 as u32 {
        return 0x04;
    }
    if vk == VK_LWIN.0 as u32 || vk == VK_RWIN.0 as u32 {
        return 0x08;
    }
    0
}

static KEYBOARD_STATE: Mutex<KeyboardState> = Mutex::new(KeyboardState {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
});

static THROTTLE_STATE: Lazy<Mutex<HashMap<String, Instant>>> = Lazy::new(|| Mutex::new(HashMap::new()));

static CONSUMED_KEYS: Lazy<Mutex<HashSet<u32>>> = Lazy::new(|| Mutex::new(HashSet::new()));

fn get_throttle_delay(action: &str) -> Option<Duration> {
    match action {
        "navigate-up" | "navigate-down" => None,
        "tab-left" | "tab-right" => Some(Duration::from_millis(150)),
        "previous-group" | "next-group" => Some(Duration::from_millis(100)),
        "execute-item" | "focus-search" | "hide-window" | "toggle-pin" => Some(Duration::from_millis(200)),
        _ => Some(Duration::from_millis(100)),
    }
}

pub fn init_input_monitor(window: WebviewWindow) {
    input_common::set_main_window(window);
}

pub fn update_main_window(window: WebviewWindow) {
    input_common::set_main_window(window);
}

pub fn enable_navigation_keys() {
    NAVIGATION_KEYS_ENABLED.store(true, Ordering::SeqCst);

    #[cfg(target_os = "windows")]
    {
        let _ = refresh_modifier_state_from_os();
        start_keyboard_hook_if_needed();
    }
}

pub fn disable_navigation_keys() {
    NAVIGATION_KEYS_ENABLED.store(false, Ordering::SeqCst);

    #[cfg(target_os = "windows")]
    stop_keyboard_hook_if_needed();
}

pub fn enable_mouse_monitoring() {
    input_common::set_mouse_monitoring_enabled(true);
}

pub fn disable_mouse_monitoring() {
    input_common::set_mouse_monitoring_enabled(false);
}

pub fn is_mouse_monitoring_enabled() -> bool {
    input_common::is_mouse_monitoring_enabled()
}

pub fn enable_quickpaste_keyboard_mode() {
    let settings = crate::get_settings();
    if !settings.quickpaste_enabled || !settings.quickpaste_paste_on_modifier_release {
        #[cfg(target_os = "windows")]
        {
            QUICKPASTE_KEYBOARD_MODE_ENABLED.store(false, Ordering::SeqCst);
            QUICKPASTE_REQUIRED_MODIFIER_MASK.store(0, Ordering::Relaxed);
            QUICKPASTE_HIDE_TRIGGERED.store(false, Ordering::SeqCst);
            stop_keyboard_hook_if_needed();
        }
        return;
    }

    let shortcut = settings.quickpaste_shortcut;
    let mut mask: u8 = 0;
    for part in shortcut.split('+') {
        match part.trim() {
            "Ctrl" | "Control" => mask |= 0x01,
            "Alt" => mask |= 0x02,
            "Shift" => mask |= 0x04,
            "Win" | "Super" | "Meta" | "Cmd" | "Command" => mask |= 0x08,
            _ => {}
        }
    }

    #[cfg(target_os = "windows")]
    {
        QUICKPASTE_KEYBOARD_MODE_ENABLED.store(true, Ordering::SeqCst);
        QUICKPASTE_REQUIRED_MODIFIER_MASK.store(mask, Ordering::Relaxed);
        QUICKPASTE_HIDE_TRIGGERED.store(false, Ordering::SeqCst);

        // 按需安装钩子时，Ctrl 等修饰键可能在钩子安装前就已经按下（用于触发显示快捷键）。
        // 若不初始化状态，释放其它修饰键会导致误判为“全部松开”。
        {
            let mut state = KEYBOARD_STATE.lock();
            unsafe {
                state.ctrl = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
                state.alt = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
                state.shift = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
                state.meta = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000) != 0
                    || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000) != 0;
            }
        }

        start_keyboard_hook_if_needed();
    }
}

pub fn disable_quickpaste_keyboard_mode() {
    #[cfg(target_os = "windows")]
    {
        QUICKPASTE_KEYBOARD_MODE_ENABLED.store(false, Ordering::SeqCst);
        QUICKPASTE_REQUIRED_MODIFIER_MASK.store(0, Ordering::Relaxed);
        QUICKPASTE_HIDE_TRIGGERED.store(false, Ordering::SeqCst);
        stop_keyboard_hook_if_needed();
    }
}

pub fn get_modifier_keys_state() -> (bool, bool, bool, bool) {
    #[cfg(target_os = "windows")]
    {
        unsafe {
            let ctrl = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
            let alt = (GetAsyncKeyState(VK_MENU.0 as i32) as u16 & 0x8000) != 0;
            let shift = (GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000) != 0;
            let meta = (GetAsyncKeyState(VK_LWIN.0 as i32) as u16 & 0x8000) != 0
                || (GetAsyncKeyState(VK_RWIN.0 as i32) as u16 & 0x8000) != 0;
            (ctrl, alt, shift, meta)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let state = KEYBOARD_STATE.lock();
        (state.ctrl, state.alt, state.shift, state.meta)
    }
}

fn handle_navigation_key(vk: u32) -> bool {
    #[cfg(target_os = "windows")]
    let modifier_state = refresh_modifier_state_from_os();

    #[cfg(not(target_os = "windows"))]
    let modifier_state = match KEYBOARD_STATE.try_lock() {
        Some(state) => (state.ctrl, state.alt, state.shift, state.meta),
        None => return false,
    };

    if crate::services::system::is_front_app_globally_disabled_from_settings() {
        return false;
    }

    let settings = crate::get_settings();

    let shortcuts = [
        (&settings.navigate_up_shortcut, "navigate-up"),
        (&settings.navigate_down_shortcut, "navigate-down"),
        (&settings.execute_item_shortcut, "execute-item"),
        (&settings.tab_left_shortcut, "tab-left"),
        (&settings.tab_right_shortcut, "tab-right"),
        (&settings.previous_group_shortcut, "previous-group"),
        (&settings.next_group_shortcut, "next-group"),
        (&settings.focus_search_shortcut, "focus-search"),
        (&settings.hide_window_shortcut, "hide-window"),
        (&settings.toggle_pin_shortcut, "toggle-pin"),
    ];

    for (shortcut_str, action) in shortcuts {
        if check_shortcut_match_fast(vk, shortcut_str, modifier_state) {
            if should_throttle(action) {
                return true;
            }

            emit_navigation_action(action);
            return true;
        }
    }
    false
}

fn check_shortcut_match_fast(vk: u32, shortcut_str: &str, modifier_state: (bool, bool, bool, bool)) -> bool {
    let (ctrl, alt, shift, meta) = modifier_state;
    let parts: Vec<&str> = shortcut_str.split('+').collect();

    let mut required_ctrl = false;
    let mut required_alt = false;
    let mut required_shift = false;
    let mut required_meta = false;
    let mut main_key = "";

    for part in &parts {
        match part.trim() {
            "Ctrl" | "Control" => required_ctrl = true,
            "Alt" => required_alt = true,
            "Shift" => required_shift = true,
            "Win" | "Super" | "Meta" | "Cmd" | "Command" => required_meta = true,
            key_str => main_key = key_str,
        }
    }

    if ctrl != required_ctrl || alt != required_alt || shift != required_shift || meta != required_meta {
        return false;
    }

    match_key(vk, main_key)
}

fn should_throttle(action: &str) -> bool {
    let delay = match get_throttle_delay(action) {
        Some(d) => d,
        None => return false,
    };

    let mut throttle_state = match THROTTLE_STATE.try_lock() {
        Some(state) => state,
        None => return false,
    };

    let now = Instant::now();

    if let Some(last_time) = throttle_state.get(action) {
        if now.duration_since(*last_time) < delay {
            return true;
        }
    }

    throttle_state.insert(action.to_string(), now);
    false
}

fn match_key(vk: u32, key_str: &str) -> bool {
    let target_vk: u32 = match key_str {
        // 方向键
        "ArrowUp" | "Up" => 0x26,
        "ArrowDown" | "Down" => 0x28,
        "ArrowLeft" | "Left" => 0x25,
        "ArrowRight" | "Right" => 0x27,
        // 特殊键
        "Enter" | "Return" => 0x0D,
        "Escape" | "Esc" => 0x1B,
        "Tab" => 0x09,
        "Space" => 0x20,
        "Backspace" => 0x08,
        "Delete" => 0x2E,
        "Home" => 0x24,
        "End" => 0x23,
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "Insert" => 0x2D,
        // 字母键 A-Z
        "A" => 0x41,
        "B" => 0x42,
        "C" => 0x43,
        "D" => 0x44,
        "E" => 0x45,
        "F" => 0x46,
        "G" => 0x47,
        "H" => 0x48,
        "I" => 0x49,
        "J" => 0x4A,
        "K" => 0x4B,
        "L" => 0x4C,
        "M" => 0x4D,
        "N" => 0x4E,
        "O" => 0x4F,
        "P" => 0x50,
        "Q" => 0x51,
        "R" => 0x52,
        "S" => 0x53,
        "T" => 0x54,
        "U" => 0x55,
        "V" => 0x56,
        "W" => 0x57,
        "X" => 0x58,
        "Y" => 0x59,
        "Z" => 0x5A,
        // 数字键 0-9
        "0" => 0x30,
        "1" => 0x31,
        "2" => 0x32,
        "3" => 0x33,
        "4" => 0x34,
        "5" => 0x35,
        "6" => 0x36,
        "7" => 0x37,
        "8" => 0x38,
        "9" => 0x39,
        // 功能键 F1-F12
        "F1" => 0x70,
        "F2" => 0x71,
        "F3" => 0x72,
        "F4" => 0x73,
        "F5" => 0x74,
        "F6" => 0x75,
        "F7" => 0x76,
        "F8" => 0x77,
        "F9" => 0x78,
        "F10" => 0x79,
        "F11" => 0x7A,
        "F12" => 0x7B,
        _ => return false,
    };

    vk == target_vk
}

fn emit_navigation_action(action: &str) {
    if let Some(window) = input_common::try_get_main_window() {
        let _ = window.emit(
            "navigation-action",
            serde_json::json!({
                "action": action
            }),
        );
    }
}

fn handle_quickpaste_next_request_impl() {
    let settings = crate::get_settings();
    if !settings.quickpaste_enabled || !settings.quickpaste_paste_on_modifier_release {
        return;
    }

    if !crate::windows::quickpaste::is_visible() {
        return;
    }

    if let Some(app) = input_common::try_get_app_handle() {
        if let Some(window) = app.get_webview_window("quickpaste") {
            let _ = window.emit("quickpaste-next", ());
        }
    }
}

fn handle_quickpaste_hide_request_impl() {
    let settings = crate::get_settings();
    if !settings.quickpaste_enabled || !settings.quickpaste_paste_on_modifier_release {
        return;
    }

    if !crate::windows::quickpaste::is_visible() {
        return;
    }

    let app = match input_common::try_get_app_handle() {
        Some(a) => a,
        None => return,
    };

    if let Some(window) = app.get_webview_window("quickpaste") {
        let _ = window.emit("quickpaste-hide", ());
    }

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(50));
        let _ = crate::windows::quickpaste::hide_quickpaste_window(&app);
    });
}

#[cfg(target_os = "windows")]
fn start_keyboard_hook_if_needed() {
    if !NAVIGATION_KEYS_ENABLED.load(Ordering::SeqCst)
        && !QUICKPASTE_KEYBOARD_MODE_ENABLED.load(Ordering::SeqCst)
    {
        return;
    }

    if KEYBOARD_HOOK_ACTIVE.swap(true, Ordering::SeqCst) {
        return;
    }

    let handle = thread::spawn(|| unsafe {
        let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook_proc), None, 0) {
            Ok(h) => h,
            Err(_) => {
                eprintln!("[钩子] 安装 WH_KEYBOARD_LL 失败");
                KEYBOARD_HOOK_ACTIVE.store(false, Ordering::SeqCst);
                return;
            }
        };

        if hook.0.is_null() {
            eprintln!("[钩子] 安装 WH_KEYBOARD_LL 失败：hook 句柄为空");
            KEYBOARD_HOOK_ACTIVE.store(false, Ordering::SeqCst);
            return;
        }

        println!("[钩子] 已安装 WH_KEYBOARD_LL");

        let tid = windows::Win32::System::Threading::GetCurrentThreadId();
        KEYBOARD_HOOK_THREAD_ID.store(tid, Ordering::SeqCst);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);

            if !KEYBOARD_HOOK_ACTIVE.load(Ordering::SeqCst) {
                break;
            }
        }

        let _ = UnhookWindowsHookEx(hook);
        println!("[钩子] 已卸载 WH_KEYBOARD_LL（线程退出）");

        KEYBOARD_HOOK_THREAD_ID.store(0, Ordering::SeqCst);
        KEYBOARD_HOOK_ACTIVE.store(false, Ordering::SeqCst);
    });

    *KEYBOARD_HOOK_THREAD.lock() = Some(handle);
}

#[cfg(target_os = "windows")]
fn stop_keyboard_hook_if_needed() {
    if NAVIGATION_KEYS_ENABLED.load(Ordering::SeqCst)
        || QUICKPASTE_KEYBOARD_MODE_ENABLED.load(Ordering::SeqCst)
    {
        return;
    }

    if KEYBOARD_HOOK_ACTIVE.swap(false, Ordering::SeqCst) {
        let tid = KEYBOARD_HOOK_THREAD_ID.load(Ordering::SeqCst);
        if tid != 0 {
            unsafe {
                let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn keyboard_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code < 0 {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let msg = wparam.0 as u32;
    if msg != WM_KEYDOWN && msg != WM_KEYUP && msg != WM_SYSKEYDOWN && msg != WM_SYSKEYUP {
        return CallNextHookEx(None, code, wparam, lparam);
    }

    let kb = *(lparam.0 as *const KBDLLHOOKSTRUCT);
    let vk = kb.vkCode;

    let pressed = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    update_modifier_vk(vk, pressed);

    let is_modifier_vk = vk == VK_CONTROL.0 as u32
        || vk == VK_LCONTROL.0 as u32
        || vk == VK_RCONTROL.0 as u32
        || vk == VK_MENU.0 as u32
        || vk == VK_LMENU.0 as u32
        || vk == VK_RMENU.0 as u32
        || vk == VK_SHIFT.0 as u32
        || vk == VK_LSHIFT.0 as u32
        || vk == VK_RSHIFT.0 as u32
        || vk == VK_LWIN.0 as u32
        || vk == VK_RWIN.0 as u32;

    if QUICKPASTE_KEYBOARD_MODE_ENABLED.load(Ordering::SeqCst) {
        if pressed {
            // 便捷粘贴键盘模式下，任意非修饰键按下 => 下一条
            if !is_modifier_vk {
                handle_quickpaste_next_request_impl();
                return LRESULT(1);
            }
        } else {
            // 仅当释放的是“快捷键所需的修饰键”时，才检查是否全部松开
            let required = QUICKPASTE_REQUIRED_MODIFIER_MASK.load(Ordering::Relaxed);
            let released_mask = modifier_mask_from_vk(vk);
            if required != 0 && is_modifier_vk && (released_mask & required) != 0 {
                let state = KEYBOARD_STATE.lock();
                let all_released = ((required & 0x01) == 0 || !state.ctrl)
                    && ((required & 0x02) == 0 || !state.alt)
                    && ((required & 0x04) == 0 || !state.shift)
                    && ((required & 0x08) == 0 || !state.meta);
                drop(state);

                if all_released && !QUICKPASTE_HIDE_TRIGGERED.swap(true, Ordering::SeqCst) {
                    handle_quickpaste_hide_request_impl();
                }
            }
        }
    }

    if !pressed {
        let mut consumed = CONSUMED_KEYS.lock();
        if consumed.remove(&vk) {
            return LRESULT(1);
        }
        return CallNextHookEx(None, code, wparam, lparam);
    }

    if NAVIGATION_KEYS_ENABLED.load(Ordering::SeqCst) {
        if handle_navigation_key(vk) {
            CONSUMED_KEYS.lock().insert(vk);
            return LRESULT(1);
        }
    }

    CallNextHookEx(None, code, wparam, lparam)
}

#[cfg(target_os = "windows")]
fn update_modifier_vk(vk: u32, pressed: bool) {
    let mut state = KEYBOARD_STATE.lock();
    match vk {
        x if x == VK_CONTROL.0 as u32 || x == VK_LCONTROL.0 as u32 || x == VK_RCONTROL.0 as u32 => state.ctrl = pressed,
        x if x == VK_MENU.0 as u32 || x == VK_LMENU.0 as u32 || x == VK_RMENU.0 as u32 => state.alt = pressed,
        x if x == VK_SHIFT.0 as u32 || x == VK_LSHIFT.0 as u32 || x == VK_RSHIFT.0 as u32 => state.shift = pressed,
        x if x == VK_LWIN.0 as u32 || x == VK_RWIN.0 as u32 => state.meta = pressed,
        _ => {}
    }
}


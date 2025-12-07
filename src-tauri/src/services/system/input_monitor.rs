use once_cell::sync::{OnceCell, Lazy};
use parking_lot::Mutex;
use rdev::{grab, Event, EventType, Key};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use tauri::{Emitter, Manager, WebviewWindow};

static MAIN_WINDOW: OnceCell<WebviewWindow> = OnceCell::new();
static MONITORING_ACTIVE: AtomicBool = AtomicBool::new(false);
static MONITORING_THREAD: Mutex<Option<thread::JoinHandle<()>>> = Mutex::new(None);

static NAVIGATION_KEYS_ENABLED: AtomicBool = AtomicBool::new(false);
static MOUSE_MONITORING_ENABLED: AtomicBool = AtomicBool::new(false);

// 中键按下时间记录
static MIDDLE_BUTTON_PRESS_TIME: Mutex<Option<Instant>> = Mutex::new(None);
// 长按是否已触发标记
static LONG_PRESS_TRIGGERED: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct KeyboardState {
    ctrl: bool,
    alt: bool,
    shift: bool,
    meta: bool,
}

static KEYBOARD_STATE: Mutex<KeyboardState> = Mutex::new(KeyboardState {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
});

static THROTTLE_STATE: Lazy<Mutex<HashMap<String, Instant>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn get_throttle_delay(action: &str) -> Duration {
    match action {
        "navigate-up" | "navigate-down" => Duration::from_millis(80),
        "tab-left" | "tab-right" | "previous-group" | "next-group" => Duration::from_millis(150),
        _ => Duration::from_millis(200),
    }
}

pub fn init_input_monitor(window: WebviewWindow) {
    let _ = MAIN_WINDOW.set(window);
}

pub fn start_monitoring() {
    if MONITORING_ACTIVE.load(Ordering::SeqCst) {
        return;
    }

    MONITORING_ACTIVE.store(true, Ordering::SeqCst);

    let handle = thread::spawn(|| {
        if let Err(error) = grab(move |event| {
            if !MONITORING_ACTIVE.load(Ordering::SeqCst) {
                return Some(event);
            }
            
            handle_input_event(event)
        }) {
            eprintln!("输入监控错误: {:?}", error);
        }
    });

    *MONITORING_THREAD.lock() = Some(handle);
}

pub fn stop_monitoring() {
    MONITORING_ACTIVE.store(false, Ordering::SeqCst);
}

pub fn is_monitoring_active() -> bool {
    MONITORING_ACTIVE.load(Ordering::SeqCst)
}

pub fn enable_navigation_keys() {
    NAVIGATION_KEYS_ENABLED.store(true, Ordering::SeqCst);
}

pub fn disable_navigation_keys() {
    NAVIGATION_KEYS_ENABLED.store(false, Ordering::SeqCst);
}

pub fn is_navigation_keys_enabled() -> bool {
    NAVIGATION_KEYS_ENABLED.load(Ordering::SeqCst)
}

pub fn enable_mouse_monitoring() {
    MOUSE_MONITORING_ENABLED.store(true, Ordering::Relaxed);
}

pub fn disable_mouse_monitoring() {
    MOUSE_MONITORING_ENABLED.store(false, Ordering::Relaxed);
}

pub fn is_mouse_monitoring_enabled() -> bool {
    MOUSE_MONITORING_ENABLED.load(Ordering::Relaxed)
}

pub fn get_modifier_keys_state() -> (bool, bool, bool, bool) {
    if let Some(state) = KEYBOARD_STATE.try_lock() {
        (state.ctrl, state.alt, state.shift, state.meta)
    } else {
        (false, false, false, false)
    }
}

fn handle_input_event(event: Event) -> Option<Event> {
    match event.event_type {
        EventType::KeyPress(key) => {
            if handle_key_press(key, &event) {
                None
            } else {
                Some(event)
            }
        }
        EventType::KeyRelease(key) => {
            handle_key_release(key);
            Some(event)
        }
        EventType::ButtonPress(button) => {
            handle_mouse_button_press(button);
            Some(event)
        }
        EventType::ButtonRelease(button) => {
            handle_mouse_button_release(button);
            Some(event)
        }
        EventType::MouseMove { x, y } => {
            handle_mouse_move(x, y);
            Some(event)
        }
        EventType::Wheel { delta_x, delta_y } => {
            let should_intercept = handle_mouse_wheel(delta_x, delta_y);
            if should_intercept {
                None
            } else {
                Some(event)
            }
        }
    }
}

fn handle_key_press(key: Key, _event: &Event) -> bool {
    update_modifier_key(key, true);
    
    if matches!(key, Key::KeyV) {
        if let Some(state) = KEYBOARD_STATE.try_lock() {
            if state.ctrl && !state.alt && !state.shift && !state.meta {
                crate::AppSounds::play_paste();
            }
        }
    }
    
    if NAVIGATION_KEYS_ENABLED.load(Ordering::SeqCst) {
        return handle_navigation_key(key);
    }
    
    false
}

fn handle_key_release(key: Key) {
    update_modifier_key(key, false);
}

fn update_modifier_key(key: Key, pressed: bool) {
    if let Some(mut state) = KEYBOARD_STATE.try_lock() {
        match key {
            Key::ControlLeft | Key::ControlRight => state.ctrl = pressed,
            Key::Alt | Key::AltGr => state.alt = pressed,
            Key::ShiftLeft | Key::ShiftRight => state.shift = pressed,
            Key::MetaLeft | Key::MetaRight => state.meta = pressed,
            _ => {}
        }
    }
}

fn handle_navigation_key(key: Key) -> bool {
    if let Some(window) = MAIN_WINDOW.get() {
        let settings = crate::get_settings();
        
        let shortcuts = [
            (&settings.navigate_up_shortcut, "navigate-up"),
            (&settings.navigate_down_shortcut, "navigate-down"),
            (&settings.tab_left_shortcut, "tab-left"),
            (&settings.tab_right_shortcut, "tab-right"),
            (&settings.focus_search_shortcut, "focus-search"),
            (&settings.hide_window_shortcut, "hide-window"),
            (&settings.execute_item_shortcut, "execute-item"),
            (&settings.previous_group_shortcut, "previous-group"),
            (&settings.next_group_shortcut, "next-group"),
            (&settings.toggle_pin_shortcut, "toggle-pin"),
        ];

        for (shortcut_str, action) in shortcuts {
            if check_shortcut_match(key, shortcut_str) {
                if should_throttle(action) {
                    return true;
                }
                
                let _ = window.emit(
                    "navigation-action",
                    serde_json::json!({
                        "action": action
                    }),
                );
                return true;
            }
        }
    }
    false 
}

fn should_throttle(action: &str) -> bool {
    let mut throttle_state = THROTTLE_STATE.lock();
    let now = Instant::now();
    let delay = get_throttle_delay(action);
    
    if let Some(last_time) = throttle_state.get(action) {
        if now.duration_since(*last_time) < delay {
            return true;
        }
    }
    
    throttle_state.insert(action.to_string(), now);
    false
}

fn check_shortcut_match(key: Key, shortcut_str: &str) -> bool {
    if let Some(state) = KEYBOARD_STATE.try_lock() {
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
        
        if state.ctrl != required_ctrl || 
           state.alt != required_alt || 
           state.shift != required_shift || 
           state.meta != required_meta {
            return false;
        }
        
        match_key(key, main_key)
    } else {
        false
    }
}

fn match_key(key: Key, key_str: &str) -> bool {
    use Key::*;
    
    let target_key = match key_str {
        // 方向键
        "ArrowUp" | "Up" => UpArrow,
        "ArrowDown" | "Down" => DownArrow,
        "ArrowLeft" | "Left" => LeftArrow,
        "ArrowRight" | "Right" => RightArrow,
        // 特殊键
        "Enter" | "Return" => Return,
        "Escape" | "Esc" => Escape,
        "Tab" => Tab,
        "Space" => Space,
        "Backspace" => Backspace,
        "Delete" => Delete,
        "Home" => Home,
        "End" => End,
        "PageUp" => PageUp,
        "PageDown" => PageDown,
        // 字母键 A-Z
        "A" => KeyA, "B" => KeyB, "C" => KeyC, "D" => KeyD, "E" => KeyE,
        "F" => KeyF, "G" => KeyG, "H" => KeyH, "I" => KeyI, "J" => KeyJ,
        "K" => KeyK, "L" => KeyL, "M" => KeyM, "N" => KeyN, "O" => KeyO,
        "P" => KeyP, "Q" => KeyQ, "R" => KeyR, "S" => KeyS, "T" => KeyT,
        "U" => KeyU, "V" => KeyV, "W" => KeyW, "X" => KeyX, "Y" => KeyY, "Z" => KeyZ,
        // 数字键 0-9
        "0" => Num0, "1" => Num1, "2" => Num2, "3" => Num3, "4" => Num4,
        "5" => Num5, "6" => Num6, "7" => Num7, "8" => Num8, "9" => Num9,
        // 功能键 F1-F12
        "F1" => F1, "F2" => F2, "F3" => F3, "F4" => F4,
        "F5" => F5, "F6" => F6, "F7" => F7, "F8" => F8,
        "F9" => F9, "F10" => F10, "F11" => F11, "F12" => F12,
        _ => return false,
    };
    
    std::mem::discriminant(&key) == std::mem::discriminant(&target_key)
}

fn handle_mouse_button_press(button: rdev::Button) {
    let settings = crate::get_settings();
    
    // 处理中键按下
    if button == rdev::Button::Middle && settings.mouse_middle_button_enabled {
        if settings.mouse_middle_button_modifier == "None" {
            *MIDDLE_BUTTON_PRESS_TIME.lock() = Some(Instant::now());
            LONG_PRESS_TRIGGERED.store(false, Ordering::SeqCst);
            
            if settings.mouse_middle_button_trigger == "long_press" {
                let threshold_ms = settings.mouse_middle_button_long_press_ms;
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(threshold_ms as u64));
                    
                    if MIDDLE_BUTTON_PRESS_TIME.lock().is_some() {
                        LONG_PRESS_TRIGGERED.store(true, Ordering::SeqCst);
                        handle_middle_button_action();
                    }
                });
            }
            return;
        }
    }
    
    let mouse_monitoring_enabled = MOUSE_MONITORING_ENABLED.load(Ordering::Relaxed);
    let context_menu_visible = crate::is_context_menu_visible();
    
    if !mouse_monitoring_enabled && !context_menu_visible {
        return;
    }

    if matches!(button, rdev::Button::Left | rdev::Button::Right) {
        handle_click_outside();
    }
}

fn handle_mouse_button_release(button: rdev::Button) {
    let settings = crate::get_settings();
    
    if button == rdev::Button::Middle && settings.mouse_middle_button_enabled {
        if settings.mouse_middle_button_modifier != "None" {
            handle_middle_button_action();
            return;
        }
        
        let press_time = MIDDLE_BUTTON_PRESS_TIME.lock().take();
        
        if settings.mouse_middle_button_trigger == "short_press" {
            if let Some(start) = press_time {
                let duration = start.elapsed();
                let threshold = Duration::from_millis(settings.mouse_middle_button_long_press_ms as u64);
                if duration < threshold {
                    handle_middle_button_action();
                }
            }
        }
    }
}

fn handle_mouse_move(x: f64, y: f64) {
    crate::mouse::update_cursor_position(x, y);
}

fn handle_mouse_wheel(_delta_x: i64, delta_y: i64) -> bool {
    if crate::windows::quickpaste::is_visible() {
        if let Some(main_window) = MAIN_WINDOW.get() {
            if let Some(window) = main_window.app_handle().get_webview_window("quickpaste") {
                let direction = if delta_y > 0 { 
                    "up" 
                } else if delta_y < 0 { 
                    "down" 
                } else { 
                    return false 
                };
                crate::AppSounds::play_scroll();
                let _ = window.emit("quickpaste-scroll", serde_json::json!({ "direction": direction }));
                return true 
            }
        }
    }
    false 
}

fn handle_middle_button_action() {
    if let Some(window) = MAIN_WINDOW.get() {
        let settings = crate::get_settings();
        
        if !check_modifier_requirement(&settings.mouse_middle_button_modifier) {
            return;
        }
        crate::show_main_window(window);
    }
}

fn check_modifier_requirement(required: &str) -> bool {
    let (ctrl, alt, shift, meta) = get_modifier_keys_state();
    match required {
        "None" => true,
        "Ctrl" => ctrl,
        "Alt" => alt,
        "Shift" => shift,
        "Meta" => meta,
        _ => false,
    }
}

// 检查鼠标是否在窗口外部
fn is_mouse_outside_window(window: &WebviewWindow) -> bool {
    let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
    
    let (win_x, win_y, win_width, win_height) = match crate::get_window_bounds(window) {
        Ok(bounds) => bounds,
        Err(_) => return false,
    };
    
    cursor_x < win_x || cursor_x > win_x + win_width as i32
        || cursor_y < win_y || cursor_y > win_y + win_height as i32
}

// 处理点击窗口外部事件
fn handle_click_outside() {
    // 右键菜单
    if crate::is_context_menu_visible() {
        if let Some(main_window) = MAIN_WINDOW.get() {
            if let Some(menu_window) = main_window.app_handle().get_webview_window("context-menu") {
                let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
                if menu_window.is_visible().unwrap_or(false) && !crate::windows::plugins::context_menu::is_point_in_menu_region(cursor_x, cursor_y) {
                    let _ = menu_window.emit("close-context-menu", ());
                }
            }
        }
        return;
    }
    
    // 主窗口
    if let Some(window) = MAIN_WINDOW.get() {
        let state = crate::get_window_state();

        if state.is_hidden {
            return;
        }

        if state.is_pinned {
            return;
        }

        if window.is_visible().unwrap_or(false) && is_mouse_outside_window(window) {
            let _ = crate::check_snap(window);
            crate::hide_main_window(window);
        }
    }
}


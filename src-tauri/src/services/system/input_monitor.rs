use once_cell::sync::{OnceCell, Lazy};
use parking_lot::Mutex;
use rdev::{listen, Event, EventType, Key};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use tauri::{Emitter, WebviewWindow};

static MAIN_WINDOW: OnceCell<WebviewWindow> = OnceCell::new();
static MONITORING_ACTIVE: AtomicBool = AtomicBool::new(false);
static MONITORING_THREAD: Mutex<Option<thread::JoinHandle<()>>> = Mutex::new(None);

static NAVIGATION_KEYS_ENABLED: AtomicBool = AtomicBool::new(false);
static MOUSE_MONITORING_ENABLED: AtomicBool = AtomicBool::new(false);

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

// 节流延迟配置
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
        if let Err(error) = listen(move |event| {
            if !MONITORING_ACTIVE.load(Ordering::SeqCst) {
                return;
            }
            
            handle_input_event(event);
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

fn handle_input_event(event: Event) {
    match event.event_type {
        EventType::KeyPress(key) => handle_key_press(key),
        EventType::KeyRelease(key) => handle_key_release(key),
        EventType::ButtonPress(button) => handle_mouse_button_press(button),
        EventType::ButtonRelease(button) => handle_mouse_button_release(button),
        EventType::MouseMove { x, y } => handle_mouse_move(x, y),
        EventType::Wheel { delta_x, delta_y } => handle_mouse_wheel(delta_x, delta_y),
    }
}

fn handle_key_press(key: Key) {
    if let Some(mut state) = KEYBOARD_STATE.try_lock() {
        match key {
            Key::ControlLeft | Key::ControlRight => state.ctrl = true,
            Key::Alt | Key::AltGr => state.alt = true,
            Key::ShiftLeft | Key::ShiftRight => state.shift = true,
            Key::MetaLeft | Key::MetaRight => state.meta = true,
            _ => {}
        }
    }

    if NAVIGATION_KEYS_ENABLED.load(Ordering::SeqCst) {
        handle_navigation_key(key);
    }
}

fn handle_key_release(key: Key) {
    if let Some(mut state) = KEYBOARD_STATE.try_lock() {
        match key {
            Key::ControlLeft | Key::ControlRight => state.ctrl = false,
            Key::Alt | Key::AltGr => state.alt = false,
            Key::ShiftLeft | Key::ShiftRight => state.shift = false,
            Key::MetaLeft | Key::MetaRight => state.meta = false,
            _ => {}
        }
    }
}

fn handle_navigation_key(key: Key) {
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
                    return;
                }
                
                let _ = window.emit(
                    "navigation-action",
                    serde_json::json!({
                        "action": action
                    }),
                );
                return;
            }
        }
    }
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
    match key_str {
        "ArrowUp" | "Up" => matches!(key, Key::UpArrow),
        "ArrowDown" | "Down" => matches!(key, Key::DownArrow),
        "ArrowLeft" | "Left" => matches!(key, Key::LeftArrow),
        "ArrowRight" | "Right" => matches!(key, Key::RightArrow),
        "Enter" | "Return" => matches!(key, Key::Return),
        "Escape" | "Esc" => matches!(key, Key::Escape),
        "Tab" => matches!(key, Key::Tab),
        "Space" => matches!(key, Key::Space),
        "Backspace" => matches!(key, Key::Backspace),
        "Delete" => matches!(key, Key::Delete),
        "Home" => matches!(key, Key::Home),
        "End" => matches!(key, Key::End),
        "PageUp" => matches!(key, Key::PageUp),
        "PageDown" => matches!(key, Key::PageDown),
        "A" => matches!(key, Key::KeyA),
        "B" => matches!(key, Key::KeyB),
        "C" => matches!(key, Key::KeyC),
        "D" => matches!(key, Key::KeyD),
        "E" => matches!(key, Key::KeyE),
        "F" => matches!(key, Key::KeyF),
        "G" => matches!(key, Key::KeyG),
        "H" => matches!(key, Key::KeyH),
        "I" => matches!(key, Key::KeyI),
        "J" => matches!(key, Key::KeyJ),
        "K" => matches!(key, Key::KeyK),
        "L" => matches!(key, Key::KeyL),
        "M" => matches!(key, Key::KeyM),
        "N" => matches!(key, Key::KeyN),
        "O" => matches!(key, Key::KeyO),
        "P" => matches!(key, Key::KeyP),
        "Q" => matches!(key, Key::KeyQ),
        "R" => matches!(key, Key::KeyR),
        "S" => matches!(key, Key::KeyS),
        "T" => matches!(key, Key::KeyT),
        "U" => matches!(key, Key::KeyU),
        "V" => matches!(key, Key::KeyV),
        "W" => matches!(key, Key::KeyW),
        "X" => matches!(key, Key::KeyX),
        "Y" => matches!(key, Key::KeyY),
        "Z" => matches!(key, Key::KeyZ),
        "0" => matches!(key, Key::Num0),
        "1" => matches!(key, Key::Num1),
        "2" => matches!(key, Key::Num2),
        "3" => matches!(key, Key::Num3),
        "4" => matches!(key, Key::Num4),
        "5" => matches!(key, Key::Num5),
        "6" => matches!(key, Key::Num6),
        "7" => matches!(key, Key::Num7),
        "8" => matches!(key, Key::Num8),
        "9" => matches!(key, Key::Num9),
        "F1" => matches!(key, Key::F1),
        "F2" => matches!(key, Key::F2),
        "F3" => matches!(key, Key::F3),
        "F4" => matches!(key, Key::F4),
        "F5" => matches!(key, Key::F5),
        "F6" => matches!(key, Key::F6),
        "F7" => matches!(key, Key::F7),
        "F8" => matches!(key, Key::F8),
        "F9" => matches!(key, Key::F9),
        "F10" => matches!(key, Key::F10),
        "F11" => matches!(key, Key::F11),
        "F12" => matches!(key, Key::F12),
        _ => false,
    }
}

fn handle_mouse_button_press(button: rdev::Button) {
    let settings = crate::get_settings();
    
    if button == rdev::Button::Middle && settings.mouse_middle_button_enabled {
        handle_middle_button_press();
        return;
    }
    
    if !MOUSE_MONITORING_ENABLED.load(Ordering::Relaxed) {
        return;
    }

    if matches!(button, rdev::Button::Left | rdev::Button::Right) {
        handle_click_outside();
    }
}

fn handle_mouse_button_release(_button: rdev::Button) {
}

fn handle_mouse_move(x: f64, y: f64) {
    crate::mouse::update_cursor_position(x, y);
}

fn handle_mouse_wheel(_delta_x: i64, _delta_y: i64) {
}

fn handle_middle_button_press() {
    if let Some(window) = MAIN_WINDOW.get() {
        let settings = crate::get_settings();
        
        // 检查修饰键要求
        let modifier_match = match settings.mouse_middle_button_modifier.as_str() {
            "None" => true,
            "Ctrl" => {
                let (ctrl, _, _, _) = get_modifier_keys_state();
                ctrl
            }
            "Alt" => {
                let (_, alt, _, _) = get_modifier_keys_state();
                alt
            }
            "Shift" => {
                let (_, _, shift, _) = get_modifier_keys_state();
                shift
            }
            "Meta" => {
                let (_, _, _, meta) = get_modifier_keys_state();
                meta
            }
            _ => false,
        };
        
        if !modifier_match {
            return;
        }
        
        // 中键点击切换窗口显示
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            crate::hide_main_window(window);
        } else {
            crate::show_main_window(window);
        }
    }
}

fn handle_click_outside() {
    if let Some(window) = MAIN_WINDOW.get() {
        // 只有在窗口可见时才处理点击外部
        let is_visible = window.is_visible().unwrap_or(false);
        if !is_visible {
            return;
        }
        
        // 获取鼠标位置
        let (cursor_x, cursor_y) = match crate::mouse::get_cursor_position() {
            Ok(pos) => pos,
            Err(_) => return,
        };
        
        // 获取窗口边界
        let (win_x, win_y, win_width, win_height) = match crate::get_window_bounds(window) {
            Ok(bounds) => bounds,
            Err(_) => return,
        };
        
        // 检查鼠标是否在窗口外
        let mouse_outside_window = cursor_x < win_x
            || cursor_x > win_x + win_width as i32
            || cursor_y < win_y
            || cursor_y > win_y + win_height as i32;
        
        if mouse_outside_window {
            // 如果窗口已经吸附到边缘，则恢复位置后隐藏
            if crate::is_window_snapped() {
                let _ = crate::restore_from_snap(window);
            }
            crate::hide_main_window(window);
        }
    }
}


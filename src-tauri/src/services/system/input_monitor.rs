use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use rdev::{listen, Event, EventType, Key};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
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
        let action = match key {
            Key::UpArrow => Some("navigate-up"),
            Key::DownArrow => Some("navigate-down"),
            Key::LeftArrow => Some("tab-left"),
            Key::RightArrow => Some("tab-right"),
            Key::Tab => Some("focus-search"),
            Key::Escape => Some("hide-window"),
            Key::Return => Some("execute-item"),
            _ => None,
        };

        if let Some(action) = action {
            let _ = window.emit(
                "navigation-action",
                serde_json::json!({
                    "action": action
                }),
            );
        }
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


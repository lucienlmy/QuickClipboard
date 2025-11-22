use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::WebviewWindow;

#[derive(Debug, Clone, Copy)]
struct SelectionRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy)]
struct ScaleFactor(f64);

static LONG_SCREENSHOT_ACTIVE: AtomicBool = AtomicBool::new(false);
static SCREENSHOT_SELECTION: Lazy<Mutex<Option<SelectionRect>>> = Lazy::new(|| Mutex::new(None));
static SCREENSHOT_WINDOW: Lazy<Mutex<Option<WebviewWindow>>> = Lazy::new(|| Mutex::new(None));
static SCALE_FACTOR: Lazy<Mutex<ScaleFactor>> = Lazy::new(|| Mutex::new(ScaleFactor(1.0)));

// 启用长截屏模式的鼠标穿透控制
pub fn enable_passthrough(window: WebviewWindow, x: f64, y: f64, width: f64, height: f64) {
    // 获取窗口的缩放因子
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    *SCALE_FACTOR.lock() = ScaleFactor(scale_factor);
    
    // 将前端传递的逻辑像素转换为物理像素
    let physical_x = x * scale_factor;
    let physical_y = y * scale_factor;
    let physical_width = width * scale_factor;
    let physical_height = height * scale_factor;
    
    *SCREENSHOT_WINDOW.lock() = Some(window.clone());
    *SCREENSHOT_SELECTION.lock() = Some(SelectionRect { 
        x: physical_x, 
        y: physical_y, 
        width: physical_width, 
        height: physical_height 
    });
    LONG_SCREENSHOT_ACTIVE.store(true, Ordering::Relaxed);
    
    // 启动监听线程
    thread::spawn(move || {
        monitor_mouse_position();
    });
}

// 禁用长截屏模式的鼠标穿透控制
pub fn disable_passthrough() {
    LONG_SCREENSHOT_ACTIVE.store(false, Ordering::Relaxed);
    *SCREENSHOT_SELECTION.lock() = None;
    
    // 禁用穿透
    if let Some(window) = SCREENSHOT_WINDOW.lock().as_ref() {
        let _ = window.set_ignore_cursor_events(false);
    }
    
    *SCREENSHOT_WINDOW.lock() = None;
}

// 监听鼠标位置并动态控制穿透
fn monitor_mouse_position() {
    while LONG_SCREENSHOT_ACTIVE.load(Ordering::Relaxed) {
        if let Some(selection) = *SCREENSHOT_SELECTION.lock() {
            if let Some(window) = SCREENSHOT_WINDOW.lock().as_ref() {
                let (x, y) = crate::mouse::get_cursor_position();
                
                // 判断鼠标是否在选区内
                let is_in_selection = 
                    x as f64 >= selection.x &&
                    x as f64 <= selection.x + selection.width &&
                    y as f64 >= selection.y &&
                    y as f64 <= selection.y + selection.height;
                
                let _ = window.set_ignore_cursor_events(is_in_selection);
            }
        }
        
        thread::sleep(Duration::from_millis(16));
    }
}

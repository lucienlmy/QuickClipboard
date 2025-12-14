use tauri::{AppHandle,Manager,WebviewUrl,WebviewWindow,WebviewWindowBuilder,Emitter,Position,PhysicalPosition,};
use crate::utils::image_http_server::{PinEditData, set_pin_edit_data, clear_pin_edit_data, get_pin_edit_data};
use serde_json::json;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Copy)]
struct PhysicalRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

static PIN_EDIT_PASSTHROUGH_ACTIVE: AtomicBool = AtomicBool::new(false);
static PIN_EDIT_WINDOW: Lazy<Mutex<Option<WebviewWindow>>> = Lazy::new(|| Mutex::new(None));
static PIN_EDIT_RECTS: Lazy<Mutex<Vec<PhysicalRect>>> = Lazy::new(|| Mutex::new(Vec::new()));

fn create_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let is_dev = cfg!(debug_assertions);
    WebviewWindowBuilder::new(
        app,
        "screenshot",
        WebviewUrl::App("windows/screenshot/index.html".into()),
    )
        .title("截屏窗口")
        .inner_size(1920.0, 1080.0)
        .position(0.0, 0.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(!is_dev)
        .skip_taskbar(true)
        .visible(false)
        .resizable(false)
        .focused(false)
        .focusable(true)
        .maximizable(false)
        .minimizable(false)
        .drag_and_drop(false)
        .build()
        .map_err(|e| format!("创建截屏窗口失败: {}", e))
}

fn get_or_create_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("screenshot")
        .map(Ok)
        .unwrap_or_else(|| create_window(app))
}

fn resize_window_to_virtual_screen(window: &WebviewWindow) {
    let (x, y, width, height) =
        crate::screen::ScreenUtils::get_virtual_screen_size().unwrap_or((0, 0, 1920, 1080));

    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(width as u32, height as u32)));
    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
}

pub fn start_screenshot(app: &AppHandle) -> Result<(), String> {
    let settings = crate::get_settings();
    if !settings.screenshot_enabled {
        return Ok(());
    }
    let window = get_or_create_window(app)?;

    if window.is_visible().unwrap_or(false) {
        let _ = window.set_focus();
        return Ok(());
    }

    crate::services::screenshot::capture_and_store_last(app)?;
    let _ = window.emit("screenshot:new-session", ());
    resize_window_to_virtual_screen(&window);
    let _ = window.show();
    let _ = window.set_focus();

    if let Err(e) = crate::windows::screenshot_window::auto_selection::start_auto_selection(app.clone()) {
        eprintln!("无法启动自动选区: {}", e);
    }
    Ok(())
}

// 启动贴图编辑模式
#[allow(clippy::too_many_arguments)]
pub fn start_pin_edit_mode(
    app: &AppHandle,
    image_path: String,
    x: i32, y: i32,
    width: u32, height: u32,
    logical_width: u32, logical_height: u32,
    scale_factor: f64,
    window_label: String,
    window_x: i32, window_y: i32,
    window_width: f64, window_height: f64,
) -> Result<(), String> {
    let window = get_or_create_window(app)?;
    let edit_data = PinEditData {
        image_path,
        x, y,
        width, height,
        logical_width, logical_height,
        scale_factor,
        window_label,
        window_x, window_y,
        window_width, window_height,
    };
    set_pin_edit_data(edit_data)?;

    let _ = window.emit("screenshot:pin-edit-mode", ());
    resize_window_to_virtual_screen(&window);
    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

// 获取贴图编辑数据的命令
#[tauri::command]
pub fn get_pin_edit_mode_data() -> Result<Option<PinEditData>, String> {
    Ok(get_pin_edit_data())
}

// 清除贴图编辑数据
#[tauri::command]
pub fn clear_pin_edit_mode() {
    disable_pin_edit_passthrough();
    clear_pin_edit_data();
}

// 更新贴图图片并恢复显示
#[tauri::command]
pub fn confirm_pin_edit(app: AppHandle, new_file_path: String) -> Result<(), String> {
    if let Some(data) = get_pin_edit_data() {
        let old_file_path = data.image_path.clone();
        if old_file_path != new_file_path {
            let _ = std::fs::remove_file(&old_file_path);
        }
        
        if let Some(window) = app.get_webview_window(&data.window_label) {
            crate::windows::pin_image_window::update_pin_image_file(&data.window_label, new_file_path.clone());
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(data.window_width, data.window_height)));
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(data.window_x, data.window_y)));
            let _ = app.emit_to(&data.window_label, "pin-image:refresh", json!({ "file_path": new_file_path }));
            let _ = window.show();
        }
    }
    Ok(())
}

// 恢复显示原贴图窗口
#[tauri::command]
pub fn cancel_pin_edit(app: AppHandle) -> Result<(), String> {
    if let Some(data) = get_pin_edit_data() {
        if let Some(window) = app.get_webview_window(&data.window_label) {
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(data.window_width, data.window_height)));
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(data.window_x, data.window_y)));
            let _ = window.show();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn enable_pin_edit_passthrough(
    app: AppHandle,
    rects: Vec<[f64; 4]>, 
) -> Result<(), String> {
    let window = app.get_webview_window("screenshot")
        .ok_or("未找到截屏窗口")?;
    
    *PIN_EDIT_WINDOW.lock() = Some(window);
    *PIN_EDIT_RECTS.lock() = rects.iter()
        .map(|r| PhysicalRect { x: r[0], y: r[1], width: r[2], height: r[3] })
        .collect();
    
    if !PIN_EDIT_PASSTHROUGH_ACTIVE.load(Ordering::Relaxed) {
        PIN_EDIT_PASSTHROUGH_ACTIVE.store(true, Ordering::Relaxed);
        thread::spawn(|| pin_edit_passthrough_loop());
    }
    
    Ok(())
}

#[tauri::command]
pub fn disable_pin_edit_passthrough() {
    PIN_EDIT_PASSTHROUGH_ACTIVE.store(false, Ordering::Relaxed);
    
    if let Some(window) = PIN_EDIT_WINDOW.lock().as_ref() {
        let _ = window.set_ignore_cursor_events(false);
    }
    
    *PIN_EDIT_WINDOW.lock() = None;
    *PIN_EDIT_RECTS.lock() = Vec::new();
}

#[tauri::command]
pub fn update_pin_edit_passthrough_rects(rects: Vec<[f64; 4]>) {
    *PIN_EDIT_RECTS.lock() = rects.iter()
        .map(|r| PhysicalRect { x: r[0], y: r[1], width: r[2], height: r[3] })
        .collect();
}

fn pin_edit_passthrough_loop() {
    while PIN_EDIT_PASSTHROUGH_ACTIVE.load(Ordering::Relaxed) {
        if let Some(window) = PIN_EDIT_WINDOW.lock().as_ref() {
            let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
            let x = cursor_x as f64;
            let y = cursor_y as f64;

            let is_in_rect = PIN_EDIT_RECTS.lock().iter().any(|rect| {
                x >= rect.x && x <= rect.x + rect.width &&
                y >= rect.y && y <= rect.y + rect.height
            });

            let _ = window.set_ignore_cursor_events(!is_in_rect);
        }
        
        thread::sleep(Duration::from_millis(16));
    }
}

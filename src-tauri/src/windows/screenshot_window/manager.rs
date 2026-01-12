use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Emitter, Position, PhysicalPosition};
use crate::utils::image_http_server::{PinEditData, set_pin_edit_data, clear_pin_edit_data, get_pin_edit_data};
use serde_json::json;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::thread;
use std::time::Duration;
use tokio::sync::Notify;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY};

// 截屏模式
// 0: 普通模式
// 1: 快速保存模式（选区完成后直接复制到剪贴板）
// 2: 快速贴图模式（选区完成后直接贴图）
// 3: 快速OCR模式（选区完成后直接OCR识别并复制）
static SCREENSHOT_MODE: AtomicU8 = AtomicU8::new(0);
static INIT_GATE_SESSION: Lazy<std::sync::atomic::AtomicU64> = Lazy::new(|| std::sync::atomic::AtomicU64::new(0));
static INIT_GATE_NOTIFY: Lazy<Notify> = Lazy::new(Notify::new);

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

// 设置窗口是否从屏幕捕获中排除
#[cfg(target_os = "windows")]
fn set_window_exclude_from_capture(window: &WebviewWindow, exclude: bool) {
    if let Ok(hwnd) = window.hwnd() {
        let affinity = WINDOW_DISPLAY_AFFINITY(if exclude { 0x11 } else { 0x00 });
        unsafe { let _ = SetWindowDisplayAffinity(HWND(hwnd.0), affinity); }
    }
}

#[cfg(not(target_os = "windows"))]
fn set_window_exclude_from_capture(_window: &WebviewWindow, _exclude: bool) {}

fn start_screenshot_with_mode(app: &AppHandle, mode: u8) -> Result<(), String> {
    let settings = crate::get_settings();
    if !settings.screenshot_enabled {
        return Ok(());
    }

    let cursor_pos = crate::mouse::get_cursor_position();
    let detection_mode = settings.screenshot_element_detection.clone();
    
    let window = get_or_create_window(app)?;

    if window.is_visible().unwrap_or(false) {
        let _ = window.set_focus();
        return Ok(());
    }
    SCREENSHOT_MODE.store(mode, Ordering::SeqCst);

    set_window_exclude_from_capture(&window, true);
    resize_window_to_virtual_screen(&window);
    let is_dev = cfg!(debug_assertions);
    let _ = window.set_always_on_top(!is_dev);
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.show();
    let _ = window.set_focus();

    INIT_GATE_SESSION.fetch_add(1, Ordering::SeqCst);
    INIT_GATE_NOTIFY.notify_waiters();

    if detection_mode != "none" {
        let window_clone = window.clone();
        let mode_clone = detection_mode.clone();
        thread::spawn(move || {
            let result = crate::windows::screenshot_window::auto_selection::capture_initial_element(
                cursor_pos.0, 
                cursor_pos.1,
                mode_clone,
            );
            let _ = window_clone.set_ignore_cursor_events(false);
            if let Some(rects) = result {
                if !rects.is_empty() {
                    crate::windows::screenshot_window::auto_selection::emit_initial_hierarchy(&window_clone, &rects);
                }
            }
        });
    } else {
        let _ = window.set_ignore_cursor_events(false);
    }

    let app_for_auto = app.clone();
    thread::spawn(move || {
        if let Err(e) = crate::windows::screenshot_window::auto_selection::start_auto_selection(app_for_auto) {
            eprintln!("无法启动自动选区: {}", e);
        }
    });

    let app_clone = app.clone();
    thread::spawn(move || {
        let capture_result = crate::services::screenshot::capture_and_store_last(&app_clone);
        
        let app_for_main = app_clone.clone();
        let _ = app_clone.run_on_main_thread(move || {
            if let Some(window) = app_for_main.get_webview_window("screenshot") {
                set_window_exclude_from_capture(&window, false);
                
                if let Err(ref e) = capture_result {
                    eprintln!("截屏失败: {}", e);
                }
            }
        });
    });

    Ok(())
}

pub fn start_screenshot(app: &AppHandle) -> Result<(), String> {
    start_screenshot_with_mode(app, 0)
}

pub fn start_screenshot_quick_save(app: &AppHandle) -> Result<(), String> {
    start_screenshot_with_mode(app, 1)
}

pub fn start_screenshot_quick_pin(app: &AppHandle) -> Result<(), String> {
    start_screenshot_with_mode(app, 2)
}

pub fn start_screenshot_quick_ocr(app: &AppHandle) -> Result<(), String> {
    start_screenshot_with_mode(app, 3)
}

// 获取当前截屏模式
#[tauri::command]
pub fn get_screenshot_mode() -> u8 {
    SCREENSHOT_MODE.load(Ordering::SeqCst)
}

#[tauri::command]
pub async fn wait_for_screenshot_init(last_session: u64) -> (u64, u8) {
    let current = INIT_GATE_SESSION.load(Ordering::SeqCst);
    if current == last_session {
        INIT_GATE_NOTIFY.notified().await;
    }
    let new_session = INIT_GATE_SESSION.load(Ordering::SeqCst);
    let mode = SCREENSHOT_MODE.load(Ordering::SeqCst);
    (new_session, mode)
}

// 重置截屏模式
#[tauri::command]
pub fn reset_screenshot_mode() {
    SCREENSHOT_MODE.store(0, Ordering::SeqCst);
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
    original_image_path: Option<String>,
    edit_data_json: Option<String>,
) -> Result<(), String> {
    SCREENSHOT_MODE.store(0, Ordering::SeqCst);
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
        original_image_path,
        edit_data: edit_data_json,
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
pub fn confirm_pin_edit(
    app: AppHandle,
    new_file_path: String,
    edit_data_json: Option<String>,
) -> Result<(), String> {
    if let Some(data) = get_pin_edit_data() {
        let old_file_path = data.image_path.clone();
        let is_old_same_as_original = data.original_image_path.as_ref() == Some(&old_file_path);
        if old_file_path != new_file_path && !is_old_same_as_original {
            let _ = std::fs::remove_file(&old_file_path);
        }

        let original_image_path = data.original_image_path.clone();

        if let Some(window) = app.get_webview_window(&data.window_label) {
            crate::windows::pin_image_window::update_pin_image_data(
                &data.window_label,
                new_file_path.clone(),
                original_image_path,
                edit_data_json,
            );
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                data.window_width,
                data.window_height,
            )));
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                data.window_x,
                data.window_y,
            )));
            let _ = app.emit_to(
                &data.window_label,
                "pin-image:refresh",
                json!({ "file_path": new_file_path }),
            );
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

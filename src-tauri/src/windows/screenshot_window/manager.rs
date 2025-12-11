use tauri::{AppHandle,Manager,WebviewUrl,WebviewWindow,WebviewWindowBuilder,Emitter,Size,LogicalSize,Position,PhysicalPosition,};
use crate::utils::image_http_server::{PinEditData, set_pin_edit_data, clear_pin_edit_data, get_pin_edit_data};

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

    let _ = window.set_size(Size::Logical(LogicalSize::new(width as f64, height as f64)));
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
    let _ = window.show();
    resize_window_to_virtual_screen(&window);
    let _ = window.set_focus();

    if let Err(e) = crate::windows::screenshot_window::auto_selection::start_auto_selection(app.clone()) {
        eprintln!("无法启动自动选区: {}", e);
    }
    Ok(())
}

// 启动贴图编辑模式
pub fn start_pin_edit_mode(app: &AppHandle, image_path: String, x: i32, y: i32, width: u32, height: u32, scale_factor: f64) -> Result<(), String> {
    let window = get_or_create_window(app)?;
    let edit_data = PinEditData {
        image_path,
        x,
        y,
        width,
        height,
        scale_factor,
    };
    set_pin_edit_data(edit_data)?;

    let _ = window.emit("screenshot:pin-edit-mode", ());
    let _ = window.show();
    resize_window_to_virtual_screen(&window);
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
    clear_pin_edit_data();
}

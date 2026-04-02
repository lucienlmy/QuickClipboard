use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Url, WebviewUrl, WebviewWindowBuilder};

const CHAT_DROP_PROXY_LABEL: &str = "chat_drop_proxy";
const CHAT_DROP_PATHS_EVENT: &str = "chat-drop-proxy-paths";
const CHAT_DROP_LEAVE_EVENT: &str = "chat-drop-proxy-leave";

#[derive(Clone, Copy)]
pub struct ChatDropProxyBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Serialize)]
struct ChatDropPathsPayload {
    paths: Vec<String>,
}

fn create_chat_drop_proxy(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(
        app,
        CHAT_DROP_PROXY_LABEL,
        WebviewUrl::External(Url::parse("about:blank").map_err(|e| e.to_string())?),
    )
    .title("聊天拖拽接收")
    .inner_size(320.0, 180.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .resizable(false)
    .focusable(false)
    .maximizable(false)
    .minimizable(false)
    .drag_and_drop(true)
    .build()
    .map_err(|e| e.to_string())?;

    bind_native_drop_events(&window, app.clone());

    Ok(window)
}

fn bind_native_drop_events(window: &tauri::WebviewWindow, app: AppHandle) {
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::DragDrop(drag_event) = event {
            match drag_event {
                tauri::DragDropEvent::Drop { paths, .. } => {
                    let payload_paths = paths
                        .iter()
                        .map(|path| path.to_string_lossy().to_string())
                        .filter(|path| !path.is_empty())
                        .collect::<Vec<_>>();

                    if payload_paths.is_empty() {
                        return;
                    }

                    let payload = ChatDropPathsPayload { paths: payload_paths };
                    if let Some(main_window) = app.get_webview_window("main") {
                        let _ = main_window.emit(CHAT_DROP_PATHS_EVENT, payload);
                    } else {
                        let _ = app.emit(CHAT_DROP_PATHS_EVENT, payload);
                    }

                    let _ = hide_chat_drop_proxy(&app);
                }
                tauri::DragDropEvent::Leave => {
                    if let Some(main_window) = app.get_webview_window("main") {
                        let _ = main_window.emit(CHAT_DROP_LEAVE_EVENT, ());
                    } else {
                        let _ = app.emit(CHAT_DROP_LEAVE_EVENT, ());
                    }
                    let _ = hide_chat_drop_proxy(&app);
                }
                _ => {}
            }
        }
    });
}

fn get_or_create(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(CHAT_DROP_PROXY_LABEL)
        .map(Ok)
        .unwrap_or_else(|| create_chat_drop_proxy(app))
}

pub fn ensure_chat_drop_proxy(app: &AppHandle) -> Result<(), String> {
    let _ = get_or_create(app)?;
    Ok(())
}

pub fn show_chat_drop_proxy(app: &AppHandle, bounds: ChatDropProxyBounds) -> Result<(), String> {
    let window = get_or_create(app)?;
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "未找到主窗口".to_string())?;

    let scale_factor = main_window.scale_factor().map_err(|e| e.to_string())?;
    let inner_position = main_window.inner_position().map_err(|e| e.to_string())?;

    let x = inner_position.x + (bounds.x * scale_factor).round() as i32;
    let y = inner_position.y + (bounds.y * scale_factor).round() as i32;
    let width = (bounds.width * scale_factor).round().max(1.0) as u32;
    let height = (bounds.height * scale_factor).round().max(1.0) as u32;

    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.set_size(PhysicalSize::new(width, height));
    let _ = window.show();
    Ok(())
}

pub fn hide_chat_drop_proxy(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CHAT_DROP_PROXY_LABEL) {
        let _ = window.hide();
    }
    Ok(())
}

pub fn dispose_chat_drop_proxy(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(CHAT_DROP_PROXY_LABEL) {
        let _ = window.close();
    }
    Ok(())
}

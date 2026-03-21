use once_cell::sync::Lazy;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

const PREVIEW_WINDOW_LABEL: &str = "preview-window";

static PREVIEW_REQUEST_VERSION: AtomicU64 = AtomicU64::new(0);
static PREVIEW_DATA: Lazy<Mutex<Option<PreviewWindowData>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone, Debug, Serialize)]
pub struct PreviewWindowData {
    pub mode: String,
    pub source: String,
    pub item_id: String,
    pub cursor_x: i32,
    pub cursor_y: i32,
    pub scale_factor: f64,
    pub work_area_x: i32,
    pub work_area_y: i32,
    pub work_area_width: u32,
    pub work_area_height: u32,
    pub request_id: u64,
}

fn close_preview_window_internal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        let _ = window.hide();
        let _ = window.close();
    }
    if let Ok(mut guard) = PREVIEW_DATA.lock() {
        *guard = None;
    }
}

fn create_preview_window(
    app: &AppHandle,
    work_area_x: i32,
    work_area_y: i32,
    work_area_width: u32,
    work_area_height: u32,
    scale_factor: f64,
) -> Result<WebviewWindow, String> {
    let logical_scale = if scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    let logical_x = work_area_x as f64 / logical_scale;
    let logical_y = work_area_y as f64 / logical_scale;
    let logical_width = (work_area_width as f64 / logical_scale).max(1.0);
    let logical_height = (work_area_height as f64 / logical_scale).max(1.0);

    let window = WebviewWindowBuilder::new(
        app,
        PREVIEW_WINDOW_LABEL,
        WebviewUrl::App("windows/preview/index.html".into()),
    )
    .title("预览窗口")
    .inner_size(logical_width, logical_height)
    .position(logical_x, logical_y)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .focusable(false)
    .visible(false)
    .build()
    .map_err(|e| format!("创建预览窗口失败: {}", e))?;

    window
        .set_position(PhysicalPosition::new(work_area_x, work_area_y))
        .map_err(|e| format!("设置预览窗口位置失败: {}", e))?;
    window
        .set_size(PhysicalSize::new(work_area_width, work_area_height))
        .map_err(|e| format!("设置预览窗口大小失败: {}", e))?;
    window
        .set_ignore_cursor_events(true)
        .map_err(|e| format!("设置预览窗口忽略鼠标事件失败: {}", e))?;

    Ok(window)
}

#[tauri::command]
pub async fn show_preview_window(
    app: AppHandle,
    mode: String,
    source: String,
    item_id: String,
) -> Result<(), String> {
    if let Ok(guard) = PREVIEW_DATA.lock() {
        if let Some(current) = guard.as_ref() {
            let same_request =
                current.mode == mode && current.source == source && current.item_id == item_id;
            if same_request && app.get_webview_window(PREVIEW_WINDOW_LABEL).is_some() {
                return Ok(());
            }
        }
    }

    let request_id = PREVIEW_REQUEST_VERSION.fetch_add(1, Ordering::SeqCst) + 1;
    close_preview_window_internal(&app);

    let monitor = crate::utils::screen::ScreenUtils::get_monitor_at_cursor(&app)?;
    let work_area = monitor.work_area();
    let scale_factor = monitor.scale_factor();
    let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
    let work_area_x = work_area.position.x;
    let work_area_y = work_area.position.y;
    let work_area_width = work_area.size.width;
    let work_area_height = work_area.size.height;

    if let Ok(mut guard) = PREVIEW_DATA.lock() {
        *guard = Some(PreviewWindowData {
            mode,
            source,
            item_id,
            cursor_x,
            cursor_y,
            scale_factor,
            work_area_x,
            work_area_y,
            work_area_width,
            work_area_height,
            request_id,
        });
    }

    let app_for_create = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut last_error = None;
        for _ in 0..8 {
            if PREVIEW_REQUEST_VERSION.load(Ordering::SeqCst) != request_id {
                return;
            }

            if let Some(existing) = app_for_create.get_webview_window(PREVIEW_WINDOW_LABEL) {
                let _ = existing.hide();
                let _ = existing.close();
                tokio::time::sleep(Duration::from_millis(12)).await;
            }

            let window = match create_preview_window(
                &app_for_create,
                work_area_x,
                work_area_y,
                work_area_width,
                work_area_height,
                scale_factor,
            ) {
                Ok(window) => window,
                Err(error) => {
                    if error.contains("already exists") {
                        last_error = Some(error);
                        tokio::time::sleep(Duration::from_millis(20)).await;
                        continue;
                    }

                    eprintln!("创建预览窗口失败: {}", error);
                    return;
                }
            };

            if PREVIEW_REQUEST_VERSION.load(Ordering::SeqCst) != request_id {
                let _ = window.close();
                return;
            }

            if let Err(error) = window.show() {
                eprintln!("显示预览窗口失败: {}", error);
            }
            return;
        }

        if let Some(error) = last_error {
            eprintln!("创建预览窗口失败: {}", error);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn close_preview_window(app: AppHandle) -> Result<(), String> {
    PREVIEW_REQUEST_VERSION.fetch_add(1, Ordering::SeqCst);
    close_preview_window_internal(&app);
    Ok(())
}

#[tauri::command]
pub fn get_preview_window_data() -> Result<PreviewWindowData, String> {
    PREVIEW_DATA
        .lock()
        .map_err(|_| "获取预览窗口数据失败".to_string())?
        .clone()
        .ok_or_else(|| "预览窗口数据不存在".to_string())
}

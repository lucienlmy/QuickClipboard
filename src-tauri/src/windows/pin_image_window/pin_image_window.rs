use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::collections::HashMap;
use once_cell::sync::OnceCell;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder, Size, LogicalSize, PhysicalPosition, PhysicalSize};

static PIN_IMAGE_COUNTER: AtomicUsize = AtomicUsize::new(0);
static PIN_IMAGE_DATA_MAP: OnceCell<Mutex<HashMap<String, PinImageData>>> = OnceCell::new();

// 预览窗口最大边默认值
const DEFAULT_PREVIEW_SIZE: u32 = 600;

#[derive(Clone, Debug)]
struct PinImageData {
    file_path: String,
    width: u32,
    height: u32,
    preview_mode: bool,
}

pub fn init_pin_image_window() {
    PIN_IMAGE_COUNTER.store(0, Ordering::SeqCst);
    PIN_IMAGE_DATA_MAP.get_or_init(|| Mutex::new(HashMap::new()));
}


// 从文件路径创建贴图窗口
#[tauri::command]
pub async fn pin_image_from_file(
    app: AppHandle,
    file_path: String,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
    preview_mode: Option<bool>,
) -> Result<(), String> {
    let is_preview = preview_mode.unwrap_or(false);
    
    // 读取图片尺寸
    let (orig_width, orig_height) = if let (Some(w), Some(h)) = (width, height) {
        (w, h)
    } else {
        let reader = image::io::Reader::open(&file_path)
            .map_err(|e| format!("打开图片文件失败: {}", e))?
            .with_guessed_format()
            .map_err(|e| format!("识别图片格式失败: {}", e))?;
        
        let (w, h) = reader.into_dimensions()
            .map_err(|e| format!("读取图片尺寸失败: {}", e))?;
        
        let scale_factor = crate::utils::screen::ScreenUtils::get_monitor_at_cursor(&app)
            .map(|m| m.scale_factor())
            .unwrap_or(1.0);
        
        let logical_width = (w as f64 / scale_factor) as u32;
        let logical_height = (h as f64 / scale_factor) as u32;
        
        (logical_width, logical_height)
    };
    
    // 预览模式：按比例缩放，最长边为屏幕高度的一半
    let (img_width, img_height) = if is_preview {
        let preview_size = crate::utils::screen::ScreenUtils::get_monitor_at_cursor(&app)
            .map(|m| {
                let size = m.size();
                let scale_factor = m.scale_factor();
                let half_height = (size.height as f64 / scale_factor / 2.0) as u32;
                half_height.min(DEFAULT_PREVIEW_SIZE)
            })
            .unwrap_or(DEFAULT_PREVIEW_SIZE);
        
        let max_side = orig_width.max(orig_height);
        if max_side == 0 {
            (preview_size, preview_size)
        } else {
            let scale = preview_size as f64 / max_side as f64;
            let new_w = (orig_width as f64 * scale).round() as u32;
            let new_h = (orig_height as f64 * scale).round() as u32;
            (new_w.max(1), new_h.max(1))
        }
    } else {
        (orig_width, orig_height)
    };
    
    let window_label = if is_preview {
        "image-preview".to_string()
    } else {
        let counter = PIN_IMAGE_COUNTER.fetch_add(1, Ordering::SeqCst);
        format!("pin-image-{}", counter)
    };
    
    if is_preview {
        if let Some(existing) = app.get_webview_window(&window_label) {
            let _ = existing.close();
            if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
                data_map.lock().unwrap().remove(&window_label);
            }
        }
    }
    
    // 存储图片数据
    if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let mut map = data_map.lock().unwrap();
        map.insert(
            window_label.clone(),
            PinImageData {
                file_path,
                width: img_width,
                height: img_height,
                preview_mode: is_preview,
            },
        );
    }
    
    let (pos_x, pos_y) = if is_preview {
        let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
        let (mon_x, mon_y, mon_right, mon_bottom, scale_factor) = crate::utils::screen::ScreenUtils::get_monitor_at_cursor(&app)
            .map(|m| {
                let pos = m.position();
                let size = m.size();
                (pos.x, pos.y, pos.x + size.width as i32, pos.y + size.height as i32, m.scale_factor())
            })
            .unwrap_or((0, 0, 1920, 1080, 1.0));
        
        let window_w = ((img_width as f64 + 10.0) * scale_factor).round() as i32;
        let window_h = ((img_height as f64 + 10.0) * scale_factor).round() as i32;
        
        let pos_x = if mon_right - cursor_x >= window_w { cursor_x } else { cursor_x - window_w };
        let pos_y = if mon_bottom - cursor_y >= window_h { cursor_y } else { cursor_y - window_h };
        
        (pos_x.max(mon_x), pos_y.max(mon_y))
    } else if let (Some(px), Some(py)) = (x, y) {
        (px, py)
    } else {
        if let Ok(monitor) = crate::utils::screen::ScreenUtils::get_monitor_at_cursor(&app) {
            let screen_pos = monitor.position();
            let screen_size = monitor.size();
            let scale_factor = monitor.scale_factor();
            
            let window_physical_width = ((img_width as f64 + 10.0) * scale_factor).round() as i32;
            let window_physical_height = ((img_height as f64 + 10.0) * scale_factor).round() as i32;
            
            let center_x = screen_pos.x + (screen_size.width as i32 - window_physical_width) / 2;
            let center_y = screen_pos.y + (screen_size.height as i32 - window_physical_height) / 2;
            
            (center_x.max(screen_pos.x), center_y.max(screen_pos.y))
        } else {
            (100, 100)
        }
    };
    
    let from_screenshot = x.is_some() && y.is_some();
    let window = create_pin_image_window(app, &window_label, img_width, img_height, pos_x, pos_y, is_preview, from_screenshot).await?;
    
    // 预览模式：鼠标穿透
    if is_preview {
        window.set_ignore_cursor_events(true)
            .map_err(|e| format!("设置鼠标穿透失败: {}", e))?;
    }
    
    window.show().map_err(|e| format!("显示贴图窗口失败: {}", e))?;
    
    Ok(())
}

// 保存图片到应用数据目录
fn save_pin_image_to_temp(image_data: &[u8], _counter: usize) -> Result<String, String> {
    Err("未找到图片数据".to_string())
}

// 创建贴图窗口
async fn create_pin_image_window(
    app: AppHandle,
    label: &str,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    preview_mode: bool,
    from_screenshot: bool,
) -> Result<WebviewWindow, String> {
    const SHADOW_PADDING: f64 = 10.0;

    let window_width = width as f64 + SHADOW_PADDING;
    let window_height = height as f64 + SHADOW_PADDING;

    let (physical_x, physical_y) = if preview_mode {
        (x, y)
    } else if from_screenshot {
        let scale_factor = app.available_monitors()
            .ok()
            .and_then(|monitors| {
                monitors.into_iter().find(|m| {
                    let pos = m.position();
                    let size = m.size();
                    x >= pos.x && x < pos.x + size.width as i32 &&
                    y >= pos.y && y < pos.y + size.height as i32
                })
            })
            .map(|m| m.scale_factor())
            .unwrap_or(1.0);
        
        let padding_physical = (5.0 * scale_factor).round() as i32;
        let lx = (x - padding_physical).max(0);
        let ly = (y - padding_physical).max(0);
        (lx, ly)
    } else {
        (x, y)
    };

    let window = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("windows/pinImage/pinImage.html".into()),
    )
    .title("贴图")
    .inner_size(window_width, window_height)
    .min_inner_size(1.0, 1.0)
    .resizable(false)
    .maximizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    .build()
    .map_err(|e| format!("创建贴图窗口失败: {}", e))?;
    
    window.set_size(Size::Logical(LogicalSize::new(window_width, window_height)))
        .map_err(|e| format!("设置窗口尺寸失败: {}", e))?;
    
    window.set_position(PhysicalPosition::new(physical_x, physical_y))
        .map_err(|e| format!("设置窗口位置失败: {}", e))?;
    
    Ok(window)
}

// 前端请求获取图片数据
#[tauri::command]
pub fn get_pin_image_data(window: WebviewWindow) -> Result<serde_json::Value, String> {
    if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let map = data_map.lock().unwrap();
        if let Some(data) = map.get(window.label()) {
            return Ok(json!({
                "file_path": data.file_path,
                "width": data.width,
                "height": data.height,
                "preview_mode": data.preview_mode
            }));
        }
    }
    Err("未找到图片数据".to_string())
}


// 图片另存为
#[tauri::command]
pub async fn save_pin_image_as(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    use std::path::Path;
    use tauri_plugin_dialog::DialogExt;
    
    let file_path = if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let map = data_map.lock().unwrap();
        if let Some(data) = map.get(window.label()) {
            data.file_path.clone()
        } else {
            return Err("未找到图片数据".to_string());
        }
    } else {
        return Err("未找到图片数据".to_string());
    };
    
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("图片文件不存在".to_string());
    }
    
    let filename = format!("QC_{}.png", 
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image")
    );
    
    let save_path = app.dialog().file()
        .set_file_name(&filename)
        .add_filter("PNG 图片", &["png"])
        .add_filter("JPEG 图片", &["jpg", "jpeg"])
        .add_filter("所有文件", &["*"])
        .blocking_save_file()
        .ok_or("用户取消保存")?;
    
    let dest = save_path.as_path().ok_or("无效的文件路径")?;
    std::fs::copy(&file_path, dest)
        .map_err(|e| format!("保存失败: {}", e))?;
    
    Ok(())
}

// 关闭预览窗口
#[tauri::command]
pub fn close_image_preview(app: AppHandle) -> Result<(), String> {
    let label = "image-preview";
    if let Some(window) = app.get_webview_window(label) {
        if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
            data_map.lock().unwrap().remove(label);
        }
        window.close().map_err(|e| format!("关闭预览窗口失败: {}", e))?;
    }
    Ok(())
}

// 关闭贴图窗口
#[tauri::command]
pub fn close_pin_image_window_by_self(window: WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    
    if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let mut map = data_map.lock().unwrap();
        map.remove(&label);
    }
    
    window.close().map_err(|e| format!("关闭窗口失败: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn animate_window_resize(
    window: WebviewWindow,
    start_w: f64, start_h: f64,
    start_x: i32, start_y: i32,
    end_w: f64, end_h: f64,
    end_x: i32, end_y: i32,
    duration_ms: u64,
) -> Result<(), String> {
    let window = window.clone();
    
    tauri::async_runtime::spawn(async move {
        let start_time = Instant::now();
        let duration = Duration::from_millis(duration_ms);
        let frame_duration = Duration::from_millis(16);

        let dw = end_w - start_w;
        let dh = end_h - start_h;
        let dx = end_x - start_x;
        let dy = end_y - start_y;

        loop {
            let elapsed = start_time.elapsed();
            if elapsed >= duration {
                let _ = window.set_size(PhysicalSize::new(end_w as u32, end_h as u32));
                let _ = window.set_position(PhysicalPosition::new(end_x, end_y));
                break;
            }

            let progress = elapsed.as_secs_f64() / duration.as_secs_f64();
            
            let eased = 1.0 - 2f64.powf(-10.0 * progress);

            let cur_w = (start_w + dw * eased).round() as u32;
            let cur_h = (start_h + dh * eased).round() as u32;
            let cur_x = start_x + (dx as f64 * eased).round() as i32;
            let cur_y = start_y + (dy as f64 * eased).round() as i32;

            let _ = window.set_size(PhysicalSize::new(cur_w, cur_h));
            let _ = window.set_position(PhysicalPosition::new(cur_x, cur_y));

            tokio::time::sleep(frame_duration).await;
        }
    });

    Ok(())
}
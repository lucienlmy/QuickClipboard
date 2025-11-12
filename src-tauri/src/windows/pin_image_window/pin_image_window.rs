use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::collections::HashMap;
use once_cell::sync::OnceCell;
use std::time::{Duration, Instant};
use tauri::{AppHandle, WebviewWindow, WebviewWindowBuilder, LogicalPosition, LogicalSize, Size,async_runtime::spawn,PhysicalPosition, PhysicalSize, Position, };

static PIN_IMAGE_COUNTER: AtomicUsize = AtomicUsize::new(0);

static PIN_IMAGE_DATA_MAP: OnceCell<Mutex<HashMap<String, PinImageData>>> = OnceCell::new();

#[derive(Clone, Debug)]
struct PinImageData {
    file_path: String,
    width: u32,
    height: u32,
}

pub fn init_pin_image_window() {
    PIN_IMAGE_COUNTER.store(0, Ordering::SeqCst);
    PIN_IMAGE_DATA_MAP.get_or_init(|| Mutex::new(HashMap::new()));
}

// 创建并显示贴图窗口
pub async fn show_pin_image_window(
    app: AppHandle,
    image_data: Vec<u8>,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let counter = PIN_IMAGE_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("pin-image-{}", counter);
    
    // 保存图片到临时文件
    let file_path = save_pin_image_to_temp(&image_data, counter)?;
    
    // 存储图片数据
    if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let mut map = data_map.lock().unwrap();
        map.insert(
        window_label.clone(),
        PinImageData {
            file_path,
            width,
            height,
        },
    );
}

// 创建窗口
let window = create_pin_image_window(app, &window_label, width, height, x, y).await?;

// 显示窗口
window.show().map_err(|e| format!("显示贴图窗口失败: {}", e))?;

Ok(())
}

// 从文件路径创建贴图窗口
#[tauri::command]
pub async fn pin_image_from_file(
    app: AppHandle,
    file_path: String,
) -> Result<(), String> {
    let image_data = std::fs::read(&file_path)
        .map_err(|e| format!("读取图片文件失败: {}", e))?;
    
    let img = image::load_from_memory(&image_data)
        .map_err(|e| format!("解析图片失败: {}", e))?;
    
    let width = img.width();
    let height = img.height();
    
    let counter = PIN_IMAGE_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("pin-image-{}", counter);
    
    // 存储图片数据
    if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let mut map = data_map.lock().unwrap();
        map.insert(
            window_label.clone(),
            PinImageData {
                file_path,
                width,
                height,
            },
        );
    }
    
    // 获取主屏幕尺寸并居中显示
    let (x, y) = if let Ok(monitors) = app.primary_monitor() {
        if let Some(monitor) = monitors {
            let screen_size = monitor.size();
            let screen_width = screen_size.width as f64 / monitor.scale_factor();
            let screen_height = screen_size.height as f64 / monitor.scale_factor();
            
            let x = ((screen_width - width as f64) / 2.0).max(0.0) as i32;
            let y = ((screen_height - height as f64) / 2.0).max(0.0) as i32;
            (x, y)
        } else {
            (100, 100)
        }
    } else {
        (100, 100)
    };
    
    let window = create_pin_image_window(app, &window_label, width, height, x, y).await?;
    
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
) -> Result<WebviewWindow, String> {
    const SHADOW_PADDING: f64 = 10.0;

    let window_width = width as f64 + SHADOW_PADDING;
    let window_height = height as f64 + SHADOW_PADDING;

    let window_x = (x as f64 - SHADOW_PADDING / 2.0).max(0.0);
    let window_y = (y as f64 - SHADOW_PADDING / 2.0).max(0.0);

    let window = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("windows/pinImage/pinImage.html".into()),
    )
    .title("贴图")
    .inner_size(window_width, window_height)
    .min_inner_size(1.0, 1.0)
    .position(window_x, window_y)
    .resizable(false)
    .maximizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .visible(false)
    .build()
    .map_err(|e| format!("创建贴图窗口失败: {}", e))?;
    
    window.set_size(Size::Logical(LogicalSize::new(window_width, window_height)))
        .map_err(|e| format!("设置窗口尺寸失败: {}", e))?;
    window.set_position(LogicalPosition::new(window_x, window_y))
        .map_err(|e| format!("设置窗口位置失败: {}", e))?;
    
    // window.set_focusable(false)
    //     .map_err(|e| format!("设置贴图窗口 focusable 失败: {}", e))?;
    
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
                "height": data.height
            }));
        }
    }
    Err("未找到图片数据".to_string())
}

// 复制贴图到剪贴板
#[tauri::command]
pub fn copy_pin_image_to_clipboard(window: WebviewWindow) -> Result<(), String> {
    Err("未找到图片数据".to_string())
}

// 图片另存为
#[tauri::command]
pub async fn save_pin_image_as(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    Err("未找到图片数据".to_string())
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
    start_width: f64,
    start_height: f64,
    start_x: i32,
    start_y: i32,
    end_width: f64,
    end_height: f64,
    end_x: i32,
    end_y: i32,
    duration_ms: u64,
) -> Result<(), String> {
    spawn(async move {
        let start_time = Instant::now();
        let duration = Duration::from_millis(duration_ms);
        let frame_time = Duration::from_millis(8);

        let d_width = end_width - start_width;
        let d_height = end_height - start_height;
        let d_x = end_x - start_x;
        let d_y = end_y - start_y;

        loop {
            let elapsed = start_time.elapsed();
            let progress = (elapsed.as_secs_f64() / duration.as_secs_f64()).min(1.0);

            let eased = if progress < 0.5 {
                4.0 * progress * progress * progress
            } else {
                1.0 - (-2.0 * progress + 2.0).powi(3) / 2.0
            };

            let current_width = start_width + d_width * eased;
            let current_height = start_height + d_height * eased;
            let current_x = start_x + (d_x as f64 * eased) as i32;
            let current_y = start_y + (d_y as f64 * eased) as i32;

            let _ = window.set_size(PhysicalSize::new(current_width as u32, current_height as u32));
            let _ = window.set_position(Position::Physical(PhysicalPosition::new(current_x, current_y)));

            if progress >= 1.0 {
                break;
            }

            tokio::time::sleep(frame_time).await;
        }
    });

    Ok(())
}
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::collections::HashMap;
use once_cell::sync::OnceCell;
use tauri::{AppHandle, WebviewWindow, WebviewWindowBuilder};

// 用于生成唯一的窗口标识
static PIN_IMAGE_COUNTER: AtomicUsize = AtomicUsize::new(0);

// 存储每个窗口的图片数据
static PIN_IMAGE_DATA_MAP: OnceCell<Mutex<HashMap<String, PinImageData>>> = OnceCell::new();

#[derive(Clone, Debug)]
struct PinImageData {
    file_path: String,
    width: u32,
    height: u32,
}

// 初始化贴图窗口
pub fn init_pin_image_window() {
    // 重置计数器
    PIN_IMAGE_COUNTER.store(0, Ordering::SeqCst);
    // 初始化数据存储
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

// 创建后立即设置尺寸
use tauri::Size;
window.set_size(Size::Logical(tauri::LogicalSize {
    width: width as f64,
    height: height as f64,
})).map_err(|e| format!("设置窗口尺寸失败: {}", e))?;

// 显示窗口
window.show().map_err(|e| format!("显示贴图窗口失败: {}", e))?;

Ok(())
}

// 从文件路径创建贴图窗口
pub async fn show_pin_image_from_file(
    app: AppHandle,
    file_path: String,
) -> Result<(), String> {
    // 读取图片以获取尺寸
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
    
    // 创建窗口
    let window = create_pin_image_window(app, &window_label, width, height, x, y).await?;
    
    // 创建后立即设置尺寸
    use tauri::Size;
    window.set_size(Size::Logical(tauri::LogicalSize {
        width: width as f64,
        height: height as f64,
    })).map_err(|e| format!("设置窗口尺寸失败: {}", e))?;
    
    // 显示窗口
    window.show().map_err(|e| format!("显示贴图窗口失败: {}", e))?;
    
    Ok(())
}

// 保存图片到应用数据目录
fn save_pin_image_to_temp(image_data: &[u8], _counter: usize) -> Result<String, String> {
    // 获取应用数据目录
    let app_data_dir = crate::settings::get_data_directory()?;
    let pin_dir = app_data_dir.join("clipboard_images/pin_images");
    std::fs::create_dir_all(&pin_dir)
        .map_err(|e| format!("创建贴图目录失败: {}", e))?;
    
    // 生成文件名
    let now = chrono::Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    let millis = now.timestamp_subsec_millis();
    let filename = format!("QC贴图_{}_{:03}.png", timestamp, millis);
    let file_path = pin_dir.join(&filename);
    
    std::fs::write(&file_path, image_data)
        .map_err(|e| format!("保存图片文件失败: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
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
    let window = WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("pinImage/pinImage.html".into()),
    )
    .title("贴图")
    .inner_size(width as f64, height as f64)
    .min_inner_size(5.0, 5.0)
    .position(x as f64, y as f64)
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
    
    window.set_focusable(false)
        .map_err(|e| format!("设置贴图窗口 focusable 失败: {}", e))?;
    
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
    let label = window.label().to_string();
    
    if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let map = data_map.lock().unwrap();
        if let Some(data) = map.get(&label) {
            let file_path = data.file_path.clone();
            drop(map);
            
            // 读取图片文件并转换为图片数据
            #[cfg(windows)]
            {
                use crate::clipboard_content::{data_url_to_bgra_and_png, set_windows_clipboard_image_with_file};
                
                // 从文件读取图片数据
                let image_data = std::fs::read(&file_path)
                    .map_err(|e| format!("读取图片文件失败: {}", e))?;
                
                // 转换为 base64 data URL
                use base64::{engine::general_purpose, Engine as _};
                let base64_string = general_purpose::STANDARD.encode(&image_data);
                let data_url = format!("data:image/png;base64,{}", base64_string);
                
                // 转换为 BGRA 和 PNG 格式
                let (bgra, png_bytes, width, height) = data_url_to_bgra_and_png(&data_url)?;
                
                // 同时设置图片数据和文件路径
                set_windows_clipboard_image_with_file(&bgra, &png_bytes, width, height, Some(&file_path))?;
            }
            
            #[cfg(not(windows))]
            {
                // 非 Windows 平台，只设置文件路径
                crate::file_handler::set_clipboard_files(&[file_path])?;
            }
            
            return Ok(());
        }
    }
    
    Err("未找到图片数据".to_string())
}

// 图片另存为
#[tauri::command]
pub async fn save_pin_image_as(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    
    // 获取源文件路径
    let source_path = if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let map = data_map.lock().unwrap();
        if let Some(data) = map.get(&label) {
            data.file_path.clone()
        } else {
            return Err("未找到图片数据".to_string());
        }
    } else {
        return Err("未找到图片数据".to_string());
    };

    use tauri_plugin_dialog::DialogExt;
    
    let now = chrono::Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    let millis = now.timestamp_subsec_millis();
    let default_filename = format!("QC贴图_{}_{:03}.png", timestamp, millis);
    
    let file_path = app.dialog()
        .file()
        .set_title("保存图片")
        .set_file_name(&default_filename)
        .add_filter("PNG 图片", &["png"])
        .blocking_save_file();
    
    if let Some(file_path) = file_path {
        // 复制文件到目标位置
        std::fs::copy(&source_path, file_path.as_path().unwrap())
            .map_err(|e| format!("保存图片失败: {}", e))?;
        
        Ok(())
    } else {
        Err("用户取消了保存".to_string())
    }
}

// 关闭贴图窗口
#[tauri::command]
pub fn close_pin_image_window_by_self(window: WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    
    // 从 map 中删除数据
    if let Some(data_map) = PIN_IMAGE_DATA_MAP.get() {
        let mut map = data_map.lock().unwrap();
        map.remove(&label);
    }
    
    // 关闭窗口
    window.close().map_err(|e| format!("关闭窗口失败: {}", e))?;
    
    Ok(())
}

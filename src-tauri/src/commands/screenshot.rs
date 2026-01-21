use tauri::Manager;

// 启动内置截图功能
#[tauri::command]
pub async fn start_builtin_screenshot(app: tauri::AppHandle) -> Result<(), String> {
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        crate::windows::screenshot_window::auto_selection::clear_auto_selection_cache();
        crate::windows::screenshot_window::start_screenshot(&app_clone)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

// 捕获所有显示器截图
#[tauri::command]
pub fn capture_all_screenshots(app: tauri::AppHandle) -> Result<Vec<crate::services::screenshot::MonitorScreenshotInfo>, String> {
    crate::services::screenshot::capture_all_monitors_to_files(&app)
}

// 获取最近一次截屏结果
#[tauri::command]
pub fn get_last_screenshot_captures() -> Result<Vec<crate::services::screenshot::MonitorScreenshotInfo>, String> {
    crate::services::screenshot::get_last_captures()
}

// 取消当前截屏会话
#[tauri::command]
pub async fn cancel_screenshot_session(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::screenshot::clear_last_captures();
    crate::windows::screenshot_window::auto_selection::clear_auto_selection_cache();
    crate::utils::image_http_server::clear_raw_images();
    
    if let Some(win) = app.get_webview_window("screenshot") {
        let _ = win.eval("document.documentElement.style.opacity = '0'");
        tokio::time::sleep(tokio::time::Duration::from_millis(20)).await;
        let _ = win.hide();
        let _ = win.eval("window.location.reload()");
    }
    
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
        crate::services::memory::cleanup_memory();
    });
    
    Ok(())
}

// 启用长截屏模式的鼠标穿透控制
#[tauri::command]
pub fn enable_long_screenshot_passthrough(
    app: tauri::AppHandle,
    physical_x: f64,
    physical_y: f64,
    physical_width: f64,
    physical_height: f64,
    physical_toolbar_x: f64,
    physical_toolbar_y: f64,
    physical_toolbar_width: f64,
    physical_toolbar_height: f64,
    selection_scale_factor: f64,
) -> Result<u16, String> {
    if let Some(window) = app.get_webview_window("screenshot") {
        crate::windows::screenshot_window::long_screenshot::enable_passthrough(
            window,
            physical_x, physical_y, physical_width, physical_height,
            physical_toolbar_x, physical_toolbar_y, physical_toolbar_width, physical_toolbar_height,
            selection_scale_factor
        )
    } else {
        Err("未找到截图窗口".to_string())
    }
}

// 禁用长截屏模式的鼠标穿透控制
#[tauri::command]
pub fn disable_long_screenshot_passthrough() -> Result<(), String> {
    crate::windows::screenshot_window::long_screenshot::disable_passthrough();
    Ok(())
}

// 开始长截屏捕获
#[tauri::command]
pub fn start_long_screenshot_capture() -> Result<(), String> {
    crate::windows::screenshot_window::long_screenshot::start_capturing()
}

// 停止长截屏捕获
#[tauri::command]
pub fn stop_long_screenshot_capture() -> Result<(), String> {
    crate::windows::screenshot_window::long_screenshot::stop_capturing();
    Ok(())
}

// 更新长截屏预览面板位置
#[tauri::command]
pub fn update_long_screenshot_preview_panel(x: f64, y: f64, width: f64, height: f64) {
    crate::windows::screenshot_window::long_screenshot::update_preview_panel_rect(x, y, width, height);
}

// 更新长截屏工具栏位置
#[tauri::command]
pub fn update_long_screenshot_toolbar(x: f64, y: f64, width: f64, height: f64) {
    crate::windows::screenshot_window::long_screenshot::update_toolbar_rect(x, y, width, height);
}

// 保存长截屏
#[tauri::command]
pub async fn save_long_screenshot(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::windows::screenshot_window::long_screenshot::save_long_screenshot(path)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

// 长截屏复制到剪贴板
#[tauri::command]
pub async fn copy_long_screenshot_to_clipboard() -> Result<(), String> {
    use clipboard_rs::ClipboardContext;
    use crate::services::paste::set_clipboard_files;
    use sha2::{Sha256, Digest};
    
    tokio::task::spawn_blocking(move || {
        let data_dir = crate::services::get_data_directory()?;
        let images_dir = data_dir.join("clipboard_images");
        std::fs::create_dir_all(&images_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
        
        let temp_path = images_dir.join("_temp_long_screenshot.png");
        crate::windows::screenshot_window::long_screenshot::save_long_screenshot(
            temp_path.to_string_lossy().to_string()
        )?;
        
        let png_data = std::fs::read(&temp_path)
            .map_err(|e| format!("读取图片失败: {}", e))?;
        let hash = format!("{:x}", Sha256::digest(&png_data));
        let filename = format!("{}.png", &hash[..16]);
        let final_path = images_dir.join(&filename);
        
        if final_path.exists() {
            let _ = std::fs::remove_file(&temp_path);
        } else {
            std::fs::rename(&temp_path, &final_path)
                .map_err(|e| format!("移动文件失败: {}", e))?;
        }
        
        let ctx = ClipboardContext::new()
            .map_err(|e| format!("创建剪贴板上下文失败: {}", e))?;
        set_clipboard_files(&ctx, vec![final_path.to_string_lossy().to_string()])
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

// 长截屏自动滚动
#[tauri::command]
pub fn long_screenshot_auto_scroll(direction: String) -> Result<(bool, bool), String> {
    match direction.as_str() {
        "down" => crate::windows::screenshot_window::long_screenshot::toggle_auto_scroll_down(),
        "up" => crate::windows::screenshot_window::long_screenshot::toggle_auto_scroll_up(),
        _ => return Err(format!("无效的方向参数: {}", direction)),
    }
    
    Ok((
        crate::windows::screenshot_window::long_screenshot::is_auto_scroll_down_active(),
        crate::windows::screenshot_window::long_screenshot::is_auto_scroll_up_active(),
    ))
}

// 重置长截屏
#[tauri::command]
pub fn reset_long_screenshot() {
    crate::windows::screenshot_window::long_screenshot::reset_long_screenshot();
}

// 从顶部裁剪长截屏
#[tauri::command]
pub fn crop_long_screenshot_from_top(height: u32) -> Result<(), String> {
    crate::windows::screenshot_window::long_screenshot::crop_from_top(height)
}

// 从底部裁剪长截屏
#[tauri::command]
pub fn crop_long_screenshot_from_bottom(height: u32) -> Result<(), String> {
    crate::windows::screenshot_window::long_screenshot::crop_from_bottom(height)
}

// OCR识别结果结构
#[derive(Debug, serde::Serialize)]
pub struct OcrWord {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, serde::Serialize)]
pub struct OcrLine {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub words: Vec<OcrWord>,
    pub word_gaps: Vec<f32>,
}

#[derive(Debug, serde::Serialize)]
pub struct OcrResult {
    pub text: String,
    pub lines: Vec<OcrLine>,
}

// OCR识别图片字节数组
#[tauri::command]
pub async fn recognize_image_ocr(image_data: Vec<u8>) -> Result<OcrResult, String> {
    tokio::task::spawn_blocking(move || {
        use qcocr::recognize_from_bytes;
        
        let result = recognize_from_bytes(&image_data, None)
            .map_err(|e| format!("OCR识别失败: {}", e))?;
        
        convert_ocr_result(result)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

// OCR识别图片文件
#[tauri::command]
pub async fn recognize_file_ocr(file_path: String, language: Option<String>) -> Result<OcrResult, String> {
    tokio::task::spawn_blocking(move || {
        use qcocr::recognize_from_file;
        
        let lang = language.as_deref();
        let result = recognize_from_file(&file_path, lang)
            .map_err(|e| format!("OCR识别失败: {}", e))?;
        
        convert_ocr_result(result)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
}

// 转换OCR结果为返回格式
fn convert_ocr_result(result: qcocr::OcrRecognitionResult) -> Result<OcrResult, String> {
    let lines = result.lines.iter().map(|line| {
        let words = line.words.iter().map(|word| OcrWord {
            text: word.text.clone(),
            x: word.bounds.x,
            y: word.bounds.y,
            width: word.bounds.width,
            height: word.bounds.height,
        }).collect();
        
        let word_gaps = line.compute_word_gaps();
        
        OcrLine {
            text: line.text.clone(),
            x: line.bounds.x,
            y: line.bounds.y,
            width: line.bounds.width,
            height: line.bounds.height,
            words,
            word_gaps,
        }
    }).collect();
    
    Ok(OcrResult {
        text: result.text,
        lines,
    })
}

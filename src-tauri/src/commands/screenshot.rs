use tauri::Manager;

// 启动内置截图功能
#[tauri::command]
pub fn start_builtin_screenshot(app: tauri::AppHandle) -> Result<(), String> {
    crate::windows::screenshot_window::auto_selection::clear_auto_selection_cache();
    crate::windows::screenshot_window::start_screenshot(&app)
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
pub fn cancel_screenshot_session(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::screenshot::clear_last_captures();
    crate::windows::screenshot_window::auto_selection::clear_auto_selection_cache();
    if let Some(win) = app.get_webview_window("screenshot") {
        let _ = win.hide();
        let _ = win.eval("window.location.reload()");
    }
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
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("screenshot") {
        crate::windows::screenshot_window::long_screenshot::enable_passthrough(
            window,
            physical_x, physical_y, physical_width, physical_height,
            physical_toolbar_x, physical_toolbar_y, physical_toolbar_width, physical_toolbar_height,
            selection_scale_factor
        );
        Ok(())
    } else {
        Err("Screenshot window not found".to_string())
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

// 保存长截屏
#[tauri::command]
pub async fn save_long_screenshot(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        crate::windows::screenshot_window::long_screenshot::save_long_screenshot(path)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?
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

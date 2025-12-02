use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use std::hash::{Hash, Hasher};
use std::collections::{hash_map::DefaultHasher, VecDeque};
use tauri::{Emitter, WebviewWindow};
use xcap::Monitor;
use image::RgbaImage;

use super::image_stitcher::ImageStitcher;

// 垂直填充
const VERTICAL_PADDING: u32 = 30;
const FAILED_ATTEMPTS_HISTORY_SIZE: usize = 20; 
const FULL_SCAN_TRIGGER: u32 = 3; 
const FRAME_SIMILARITY_THRESHOLD: f64 = 8.0; 

#[derive(Debug, Clone, Copy)]
struct SelectionRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy)]
struct ToolbarRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy)]
struct ScaleFactor(f64);

static LONG_SCREENSHOT_ACTIVE: AtomicBool = AtomicBool::new(false);
static CAPTURING_ACTIVE: AtomicBool = AtomicBool::new(false);
static SCREENSHOT_SELECTION: Lazy<Mutex<Option<SelectionRect>>> = Lazy::new(|| Mutex::new(None));
static SCREENSHOT_TOOLBAR: Lazy<Mutex<Option<ToolbarRect>>> = Lazy::new(|| Mutex::new(None));
static SCREENSHOT_WINDOW: Lazy<Mutex<Option<WebviewWindow>>> = Lazy::new(|| Mutex::new(None));
static SCALE_FACTOR: Lazy<Mutex<ScaleFactor>> = Lazy::new(|| Mutex::new(ScaleFactor(1.0)));
static STITCHED_IMAGE: Lazy<Mutex<Option<Vec<u8>>>> = Lazy::new(|| Mutex::new(None));
static STITCHED_WIDTH: Lazy<Mutex<u32>> = Lazy::new(|| Mutex::new(0));
static STITCHED_HEIGHT: Lazy<Mutex<u32>> = Lazy::new(|| Mutex::new(0));

// 启用长截屏模式的鼠标穿透控制
pub fn enable_passthrough(
    window: WebviewWindow,
    physical_x: f64,
    physical_y: f64,
    physical_width: f64,
    physical_height: f64,
    physical_toolbar_x: f64,
    physical_toolbar_y: f64,
    physical_toolbar_width: f64,
    physical_toolbar_height: f64,
    selection_scale_factor: f64,
) {
    *SCALE_FACTOR.lock() = ScaleFactor(selection_scale_factor);
    
    *SCREENSHOT_WINDOW.lock() = Some(window.clone());
    
    *SCREENSHOT_SELECTION.lock() = Some(SelectionRect { 
        x: physical_x, 
        y: physical_y, 
        width: physical_width, 
        height: physical_height 
    });
    *SCREENSHOT_TOOLBAR.lock() = Some(ToolbarRect {
        x: physical_toolbar_x,
        y: physical_toolbar_y,
        width: physical_toolbar_width,
        height: physical_toolbar_height,
    });
    LONG_SCREENSHOT_ACTIVE.store(true, Ordering::Relaxed);
    
    // 重置拼接数据
    *STITCHED_IMAGE.lock() = None;
    *STITCHED_WIDTH.lock() = 0;
    *STITCHED_HEIGHT.lock() = 0;
    
    // 启动监听线程
    thread::spawn(move || {
        monitor_mouse_position();
    });
}

// 禁用长截屏模式的鼠标穿透控制
pub fn disable_passthrough() {
    stop_capturing();
    LONG_SCREENSHOT_ACTIVE.store(false, Ordering::Relaxed);
    *SCREENSHOT_SELECTION.lock() = None;
    *SCREENSHOT_TOOLBAR.lock() = None;
    
    // 禁用穿透
    if let Some(window) = SCREENSHOT_WINDOW.lock().as_ref() {
        let _ = window.set_ignore_cursor_events(false);
    }
    
    *SCREENSHOT_WINDOW.lock() = None;
    *STITCHED_IMAGE.lock() = None;
    *STITCHED_WIDTH.lock() = 0;
    *STITCHED_HEIGHT.lock() = 0;
    
    // 清除预览图
    crate::utils::image_http_server::clear_long_screenshot_preview();
}

// 开始捕获
pub fn start_capturing() -> Result<(), String> {
    if CAPTURING_ACTIVE.load(Ordering::Relaxed) {
        return Ok(());
    }
    
    CAPTURING_ACTIVE.store(true, Ordering::Relaxed);
    *STITCHED_IMAGE.lock() = None;
    *STITCHED_WIDTH.lock() = 0;
    *STITCHED_HEIGHT.lock() = 0;

    thread::Builder::new()
        .name("long-screenshot-capture".to_string())
        .spawn(|| {
            capture_loop();
        })
        .map_err(|e| format!("启动捕获线程失败: {}", e))?;
    
    Ok(())
}

// 停止捕获，返回是否有数据
pub fn has_captured_data() -> bool {
    *STITCHED_HEIGHT.lock() > 0
}

// 获取当前拼接的尺寸
pub fn get_stitched_size() -> (u32, u32) {
    (*STITCHED_WIDTH.lock(), *STITCHED_HEIGHT.lock())
}

// 停止捕获
pub fn stop_capturing() {
    CAPTURING_ACTIVE.store(false, Ordering::Relaxed);
}

// 保存长截屏
pub fn save_long_screenshot(path: String) -> Result<(), String> {
    let data = STITCHED_IMAGE.lock();
    let width = *STITCHED_WIDTH.lock();
    let height = *STITCHED_HEIGHT.lock();
    
    if height == 0 || data.is_none() {
        return Err("没有捕获的图片".to_string());
    }
    
    let rgba_img = ImageStitcher::bgra_to_rgba_image(data.as_ref().unwrap(), width, height);
    
    rgba_img.save(&path)
        .map_err(|e| format!("保存图片失败: {}", e))?;
    
    Ok(())
}

// 监听鼠标位置并动态控制穿透
fn monitor_mouse_position() {
    while LONG_SCREENSHOT_ACTIVE.load(Ordering::Relaxed) {
        if let Some(selection) = *SCREENSHOT_SELECTION.lock() {
            if let Some(window) = SCREENSHOT_WINDOW.lock().as_ref() {
                let (x, y) = crate::mouse::get_cursor_position();
                
                // 判断鼠标是否在选区内
                let is_in_selection = 
                    x as f64 >= selection.x &&
                    x as f64 <= selection.x + selection.width &&
                    y as f64 >= selection.y &&
                    y as f64 <= selection.y + selection.height;
                
                // 判断鼠标是否在工具栏内
                let is_in_toolbar = if let Some(toolbar) = *SCREENSHOT_TOOLBAR.lock() {
                    x as f64 >= toolbar.x &&
                    x as f64 <= toolbar.x + toolbar.width &&
                    y as f64 >= toolbar.y &&
                    y as f64 <= toolbar.y + toolbar.height
                } else {
                    false
                };
                
                // 只有在选区内且不在工具栏内时才穿透
                let should_passthrough = is_in_selection && !is_in_toolbar;
                let _ = window.set_ignore_cursor_events(should_passthrough);
            }
        }
        
        thread::sleep(Duration::from_millis(16));
    }
}

// 捕获循环
fn capture_loop() {
    let mut frame_count = 0;
    let mut last_extended_rgba: Option<RgbaImage> = None;
    let mut last_content_height: u32 = 0;
    let mut last_frame_hash: u64 = 0;
    let mut stitch_failure_count: u32 = 0;
    let mut failed_attempts: VecDeque<u64> = VecDeque::with_capacity(FAILED_ATTEMPTS_HISTORY_SIZE);
    
    while CAPTURING_ACTIVE.load(Ordering::Relaxed) {
        if let Some(selection) = *SCREENSHOT_SELECTION.lock() {
            let selection_scale = SCALE_FACTOR.lock().0;
            let border_offset = (3.0 * selection_scale).round();
            
            // 去除边框后的实际内容区域
            let content_x = selection.x + border_offset;
            let content_y = selection.y + border_offset;
            let content_width = (selection.width - border_offset * 2.0).max(0.0);
            let content_height = (selection.height - border_offset * 2.0).max(0.0) as u32;
            
            if content_width <= 0.0 || content_height == 0 {
                thread::sleep(Duration::from_millis(66));
                continue;
            }
            
            // 扩展内容区域（上下各添加padding）
            let extended_y = (content_y - VERTICAL_PADDING as f64).max(0.0);
            let extended_selection = SelectionRect {
                x: content_x,
                y: extended_y,
                width: content_width,
                height: content_height as f64 + (VERTICAL_PADDING * 2) as f64,
            };
            
            // 计算实际的顶部padding
            let actual_top_padding = (content_y - extended_y) as u32;
            
            if let Ok(img) = capture_selection_area(&extended_selection) {
                // 计算当前帧哈希
                let current_hash = compute_image_hash(&img);
                
                if frame_count > 0 && current_hash == last_frame_hash {
                    thread::sleep(Duration::from_millis(33));
                    continue;
                }
                
                if frame_count > 0 {
                    if let Some(ref last_img) = last_extended_rgba {
                        let similarity = ImageStitcher::compare_full_frame_similarity(last_img, &img);
                        
                        if similarity < FRAME_SIMILARITY_THRESHOLD {
                            thread::sleep(Duration::from_millis(33));
                            continue;
                        }
                    }
                }
                
                if failed_attempts.contains(&current_hash) {
                    thread::sleep(Duration::from_millis(33));
                    continue;
                }
                
                let img_width = img.width();
                let img_bgra = rgba_to_bgra(img.as_raw());
                
                if frame_count == 0 {
                    // 第一帧：提取中间部分（去掉上下padding）
                    let first_frame_data = ImageStitcher::extract_region(
                        &img_bgra,
                        img_width,
                        actual_top_padding,
                        content_height,
                    );
                    
                    *STITCHED_IMAGE.lock() = Some(first_frame_data);
                    *STITCHED_WIDTH.lock() = img_width;
                    *STITCHED_HEIGHT.lock() = content_height;
                    
                    last_extended_rgba = Some(img);
                    last_content_height = content_height;
                    last_frame_hash = current_hash;
                    frame_count += 1;
                    update_preview(frame_count);
                } else if let Some(last_rgba) = &last_extended_rgba {
                    let quick_match = ImageStitcher::should_stitch_frame_ex(
                        last_rgba,
                        &img,
                        actual_top_padding,
                        last_content_height,
                        actual_top_padding,
                        content_height,
                    );
                    
                    let stitch_result = if quick_match.is_some() {
                        quick_match
                    } else if stitch_failure_count >= FULL_SCAN_TRIGGER {
                        let stitched = STITCHED_IMAGE.lock();
                        let stitched_width = *STITCHED_WIDTH.lock();
                        let stitched_height = *STITCHED_HEIGHT.lock();
                        
                        if let Some(ref stitched_data) = *stitched {
                            if let Some(full_result) = ImageStitcher::full_scan_stitch(
                                stitched_data,
                                stitched_width,
                                stitched_height,
                                &img,
                                actual_top_padding,
                                content_height,
                            ) {
                                use super::image_stitcher::StitchResult;
                                Some(StitchResult {
                                    new_content_y: full_result.new_content_y,
                                    new_content_height: full_result.new_content_height,
                                })
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    };
                    
                    if let Some(result) = stitch_result {
                        stitch_failure_count = 0;
                        failed_attempts.clear(); 
                        
                        // 提取新内容
                        let new_data = ImageStitcher::extract_region(
                            &img_bgra,
                            img_width,
                            result.new_content_y,
                            result.new_content_height,
                        );
                        
                        // 追加到拼接图像
                        if let Some(ref mut stitched) = *STITCHED_IMAGE.lock() {
                            stitched.extend_from_slice(&new_data);
                        }
                        
                        let new_height = *STITCHED_HEIGHT.lock() + result.new_content_height;
                        *STITCHED_HEIGHT.lock() = new_height;
                        
                        last_extended_rgba = Some(img);
                        last_content_height = content_height;
                        last_frame_hash = current_hash;
                        frame_count += 1;
                        update_preview(frame_count);
                    } else {
                        stitch_failure_count += 1;
                        
                        if !failed_attempts.contains(&current_hash) {
                            failed_attempts.push_back(current_hash);
                            if failed_attempts.len() > FAILED_ATTEMPTS_HISTORY_SIZE {
                                failed_attempts.pop_front();
                            }
                        }
                        
                    }
                }
            }
        }
        
        thread::sleep(Duration::from_millis(16));
    }
}

// RGBA转BGRA
fn rgba_to_bgra(rgba: &[u8]) -> Vec<u8> {
    let mut bgra = Vec::with_capacity(rgba.len());
    for chunk in rgba.chunks_exact(4) {
        bgra.push(chunk[2]); // B
        bgra.push(chunk[1]); // G
        bgra.push(chunk[0]); // R
        bgra.push(chunk[3]); // A
    }
    bgra
}

// 计算图像哈希
fn compute_image_hash(img: &RgbaImage) -> u64 {
    let mut hasher = DefaultHasher::new();
    let width = img.width();
    let height = img.height();
    
    // 采样16x16网格
    let step_x = (width / 16).max(1);
    let step_y = (height / 16).max(1);
    
    for y in (0..height).step_by(step_y as usize) {
        for x in (0..width).step_by(step_x as usize) {
            let pixel = img.get_pixel(x, y);
            pixel[0].hash(&mut hasher);
            pixel[1].hash(&mut hasher);
            pixel[2].hash(&mut hasher);
        }
    }
    
    hasher.finish()
}


// 捕获选区区域
fn capture_selection_area(selection: &SelectionRect) -> Result<RgbaImage, String> {
    let monitors = Monitor::all()
        .map_err(|e| format!("获取显示器失败: {}", e))?;
    
    let sel_x = selection.x as i32;
    let sel_y = selection.y as i32;
    let sel_w = selection.width as u32;
    let sel_h = selection.height as u32;
    
    // 存储与选区相交的显示器及其相交区域
    struct MonitorRegion {
        monitor: Monitor,
        monitor_x: i32,
        monitor_y: i32,
        // 相交区域在全局坐标系中的位置
        intersect_x: i32,
        intersect_y: i32,
        intersect_w: u32,
        intersect_h: u32,
    }
    
    let mut intersecting_monitors: Vec<MonitorRegion> = Vec::new();
    
    // 找出所有与选区相交的显示器
    for monitor in monitors {
        let monitor_x = monitor.x().map_err(|e| format!("获取X失败: {}", e))?;
        let monitor_y = monitor.y().map_err(|e| format!("获取Y失败: {}", e))?;
        let monitor_width = monitor.width().map_err(|e| format!("获取宽度失败: {}", e))?;
        let monitor_height = monitor.height().map_err(|e| format!("获取高度失败: {}", e))?;
        
        // 计算相交区域
        let intersect_x = sel_x.max(monitor_x);
        let intersect_y = sel_y.max(monitor_y);
        let intersect_right = (sel_x + sel_w as i32).min(monitor_x + monitor_width as i32);
        let intersect_bottom = (sel_y + sel_h as i32).min(monitor_y + monitor_height as i32);
        
        // 检查是否有相交
        if intersect_x < intersect_right && intersect_y < intersect_bottom {
            let intersect_w = (intersect_right - intersect_x) as u32;
            let intersect_h = (intersect_bottom - intersect_y) as u32;
            
            intersecting_monitors.push(MonitorRegion {
                monitor,
                monitor_x,
                monitor_y,
                intersect_x,
                intersect_y,
                intersect_w,
                intersect_h,
            });
        }
    }
    
    if intersecting_monitors.is_empty() {
        return Err("未找到包含选区的显示器".to_string());
    }
    
    // 如果只有一个显示器，直接截取
    if intersecting_monitors.len() == 1 {
        let region = &intersecting_monitors[0];
        let relative_x = (region.intersect_x - region.monitor_x) as u32;
        let relative_y = (region.intersect_y - region.monitor_y) as u32;
        
        return region.monitor
            .capture_region(relative_x, relative_y, region.intersect_w, region.intersect_h)
            .map_err(|e| format!("截图失败: {}", e));
    }
    
    // 跨屏情况：创建完整画布并拼接各部分
    let mut result_image = RgbaImage::new(sel_w, sel_h);
    
    for region in intersecting_monitors {
        // 截取显示器上的部分
        let relative_x = (region.intersect_x - region.monitor_x) as u32;
        let relative_y = (region.intersect_y - region.monitor_y) as u32;
        
        let partial_img = region.monitor
            .capture_region(relative_x, relative_y, region.intersect_w, region.intersect_h)
            .map_err(|e| format!("截图失败: {}", e))?;
        
        // 计算在结果图像中的位置（相对于选区左上角）
        let dst_x = (region.intersect_x - sel_x) as u32;
        let dst_y = (region.intersect_y - sel_y) as u32;
        
        // 复制到结果图像
        for y in 0..region.intersect_h {
            for x in 0..region.intersect_w {
                let src_pixel = partial_img.get_pixel(x, y);
                result_image.put_pixel(dst_x + x, dst_y + y, *src_pixel);
            }
        }
    }
    
    Ok(result_image)
}

// 编码 BGRA 为 BMP
fn encode_bgra_to_bmp(bgra: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let pixel_data_size = width * height * 4;
    let file_size = 14 + 40 + pixel_data_size;

    let mut buf = vec![0u8; file_size as usize];

    // BMP 文件头
    buf[0..2].copy_from_slice(b"BM");
    buf[2..6].copy_from_slice(&(file_size as u32).to_le_bytes());
    buf[10..14].copy_from_slice(&54u32.to_le_bytes());

    // BMP 信息头
    buf[14..18].copy_from_slice(&40u32.to_le_bytes());
    buf[18..22].copy_from_slice(&(width as i32).to_le_bytes());
    buf[22..26].copy_from_slice(&(-(height as i32)).to_le_bytes());
    buf[26..28].copy_from_slice(&1u16.to_le_bytes());
    buf[28..30].copy_from_slice(&32u16.to_le_bytes());
    buf[34..38].copy_from_slice(&(pixel_data_size as u32).to_le_bytes());

    buf[54..].copy_from_slice(bgra);

    Ok(buf)
}

// 更新预览
fn update_preview(frame_count: u32) {
    let data = STITCHED_IMAGE.lock();
    let width = *STITCHED_WIDTH.lock();
    let height = *STITCHED_HEIGHT.lock();
    
    if height == 0 || data.is_none() {
        return;
    }
    
    let bgra_data = data.as_ref().unwrap().clone();
    drop(data);
    
    // 编码为 BMP
    if let Ok(bmp_data) = encode_bgra_to_bmp(&bgra_data, width, height) {
        if let Ok(port) = crate::utils::image_http_server::update_long_screenshot_preview(bmp_data) {
            if let Some(window) = SCREENSHOT_WINDOW.lock().as_ref() {
                let preview_url = format!("http://127.0.0.1:{}/long-screenshot/preview.bmp?t={}", port, frame_count);
                let _ = window.emit("long-screenshot-preview", preview_url);
                let _ = window.emit("long-screenshot-progress", frame_count);
            }
        }
    }
}

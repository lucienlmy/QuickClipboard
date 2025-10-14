use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::{HWND, POINT as WIN_POINT};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BitBlt, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
use serde::{Deserialize, Serialize};
use image::RgbaImage;

use super::image_stitcher::{ImageStitcher, CapturedFrame};

const VERTICAL_PADDING: u32 = 40;

#[derive(Debug, Clone, Copy, PartialEq)]
enum ScrollingState {
    Idle,
    Running,
    Paused,
    Stopped,
}

pub struct ScrollingScreenshotManager {
    state: Arc<Mutex<ScrollingState>>,
    is_active: Arc<AtomicBool>,
    captured_frames: Arc<Mutex<Vec<CapturedFrame>>>,
    selection: Arc<Mutex<Option<SelectionRect>>>,
    panel_rect: Arc<Mutex<Option<PanelRect>>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    stitched_image: Arc<Mutex<Option<Vec<u8>>>>,  // 完整拼接图(BGRA)
    stitched_width: Arc<Mutex<u32>>,
    stitched_height: Arc<Mutex<u32>>,
    temp_dir: Arc<Mutex<Option<std::path::PathBuf>>>,
    pending_frames: Arc<Mutex<Vec<CapturedFrame>>>,  // 累积帧批量发送
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

impl ScrollingScreenshotManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ScrollingState::Idle)),
            is_active: Arc::new(AtomicBool::new(false)),
            captured_frames: Arc::new(Mutex::new(Vec::new())),
            selection: Arc::new(Mutex::new(None)),
            panel_rect: Arc::new(Mutex::new(None)),
            app_handle: Arc::new(Mutex::new(None)),
            stitched_image: Arc::new(Mutex::new(None)),
            stitched_width: Arc::new(Mutex::new(0)),
            stitched_height: Arc::new(Mutex::new(0)),
            temp_dir: Arc::new(Mutex::new(None)),
            pending_frames: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn init(&self, app: AppHandle, selection: SelectionRect, panel: PanelRect) -> Result<(), String> {
        if self.is_active.load(Ordering::Relaxed) {
            return Err("长截屏已在运行中".to_string());
        }

        let scale_factor = app.get_webview_window("screenshot")
            .and_then(|w| w.scale_factor().ok())
            .unwrap_or(1.0);

        let physical_selection = SelectionRect {
            left: (selection.left as f64 * scale_factor) as i32,
            top: (selection.top as f64 * scale_factor) as i32,
            width: (selection.width as f64 * scale_factor) as i32,
            height: (selection.height as f64 * scale_factor) as i32,
        };

        *self.app_handle.lock().unwrap() = Some(app.clone());
        *self.selection.lock().unwrap() = Some(physical_selection);
        *self.state.lock().unwrap() = ScrollingState::Idle;
        self.captured_frames.lock().unwrap().clear();
        *self.stitched_image.lock().unwrap() = None;
        *self.stitched_width.lock().unwrap() = 0;
        *self.stitched_height.lock().unwrap() = 0;
        self.pending_frames.lock().unwrap().clear();
        
        let app_data_dir = crate::settings::get_data_directory()?;
        let temp_dir = app_data_dir.join("scrolling_temp");
        std::fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("创建临时目录失败: {}", e))?;
        
        if let Ok(entries) = std::fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                let _ = std::fs::remove_file(entry.path());
            }
        }
        
        *self.temp_dir.lock().unwrap() = Some(temp_dir);
        self.is_active.store(true, Ordering::Relaxed);
        self.update_panel_rect(panel)?;
        
        if let Some(window) = app.get_webview_window("screenshot") {
            let _ = window.set_ignore_cursor_events(true);
        }
        
        self.start_mouse_listener();

        Ok(())
    }

    pub fn start(&self) -> Result<(), String> {
        if !self.is_active.load(Ordering::Relaxed) {
            return Err("未初始化长截屏".to_string());
        }

        let mut state = self.state.lock().unwrap();
        if *state == ScrollingState::Running {
            return Err("长截屏已在运行中".to_string());
        }

        *state = ScrollingState::Running;
        drop(state);
        self.start_capture_thread();

        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();
        if *state != ScrollingState::Running {
            return Err("长截屏未在运行中".to_string());
        }
        *state = ScrollingState::Paused;
        Ok(())
    }

    pub fn resume(&self) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();
        if *state != ScrollingState::Paused {
            return Err("长截屏未暂停".to_string());
        }
        *state = ScrollingState::Running;
        Ok(())
    }

    pub fn stop(&self) -> Result<ScrollingResult, String> {
        *self.state.lock().unwrap() = ScrollingState::Stopped;
        self.is_active.store(false, Ordering::Relaxed);
        thread::sleep(Duration::from_millis(100));

        let result = self.merge_frames()?;
        
        let stitched_data = self.stitched_image.lock().unwrap().clone();
        let app_handle = self.app_handle.lock().unwrap().clone();
        let width = result.width;
        let height = result.height;
        
        thread::spawn(move || {
            if let Some(data) = stitched_data {
                let _ = Self::save_to_clipboard_async(&data, width, height);
            }
        });
        
        self.cleanup();
        Ok(result)
    }

    pub fn cancel(&self) -> Result<(), String> {
        *self.state.lock().unwrap() = ScrollingState::Stopped;
        self.is_active.store(false, Ordering::Relaxed);
        self.cleanup();
        Ok(())
    }

    fn save_to_clipboard_async(data: &[u8], width: u32, height: u32) -> Result<(), String> {
        let png_bytes = ImageStitcher::bgra_to_png(data, width, height);
        
        let app_data_dir = crate::settings::get_data_directory()?;
        let scrolling_dir = app_data_dir.join("clipboard_images/scrolling_screenshots");
        std::fs::create_dir_all(&scrolling_dir)
            .map_err(|e| format!("创建长截屏目录失败: {}", e))?;
        
        let now = chrono::Local::now();
        let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
        let millis = now.timestamp_subsec_millis();
        let filename = format!("QC长截屏_{}_{:03}.png", timestamp, millis);
        let file_path = scrolling_dir.join(&filename);
        
        std::fs::write(&file_path, &png_bytes)
            .map_err(|e| format!("保存图片文件失败: {}", e))?;
        
        let file_path_str = file_path.to_string_lossy().to_string();
        crate::file_handler::set_clipboard_files(&[file_path_str])?;
        
        Ok(())
    }

    fn start_mouse_listener(&self) {
        let is_active = Arc::clone(&self.is_active);
        let panel_rect = Arc::clone(&self.panel_rect);
        let app_handle = Arc::clone(&self.app_handle);
        
        thread::spawn(move || {
            let mut last_in_panel = false;
            
            while is_active.load(Ordering::Relaxed) {
                let mut cursor_pos = WIN_POINT { x: 0, y: 0 };
                if unsafe { GetCursorPos(&mut cursor_pos) }.is_err() {
                    thread::sleep(Duration::from_millis(50));
                    continue;
                }

                if let Some(panel) = panel_rect.lock().unwrap().clone() {
                    let in_panel = cursor_pos.x >= panel.left 
                        && cursor_pos.x <= panel.left + panel.width
                        && cursor_pos.y >= panel.top 
                        && cursor_pos.y <= panel.top + panel.height;

                    if in_panel != last_in_panel {
                        last_in_panel = in_panel;
                        if let Some(app) = app_handle.lock().unwrap().as_ref() {
                            if let Some(window) = app.get_webview_window("screenshot") {
                                let _ = window.set_ignore_cursor_events(!in_panel);
                            }
                        }
                    }
                }

                thread::sleep(Duration::from_millis(50));
            }
            
            if let Some(app) = app_handle.lock().unwrap().as_ref() {
                if let Some(window) = app.get_webview_window("screenshot") {
                    let _ = window.set_ignore_cursor_events(false);
                }
            }
        });
    }

    fn start_capture_thread(&self) {
        let state = Arc::clone(&self.state);
        let is_active = Arc::clone(&self.is_active);
        let captured_frames = Arc::clone(&self.captured_frames);
        let selection = Arc::clone(&self.selection);
        let app_handle = Arc::clone(&self.app_handle);
        let stitched_image = Arc::clone(&self.stitched_image);
        let stitched_width = Arc::clone(&self.stitched_width);
        let stitched_height = Arc::clone(&self.stitched_height);
        let temp_dir = Arc::clone(&self.temp_dir);
        let pending_frames = Arc::clone(&self.pending_frames);

        thread::spawn(move || {
            let mut no_change_count = 0;
            let mut last_extended_rgba: Option<RgbaImage> = None;
            let mut last_content_height: u32 = 0;
            let mut last_preview_time = std::time::Instant::now();


            loop {
                let current_state = *state.lock().unwrap();
                if current_state == ScrollingState::Stopped || !is_active.load(Ordering::Relaxed) {
                    break;
                }

                if current_state == ScrollingState::Paused {
                    thread::sleep(Duration::from_millis(100));
                    continue;
                }

                let sel = selection.lock().unwrap().clone();
                
                if let Some(sel) = sel {
                    let scale_factor = app_handle.lock().unwrap().as_ref()
                        .and_then(|app| app.get_webview_window("screenshot"))
                        .and_then(|w| w.scale_factor().ok())
                        .unwrap_or(1.0);
                    
                    let border_offset = (3.0 * scale_factor) as i32;
                    let content_left = sel.left + border_offset;
                    let content_top = sel.top + border_offset;
                    let content_width = sel.width - (border_offset * 2);
                    let content_height = sel.height - (border_offset * 2);

                    // 扩展截屏区域
                    let extended_top = content_top.saturating_sub(VERTICAL_PADDING as i32);
                    let extended_height = content_height + (VERTICAL_PADDING * 2) as i32;
                    
                    match Self::capture_region(content_left, extended_top, content_width, extended_height) {
                        Ok(frame_data) => {
                            let current_extended_rgba = ImageStitcher::bgra_to_rgba_image(&frame_data, content_width as u32, extended_height as u32);
                            let mut should_update_preview = false;
                            let mut is_first_frame = false;
                            
                            {
                                let mut frames_lock = captured_frames.lock().unwrap();
                                if frames_lock.is_empty() {
                                    let first_frame_data = ImageStitcher::extract_region(
                                        &frame_data,
                                        content_width as u32,
                                        VERTICAL_PADDING,
                                        content_height as u32,
                                    );
                                    
                                    *stitched_image.lock().unwrap() = Some(first_frame_data.clone());
                                    *stitched_width.lock().unwrap() = content_width as u32;
                                    *stitched_height.lock().unwrap() = content_height as u32;
                                    
                                    let first_frame = CapturedFrame {
                                        data: first_frame_data,
                                        width: content_width as u32,
                                        height: content_height as u32,
                                    };
                                    
                                    frames_lock.clear();
                                    frames_lock.push(first_frame.clone());
                                    pending_frames.lock().unwrap().push(first_frame);
                                    
                                    last_extended_rgba = Some(current_extended_rgba);
                                    last_content_height = content_height as u32;
                                    should_update_preview = true;
                                    is_first_frame = true;

                                } else if let Some(last_rgba) = &last_extended_rgba {
                                    if let Some(stitch_result) = ImageStitcher::should_stitch_frame_ex(
                                        &last_rgba, &current_extended_rgba,
                                        VERTICAL_PADDING, last_content_height,
                                        VERTICAL_PADDING, content_height as u32
                                    ) {
                                        no_change_count = 0;
                                        
                                        let new_data = ImageStitcher::extract_region(
                                            &frame_data, 
                                            content_width as u32, 
                                            stitch_result.new_content_y, 
                                            stitch_result.new_content_height
                                        );
                                        
                                        let mut stitched = stitched_image.lock().unwrap();
                                        if let Some(ref mut img) = *stitched {
                                            img.extend_from_slice(&new_data);
                                        }
                                        drop(stitched);
                                        
                                        let new_height = *stitched_height.lock().unwrap() + stitch_result.new_content_height;
                                        *stitched_height.lock().unwrap() = new_height;
                                        
                                        let new_frame = CapturedFrame {
                                            data: new_data,
                                            width: content_width as u32,
                                            height: stitch_result.new_content_height,
                                        };
                                        
                                        frames_lock.clear();
                                        frames_lock.push(new_frame.clone());
                                        pending_frames.lock().unwrap().push(new_frame);
                                        
                                        last_extended_rgba = Some(current_extended_rgba);
                                        last_content_height = content_height as u32;
                                        should_update_preview = true;
                                    } else {
                                        no_change_count += 1;
                                    }
                                }
                            }
                            
                            if should_update_preview {
                                let now = std::time::Instant::now();
                                let elapsed = now.duration_since(last_preview_time);
                                
                                let pending_lock = pending_frames.lock().unwrap();
                                let pending_total_height: u32 = pending_lock.iter().map(|f| f.height).sum();
                                let pending_frames_clone = pending_lock.clone();
                                drop(pending_lock);
                                
                                let should_send = is_first_frame || pending_total_height >= 50 || elapsed >= Duration::from_millis(200);
                                
                                if should_send && !pending_frames_clone.is_empty() {
                                    last_preview_time = now;
                                    
                                    let app_clone = app_handle.lock().unwrap().as_ref().map(|a| a.clone());
                                    let total_height = *stitched_height.lock().unwrap();
                                    let temp_dir_clone = temp_dir.lock().unwrap().clone();
                                    
                                    pending_frames.lock().unwrap().clear();
                                    
                                    thread::spawn(move || {
                                        if let (Some(app), Some(temp_dir)) = (app_clone, temp_dir_clone) {
                                            let merged_frame = if is_first_frame && pending_frames_clone.len() == 1 {
                                                pending_frames_clone[0].clone()
                                            } else {
                                                Self::merge_pending_frames(&pending_frames_clone)
                                            };
                                            
                                            if let Ok((file_path, compressed_height)) = Self::save_compressed_frame(&merged_frame, &temp_dir, 216) {
                                                let _ = app.emit("scrolling-screenshot-preview", serde_json::json!({
                                                    "file_path": file_path,
                                                    "frame_height": compressed_height,
                                                    "total_height": total_height,
                                                }));
                                            }
                                        }
                                    });
                                }
                            }

                            if no_change_count > 20 {
                                thread::sleep(Duration::from_millis(60));
                            } else if no_change_count > 10 {
                                thread::sleep(Duration::from_millis(35));
                            } else {
                                thread::sleep(Duration::from_millis(25));
                            }
                        }
                        Err(_) => {
                            thread::sleep(Duration::from_millis(80));
                        }
                    }
                }
            }
        });
    }

    fn capture_region(x: i32, y: i32, width: i32, height: i32) -> Result<Vec<u8>, String> {
        unsafe {
            let desktop_dc = GetDC(HWND(0));
            if desktop_dc.is_invalid() {
                return Err("获取桌面DC失败".to_string());
            }

            let mem_dc = CreateCompatibleDC(desktop_dc);
            if mem_dc.is_invalid() {
                let _ = ReleaseDC(HWND(0), desktop_dc);
                return Err("创建兼容DC失败".to_string());
            }

            let bitmap = CreateCompatibleBitmap(desktop_dc, width, height);
            if bitmap.is_invalid() {
                let _ = DeleteDC(mem_dc);
                let _ = ReleaseDC(HWND(0), desktop_dc);
                return Err("创建位图失败".to_string());
            }

            let _old_bitmap = SelectObject(mem_dc, bitmap);
            let _ = BitBlt(mem_dc, 0, 0, width, height, desktop_dc, x, y, SRCCOPY);

            let mut bitmap_info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    biSizeImage: 0,
                    biXPelsPerMeter: 0,
                    biYPelsPerMeter: 0,
                    biClrUsed: 0,
                    biClrImportant: 0,
                },
                bmiColors: [Default::default(); 1],
            };

            let mut pixel_data = vec![0u8; (width * height * 4) as usize];
            let _ = GetDIBits(
                mem_dc,
                bitmap,
                0,
                height as u32,
                Some(pixel_data.as_mut_ptr() as *mut _),
                &mut bitmap_info,
                DIB_RGB_COLORS,
            );

            let _ = DeleteObject(bitmap);
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(HWND(0), desktop_dc);

            Ok(pixel_data)
        }
    }

    fn merge_frames(&self) -> Result<ScrollingResult, String> {
        // 直接使用完整拼接图
        let stitched = self.stitched_image.lock().unwrap();
        let _stitched_data = stitched.as_ref()
            .ok_or("没有拼接图数据".to_string())?;
        
        let width = *self.stitched_width.lock().unwrap();
        let height = *self.stitched_height.lock().unwrap();
        
        if width == 0 || height == 0 {
            return Err("无效的图像尺寸".to_string());
        }
        
        Ok(ScrollingResult {
            image_url: String::new(),
            width,
            height,
        })
    }

    /// 合并待发送帧
    fn merge_pending_frames(frames: &[CapturedFrame]) -> CapturedFrame {
        if frames.is_empty() {
            return CapturedFrame { data: vec![], width: 0, height: 0 };
        }
        
        if frames.len() == 1 {
            return frames[0].clone();
        }

        let width = frames[0].width;
        let total_height: u32 = frames.iter().map(|f| f.height).sum();
        let mut merged_data = Vec::with_capacity((width * total_height * 4) as usize);
        
        for frame in frames {
            merged_data.extend_from_slice(&frame.data);
        }
        
        CapturedFrame { data: merged_data, width, height: total_height }
    }

    /// 保存压缩帧到本地临时文件
    fn save_compressed_frame(
        frame: &CapturedFrame,
        temp_dir: &std::path::Path,
        target_width: u32,
    ) -> Result<(String, u32), String> {
        if let Ok(entries) = std::fs::read_dir(temp_dir) {
            let mut files: Vec<_> = entries
                .flatten()
                .filter(|e| {
                    if let Some(name) = e.file_name().to_str() {
                        name.starts_with("frame_") && name.ends_with(".png")
                    } else {
                        false
                    }
                })
                .collect();
            
            files.sort_by(|a, b| {
                let time_a = a.metadata().and_then(|m| m.modified()).ok();
                let time_b = b.metadata().and_then(|m| m.modified()).ok();
                time_b.cmp(&time_a)
            });
            
            for entry in files.iter().skip(2) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
        
        let scale = target_width as f64 / frame.width as f64;
        let target_height = (frame.height as f64 * scale).ceil() as u32;
        
        let rgba_image = ImageStitcher::bgra_to_rgba_image(&frame.data, frame.width, frame.height);
        let resized = image::imageops::resize(
            &rgba_image,
            target_width,
            target_height,
            image::imageops::FilterType::CatmullRom
        );
        
        let mut compressed_bgra = vec![0u8; (target_width * target_height * 4) as usize];
        for (i, pixel) in resized.pixels().enumerate() {
            compressed_bgra[i * 4] = pixel[2];
            compressed_bgra[i * 4 + 1] = pixel[1];
            compressed_bgra[i * 4 + 2] = pixel[0];
            compressed_bgra[i * 4 + 3] = pixel[3];
        }
        
        let png_bytes = ImageStitcher::bgra_to_png(&compressed_bgra, target_width, target_height);
        
        let file_name = format!("frame_{}.png", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis());
        let file_path = temp_dir.join(&file_name);
        
        std::fs::write(&file_path, &png_bytes)
            .map_err(|e| format!("保存帧文件失败: {}", e))?;
        
        Ok((file_path.to_string_lossy().to_string(), target_height))
    }


    pub fn update_panel_rect(&self, panel: PanelRect) -> Result<(), String> {
        let scale_factor = match self.app_handle.try_lock() {
            Ok(handle) => handle.as_ref()
                .and_then(|app| app.get_webview_window("screenshot"))
                .and_then(|w| w.scale_factor().ok())
                .unwrap_or(1.0),
            Err(_) => return Ok(())
        };

        let physical_panel = PanelRect {
            left: (panel.left as f64 * scale_factor) as i32,
            top: (panel.top as f64 * scale_factor) as i32,
            width: (panel.width as f64 * scale_factor) as i32,
            height: (panel.height as f64 * scale_factor) as i32,
        };
        
        if let Ok(mut panel_lock) = self.panel_rect.try_lock() {
            *panel_lock = Some(physical_panel);
        }
        
        Ok(())
    }

    fn cleanup(&self) {
        self.captured_frames.lock().unwrap().clear();
        *self.selection.lock().unwrap() = None;
        *self.panel_rect.lock().unwrap() = None;
        *self.stitched_image.lock().unwrap() = None;
        *self.stitched_width.lock().unwrap() = 0;
        *self.stitched_height.lock().unwrap() = 0;
        self.pending_frames.lock().unwrap().clear();
        
        if let Some(temp_dir) = self.temp_dir.lock().unwrap().as_ref() {
            if let Ok(entries) = std::fs::read_dir(temp_dir) {
                for entry in entries.flatten() {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
        *self.temp_dir.lock().unwrap() = None;
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ScrollingResult {
    pub image_url: String,
    pub width: u32,
    pub height: u32,
}

use once_cell::sync::Lazy;
pub static SCROLLING_SCREENSHOT_MANAGER: Lazy<ScrollingScreenshotManager> = Lazy::new(|| ScrollingScreenshotManager::new());

#[tauri::command]
pub fn init_scrolling_screenshot(app: AppHandle, selection: SelectionRect, panel: PanelRect) -> Result<(), String> {
    SCROLLING_SCREENSHOT_MANAGER.init(app, selection, panel)
}

#[tauri::command]
pub fn start_scrolling_screenshot() -> Result<(), String> {
    SCROLLING_SCREENSHOT_MANAGER.start()
}

#[tauri::command]
pub fn pause_scrolling_screenshot() -> Result<(), String> {
    SCROLLING_SCREENSHOT_MANAGER.pause()
}

#[tauri::command]
pub fn resume_scrolling_screenshot() -> Result<(), String> {
    SCROLLING_SCREENSHOT_MANAGER.resume()
}

#[tauri::command]
pub fn stop_scrolling_screenshot() -> Result<ScrollingResult, String> {
    SCROLLING_SCREENSHOT_MANAGER.stop()
}

#[tauri::command]
pub fn cancel_scrolling_screenshot() -> Result<(), String> {
    SCROLLING_SCREENSHOT_MANAGER.cancel()
}

#[tauri::command]
pub fn update_scrolling_panel_rect(panel: PanelRect) -> Result<(), String> {
    SCROLLING_SCREENSHOT_MANAGER.update_panel_rect(panel)
}

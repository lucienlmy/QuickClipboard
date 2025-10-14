use arboard::Clipboard;
use once_cell::sync::Lazy;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

use crate::clipboard_content::image_to_data_url;
use crate::clipboard_history;
use crate::image_manager::get_image_manager;

#[cfg(windows)]
use windows::core::w;
#[cfg(windows)]
use windows::Win32::Foundation::HWND;
#[cfg(windows)]
use windows::Win32::System::DataExchange::{
    CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW,
};
#[cfg(windows)]
use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

// 监听器控制状态
static MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);
static LAST_CLIPBOARD_CONTENT: Lazy<Arc<Mutex<String>>> =
    Lazy::new(|| Arc::new(Mutex::new(String::new())));

// 粘贴状态计数器
static PASTING_COUNT: AtomicUsize = AtomicUsize::new(0);

// 上次忽略的缓存文件路径 - 避免重复检测相同的缓存文件
static LAST_IGNORED_CACHE_FILES: Lazy<Arc<Mutex<Vec<String>>>> =
    Lazy::new(|| Arc::new(Mutex::new(Vec::new())));

// 上次处理的文件路径列表
static LAST_FILE_PATHS: Lazy<Arc<Mutex<Vec<String>>>> =
    Lazy::new(|| Arc::new(Mutex::new(Vec::new())));

#[cfg(windows)]
fn try_get_windows_clipboard_image() -> Option<arboard::ImageData<'static>> {
    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return None;
        }

        let mut result = None;

        let formats_to_try = [
            RegisterClipboardFormatW(w!("PNG")),
            8u32,
            2u32,
        ];

        for &format in &formats_to_try {
            if format == 0 {
                continue;
            }

            if IsClipboardFormatAvailable(format).is_ok() {
                if let Ok(handle) = GetClipboardData(format) {
                    if handle.0 != 0 {
                        if let Some(image_data) = process_clipboard_format(handle, format) {
                            result = Some(image_data);
                            break;
                        }
                    }
                }
            }
        }

        let _ = CloseClipboard();
        result
    }
}

#[cfg(windows)]
fn process_clipboard_format(
    handle: windows::Win32::Foundation::HANDLE,
    format: u32,
) -> Option<arboard::ImageData<'static>> {
    unsafe {
        let hglobal = windows::Win32::Foundation::HGLOBAL(handle.0 as *mut std::ffi::c_void);
        let size = GlobalSize(hglobal);
        if size == 0 {
            return None;
        }

        let ptr = GlobalLock(hglobal);
        if ptr.is_null() {
            return None;
        }

        let data_slice = std::slice::from_raw_parts(ptr as *const u8, size);

        let result = match format {
            format if format == RegisterClipboardFormatW(w!("PNG")) => process_png_data(data_slice),
            8 => process_dib_data(data_slice),
            _ => None,
        };

        let _ = GlobalUnlock(hglobal);
        result
    }
}

#[cfg(windows)]
fn process_png_data(data: &[u8]) -> Option<arboard::ImageData<'static>> {
    use std::borrow::Cow;

    match image::load_from_memory(data) {
        Ok(img) => {
            let rgba_img = img.to_rgba8();
            let (width, height) = rgba_img.dimensions();

            let rgba_data = rgba_img.into_raw();

            Some(arboard::ImageData {
                width: width as usize,
                height: height as usize,
                bytes: Cow::Owned(rgba_data),
            })
        }
        Err(e) => {
            println!("解析PNG数据失败: {}", e);
            None
        }
    }
}

#[cfg(windows)]
fn process_dib_data(data: &[u8]) -> Option<arboard::ImageData<'static>> {
    use std::borrow::Cow;

    if data.len() < 40 {
        return None; 
    }

    let width = i32::from_le_bytes([data[4], data[5], data[6], data[7]]) as u32;
    let height_raw = i32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let height = height_raw.abs() as u32;
    let is_bottom_up = height_raw > 0;
    let bit_count = u16::from_le_bytes([data[14], data[15]]);

    if bit_count != 32 && bit_count != 24 {
        return None;
    }

    let header_size = u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let colors_used = u32::from_le_bytes([data[32], data[33], data[34], data[35]]) as usize;
    let color_table_size = if colors_used == 0 && bit_count <= 8 {
        (1 << bit_count) * 4
    } else {
        colors_used * 4
    };

    let pixel_offset = header_size + color_table_size;

    if data.len() < pixel_offset {
        return None;
    }

    let pixel_data = &data[pixel_offset..];
    let bytes_per_pixel = (bit_count / 8) as usize;
    let row_size = ((width as usize * bytes_per_pixel + 3) / 4) * 4;

    if pixel_data.len() < row_size * height as usize {
        return None;
    }

    let mut rgba_data = Vec::with_capacity((width * height * 4) as usize);

    for y in 0..height {
        let actual_y = if is_bottom_up {
            height - 1 - y
        } else {
            y
        };

        let row_start = (actual_y as usize) * row_size;
        for x in 0..width {
            let pixel_start = row_start + (x as usize) * bytes_per_pixel;

            if pixel_start + bytes_per_pixel <= pixel_data.len() {
                match bit_count {
                    32 => {
                        let b = pixel_data[pixel_start];
                        let g = pixel_data[pixel_start + 1];
                        let r = pixel_data[pixel_start + 2];
                        let a = pixel_data[pixel_start + 3];
                        rgba_data.extend_from_slice(&[r, g, b, a]);
                    }
                    24 => {
                        let b = pixel_data[pixel_start];
                        let g = pixel_data[pixel_start + 1];
                        let r = pixel_data[pixel_start + 2];
                        rgba_data.extend_from_slice(&[r, g, b, 255]);
                    }
                    _ => rgba_data.extend_from_slice(&[255, 255, 255, 255]),
                }
            } else {
                rgba_data.extend_from_slice(&[255, 255, 255, 255]);
            }
        }
    }

    Some(arboard::ImageData {
        width: width as usize,
        height: height as usize,
        bytes: Cow::Owned(rgba_data),
    })
}

pub fn start_clipboard_monitor(app_handle: AppHandle) {
    if MONITOR_RUNNING.load(Ordering::Relaxed) {
        println!("剪贴板监听器已在运行");
        return;
    }

    MONITOR_RUNNING.store(true, Ordering::Relaxed);
    println!("启动剪贴板监听器");

    thread::spawn(move || {
        clipboard_monitor_loop(app_handle);
    });
}

fn clipboard_monitor_loop(app_handle: AppHandle) {
    let mut clipboard = match Clipboard::new() {
        Ok(cb) => cb,
        Err(e) => {
            println!("创建剪贴板实例失败: {}", e);
            MONITOR_RUNNING.store(false, Ordering::Relaxed);
            return;
        }
    };

    while MONITOR_RUNNING.load(Ordering::Relaxed) {
        // 检查剪贴板监听是否被禁用
        if !clipboard_history::is_monitoring_enabled() {
            thread::sleep(Duration::from_millis(200));
            continue;
        }

        // 检查当前应用是否在允许列表中
        if !crate::app_filter::is_current_app_allowed() {
            thread::sleep(Duration::from_millis(200));
            continue;
        }

        let current_content = get_clipboard_content(&mut clipboard);

        if let Some((content, html_content)) = current_content {
            let mut last_content = LAST_CLIPBOARD_CONTENT.lock().unwrap();
            if *last_content != content {

                *last_content = content.clone();
                drop(last_content); 

                let is_existing = matches!(
                    crate::database::clipboard_item_exists(&content),
                    Ok(Some(_))
                );

                let move_duplicates = !is_pasting_internal();
                let was_added =
                    clipboard_history::add_to_history_with_check_and_move_html(content, html_content, move_duplicates);

                if was_added && !is_pasting_internal() && !is_existing {
                    crate::sound_manager::play_copy_sound();
                }

                if was_added {
                    if let Ok(items) = crate::database::get_clipboard_history(Some(1)) {
                        if let Some(latest_item) = items.first() {
                            use tauri::Emitter;
                            #[derive(Clone, serde::Serialize)]
                            struct ClipboardUpdatePayload {
                                item: crate::database::ClipboardItem,
                                is_new: bool,
                            }
                            
                            if is_existing {
                                let payload = ClipboardUpdatePayload {
                                    item: latest_item.clone(),
                                    is_new: false,
                                };
                                
                                if let Err(e) = app_handle.emit("clipboard-item-moved", payload) {
                                    println!("发射剪贴板移动事件失败: {}", e);
                                }
                            } else {
                                let payload = ClipboardUpdatePayload {
                                    item: latest_item.clone(),
                                    is_new: true,
                                };
                                
                                if let Err(e) = app_handle.emit("clipboard-item-added", payload) {
                                    println!("发射剪贴板新增事件失败: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        }

        thread::sleep(Duration::from_millis(200));
    }
}

#[cfg(windows)]
fn try_get_windows_clipboard_html() -> Option<String> {
    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return None;
        }

        let mut result = None;

        let html_format = RegisterClipboardFormatW(w!("HTML Format"));

        if html_format != 0 && IsClipboardFormatAvailable(html_format).is_ok() {
            if let Ok(handle) = GetClipboardData(html_format) {
                if handle.0 != 0 {
                    let hglobal = windows::Win32::Foundation::HGLOBAL(handle.0 as *mut std::ffi::c_void);
                    let size = GlobalSize(hglobal);
                    if size > 0 {
                        let ptr = GlobalLock(hglobal);
                        if !ptr.is_null() {
                            let data_slice = std::slice::from_raw_parts(ptr as *const u8, size);
                            if let Ok(html_string) = std::str::from_utf8(data_slice) {
                                result = Some(extract_html_fragment(html_string));
                            }
                            let _ = GlobalUnlock(hglobal);
                        }
                    }
                }
            }
        }

        let _ = CloseClipboard();
        result
    }
}

#[cfg(windows)]
fn extract_html_fragment(html_format: &str) -> String {
    if let Some(start_fragment_pos) = html_format.find("StartFragment:") {
        if let Some(end_fragment_pos) = html_format.find("EndFragment:") {
            let start_line = &html_format[start_fragment_pos..];
            let end_line = &html_format[end_fragment_pos..];
            
            if let (Some(start_num), Some(end_num)) = (
                start_line.lines().next()
                    .and_then(|line| line.split(':').nth(1))
                    .and_then(|s| s.trim().parse::<usize>().ok()),
                end_line.lines().next()
                    .and_then(|line| line.split(':').nth(1))
                    .and_then(|s| s.trim().parse::<usize>().ok())
            ) {
                if start_num < html_format.len() && end_num <= html_format.len() && start_num < end_num {
                    return html_format[start_num..end_num].to_string();
                }
            }
        }
    }
    
    if html_format.contains("<html") || html_format.contains("<HTML") {
        if let Some(html_start) = html_format.find("<html") {
            return html_format[html_start..].to_string();
        }
        if let Some(html_start) = html_format.find("<HTML") {
            return html_format[html_start..].to_string();
        }
    }
    
    if html_format.contains('<') && html_format.contains('>') {
        return html_format.to_string();
    }
    
    html_format.to_string()
}

fn get_clipboard_content(clipboard: &mut Clipboard) -> Option<(String, Option<String>)> {
    if let Ok(file_paths) = crate::file_handler::get_clipboard_files() {
        if !file_paths.is_empty() {
            let all_from_cache = file_paths.iter().all(|path| is_from_image_cache(path));

            if all_from_cache {
                let mut last_ignored = LAST_IGNORED_CACHE_FILES.lock().unwrap();

                let paths_changed = last_ignored.len() != file_paths.len()
                    || !file_paths.iter().all(|path| last_ignored.contains(path));

                if paths_changed {
                    *last_ignored = file_paths.clone();
                }
                return None;
            } else {
                let mut last_ignored = LAST_IGNORED_CACHE_FILES.lock().unwrap();
                last_ignored.clear();
            }

            {
                let mut last_paths = LAST_FILE_PATHS.lock().unwrap();
                let paths_changed = last_paths.len() != file_paths.len()
                    || !file_paths.iter().all(|path| last_paths.contains(path));
                
                if !paths_changed {
                    return None;
                }

                *last_paths = file_paths.clone();
            }

            let mut file_infos = Vec::new();
            for path in &file_paths {
                if let Ok(file_info) = crate::file_handler::get_file_info(path) {
                    file_infos.push(file_info);
                }
            }

            if !file_infos.is_empty() {
                let file_data = crate::file_handler::FileClipboardData {
                    files: file_infos,
                    operation: "copy".to_string(),
                };

                if let Ok(json_str) = serde_json::to_string(&file_data) {
                    return Some((format!("files:{}", json_str), None));
                }
            }
        }
    }

    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() && !text.trim().is_empty() {
            if let Ok(mut last_paths) = LAST_FILE_PATHS.lock() {
                last_paths.clear();
            }
            
            #[cfg(windows)]
            let html_content = try_get_windows_clipboard_html();
            #[cfg(not(windows))]
            let html_content = None;
            
            return Some((text, html_content));
        }
    }

    if clipboard_history::is_save_images() {
        #[cfg(windows)]
        if let Some(img) = try_get_windows_clipboard_image() {
            if let Ok(mut last_paths) = LAST_FILE_PATHS.lock() {
                last_paths.clear();
            }
            return save_image_optimized(&img);
        }

        if let Ok(img) = clipboard.get_image() {
            if let Ok(mut last_paths) = LAST_FILE_PATHS.lock() {
                last_paths.clear();
            }
            return save_image_optimized(&img);
        }
    }

    None
}

#[cfg(windows)]
fn try_get_raw_clipboard_image_data() -> Option<(Vec<u8>, Vec<u8>, u32, u32)> {
    use windows::Win32::System::DataExchange::*;
    use windows::Win32::Foundation::*;
    use windows::Win32::System::Memory::*;
    
    use crate::clipboard_content::CLIPBOARD_LOCK;
    let _lock = CLIPBOARD_LOCK.lock().ok()?;
    
    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return None;
        }

        struct ClipboardGuard;
        impl Drop for ClipboardGuard {
            fn drop(&mut self) {
                unsafe {
                    let _ = CloseClipboard();
                }
            }
        }
        let _guard = ClipboardGuard;

        let mut bgra_data: Option<Vec<u8>> = None;
        let mut png_data: Option<Vec<u8>> = None;
        let mut width: u32 = 0;
        let mut height: u32 = 0;

        const CF_DIB: u32 = 8;
        if IsClipboardFormatAvailable(CF_DIB).is_ok() {
            if let Ok(handle) = GetClipboardData(CF_DIB) {
                if handle.0 != 0 {
                    let hglobal = HGLOBAL(handle.0 as *mut std::ffi::c_void);
                    let size = GlobalSize(hglobal);
                    if size > 0 {
                        let ptr = GlobalLock(hglobal);
                        if !ptr.is_null() {
                            let data_slice = std::slice::from_raw_parts(ptr as *const u8, size);
                            
                            if data_slice.len() >= 40 {
                                width = i32::from_le_bytes([data_slice[4], data_slice[5], data_slice[6], data_slice[7]]) as u32;
                                let height_raw = i32::from_le_bytes([data_slice[8], data_slice[9], data_slice[10], data_slice[11]]);
                                height = height_raw.abs() as u32;
                                
                                bgra_data = Some(data_slice.to_vec());
                            }
                            
                            let _ = GlobalUnlock(hglobal);
                        }
                    }
                }
            }
        }

        let png_format = RegisterClipboardFormatW(w!("PNG"));
        if IsClipboardFormatAvailable(png_format).is_ok() {
            if let Ok(handle) = GetClipboardData(png_format) {
                if handle.0 != 0 {
                    let hglobal = HGLOBAL(handle.0 as *mut std::ffi::c_void);
                    let size = GlobalSize(hglobal);
                    if size > 0 {
                        let ptr = GlobalLock(hglobal);
                        if !ptr.is_null() {
                            let data_slice = std::slice::from_raw_parts(ptr as *const u8, size);
                            png_data = Some(data_slice.to_vec());
                            let _ = GlobalUnlock(hglobal);
                        }
                    }
                }
            }
        }

        if let (Some(bgra), Some(png)) = (bgra_data, png_data) {
            if width > 0 && height > 0 {
                return Some((bgra, png, width, height));
            }
        }

        None
    }
}

fn save_image_optimized(img: &arboard::ImageData) -> Option<(String, Option<String>)> {
    #[cfg(windows)]
    {
        if let Some((bgra_data, png_data, width, height)) = try_get_raw_clipboard_image_data() {
            if let Ok(image_manager) = get_image_manager() {
                if let Ok(manager) = image_manager.lock() {
                    if let Ok(image_id) = manager.save_image_from_raw_data(width, height, bgra_data, png_data) {
                        return Some((format!("image:{}", image_id), None));
                    }
                }
            }
        }
    }
    
    let rgba_data = img.bytes.to_vec();
    if let Ok(image_manager) = get_image_manager() {
        if let Ok(manager) = image_manager.lock() {
            if let Ok(image_id) = manager.save_image_from_rgba_sync(img.width, img.height, &rgba_data) {
                return Some((format!("image:{}", image_id), None));
            }
        }
    }
    
    Some((image_to_data_url(img), None))
}

pub fn start_pasting_operation() {
    PASTING_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn end_pasting_operation() {
    PASTING_COUNT.fetch_sub(1, Ordering::Relaxed);
}

fn is_pasting_internal() -> bool {
    PASTING_COUNT.load(Ordering::Relaxed) > 0
}

pub fn is_currently_pasting() -> bool {
    PASTING_COUNT.load(Ordering::Relaxed) > 0
}

pub fn initialize_last_content(content: String) {
    if let Ok(mut last_content) = LAST_CLIPBOARD_CONTENT.lock() {
        *last_content = content;
    }
}

pub fn initialize_clipboard_state() {
    if let Ok(mut clipboard) = Clipboard::new() {
        if let Some((content, html_content)) = get_clipboard_content(&mut clipboard) {
            if !content.trim().is_empty() {
                let _was_added =
                    clipboard_history::add_to_history_with_check_and_move_html(content.clone(), html_content, false);
                initialize_last_content(content);
            }
        }
    }
}

fn is_from_image_cache(file_path: &str) -> bool {
    if file_path.contains("scrolling_screenshots") || file_path.contains("pin_images") {
        return false;
    }
    
    if let Some(app_data_dir) = dirs::data_local_dir() {
        let cache_dir = app_data_dir.join("quickclipboard").join("clipboard_images");
        if let Ok(cache_path) = cache_dir.canonicalize() {
            if let Ok(file_path_buf) = std::path::Path::new(file_path).canonicalize() {
                return file_path_buf.starts_with(cache_path);
            }
        }
    }
    false
}

use arboard::Clipboard;
use once_cell::sync::Lazy;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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

// 粘贴状态计数器 - 用于区分真正的复制和粘贴过程中的剪贴板设置
// 使用计数器而不是布尔值，避免并发粘贴操作的竞态条件
static PASTING_COUNT: AtomicUsize = AtomicUsize::new(0);

// 上次忽略的缓存文件路径 - 避免重复检测相同的缓存文件
static LAST_IGNORED_CACHE_FILES: Lazy<Arc<Mutex<Vec<String>>>> =
    Lazy::new(|| Arc::new(Mutex::new(Vec::new())));

#[cfg(windows)]
// Windows特定的剪贴板图片获取函数，支持更多格式
fn try_get_windows_clipboard_image() -> Option<arboard::ImageData<'static>> {
    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return None;
        }

        let mut result = None;

        // 尝试多种图片格式
        let formats_to_try = [
            // PNG格式
            RegisterClipboardFormatW(w!("PNG")),
            // DIB格式 (Device Independent Bitmap)
            8u32, // CF_DIB
            // Bitmap格式
            2u32, // CF_BITMAP
        ];

        for &format in &formats_to_try {
            if format == 0 {
                continue; // 跳过注册失败的格式
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
            // PNG格式
            format if format == RegisterClipboardFormatW(w!("PNG")) => process_png_data(data_slice),
            // DIB格式
            8 => process_dib_data(data_slice),
            // 其他格式暂时跳过
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
        return None; // DIB头至少40字节
    }

    // 解析BITMAPINFOHEADER
    let width = i32::from_le_bytes([data[4], data[5], data[6], data[7]]) as u32;
    let height_raw = i32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let height = height_raw.abs() as u32;
    let is_bottom_up = height_raw > 0; // 正数表示bottom-up，负数表示top-down
    let bit_count = u16::from_le_bytes([data[14], data[15]]);

    if bit_count != 32 && bit_count != 24 {
        println!("不支持的位深度: {}", bit_count);
        return None;
    }

    // 计算像素数据偏移
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
    let row_size = ((width as usize * bytes_per_pixel + 3) / 4) * 4; // 4字节对齐

    if pixel_data.len() < row_size * height as usize {
        println!(
            "像素数据不足: 需要{}, 实际{}",
            row_size * height as usize,
            pixel_data.len()
        );
        return None;
    }

    let mut rgba_data = Vec::with_capacity((width * height * 4) as usize);

    for y in 0..height {
        // 根据DIB格式确定实际的行索引
        let actual_y = if is_bottom_up {
            // bottom-up: 第0行对应DIB数据的最后一行
            height - 1 - y
        } else {
            // top-down: 第0行对应DIB数据的第一行
            y
        };

        let row_start = (actual_y as usize) * row_size;
        for x in 0..width {
            let pixel_start = row_start + (x as usize) * bytes_per_pixel;

            if pixel_start + bytes_per_pixel <= pixel_data.len() {
                match bit_count {
                    32 => {
                        // DIB中的BGRA格式，转换为RGBA
                        let b = pixel_data[pixel_start];
                        let g = pixel_data[pixel_start + 1];
                        let r = pixel_data[pixel_start + 2];
                        let a = pixel_data[pixel_start + 3];
                        rgba_data.extend_from_slice(&[r, g, b, a]);
                    }
                    24 => {
                        // DIB中的BGR格式，转换为RGBA并添加alpha通道
                        let b = pixel_data[pixel_start];
                        let g = pixel_data[pixel_start + 1];
                        let r = pixel_data[pixel_start + 2];
                        rgba_data.extend_from_slice(&[r, g, b, 255]); // 完全不透明
                    }
                    _ => {
                        // 不支持的格式，使用白色像素
                        rgba_data.extend_from_slice(&[255, 255, 255, 255]);
                    }
                }
            } else {
                // 数据不足，使用白色像素
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

// 启动剪贴板监听器
pub fn start_clipboard_monitor(app_handle: AppHandle) {
    // 如果已经在运行，直接返回
    if MONITOR_RUNNING.load(Ordering::Relaxed) {
        println!("剪贴板监听器已在运行");
        return;
    }

    MONITOR_RUNNING.store(true, Ordering::Relaxed);
    println!("启动剪贴板监听器");

    // 在后台线程中运行监听循环
    thread::spawn(move || {
        clipboard_monitor_loop(app_handle);
    });
}


// 剪贴板监听循环
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

        // 尝试获取剪贴板内容
        let current_content = get_clipboard_content(&mut clipboard);

        if let Some((content, html_content)) = current_content {
            // 检查内容是否发生变化
            let mut last_content = LAST_CLIPBOARD_CONTENT.lock().unwrap();
            if *last_content != content {
                // println!("检测到剪贴板内容变化");

                // 更新最后的内容
                *last_content = content.clone();
                drop(last_content); // 释放锁

                // 先检查内容是否已存在，以便正确区分新增和移动
                let is_existing = matches!(
                    crate::database::clipboard_item_exists(&content),
                    Ok(Some(_))
                );

                // 添加到历史记录，并检查是否真的添加了新内容
                // 如果正在粘贴，不移动重复内容的位置
                let move_duplicates = !is_pasting_internal();
                let was_added =
                    clipboard_history::add_to_history_with_check_and_move_html(content, html_content, move_duplicates);

                // 只有在真正添加了新内容且非粘贴状态下才播放复制音效
                if was_added && !is_pasting_internal() && !is_existing {
                    crate::sound_manager::play_copy_sound();
                }

                // 通知前端
                if was_added {
                    // 获取最新添加的项目（索引0）
                    if let Ok(items) = crate::database::get_clipboard_history(Some(1)) {
                        if let Some(latest_item) = items.first() {
                            use tauri::Emitter;
                            #[derive(Clone, serde::Serialize)]
                            struct ClipboardUpdatePayload {
                                item: crate::database::ClipboardItem,
                                is_new: bool,
                            }
                            
                            // 根据是否已存在来判断发送哪个事件
                            if is_existing {
                                // 已存在的内容被移动到前面
                                let payload = ClipboardUpdatePayload {
                                    item: latest_item.clone(),
                                    is_new: false,
                                };
                                
                                if let Err(e) = app_handle.emit("clipboard-item-moved", payload) {
                                    println!("发射剪贴板移动事件失败: {}", e);
                                }
                            } else {
                                // 新增的内容
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

        // 等待一段时间再检查
        thread::sleep(Duration::from_millis(200));
    }

    println!("剪贴板监听循环结束");
}

// Windows HTML剪贴板读取函数
#[cfg(windows)]
fn try_get_windows_clipboard_html() -> Option<String> {
    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return None;
        }

        let mut result = None;

        // 注册HTML格式
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
                                // 仅提取片段，统一图片内联在入库时处理
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



// 从Windows HTML格式中提取HTML片段
#[cfg(windows)]
fn extract_html_fragment(html_format: &str) -> String {
    // Windows HTML格式包含头部信息，需要提取实际的HTML内容
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
    
    // 如果无法解析头部信息，尝试查找<html>或其他HTML标签
    if html_format.contains("<html") || html_format.contains("<HTML") {
        if let Some(html_start) = html_format.find("<html") {
            return html_format[html_start..].to_string();
        }
        if let Some(html_start) = html_format.find("<HTML") {
            return html_format[html_start..].to_string();
        }
    }
    
    // 最后尝试查找任何HTML标签
    if html_format.contains('<') && html_format.contains('>') {
        return html_format.to_string();
    }
    
    // 如果都没找到，返回原始内容
    html_format.to_string()
}


// 获取剪贴板内容（文本、HTML、图片或文件）
fn get_clipboard_content(clipboard: &mut Clipboard) -> Option<(String, Option<String>)> {
    // 首先尝试获取文件
    if let Ok(file_paths) = crate::file_handler::get_clipboard_files() {
        if !file_paths.is_empty() {
            // 检查是否所有文件都来自图片缓存目录
            let all_from_cache = file_paths.iter().all(|path| is_from_image_cache(path));

            // 如果所有文件都来自图片缓存目录，检查是否与上次相同
            if all_from_cache {
                let mut last_ignored = LAST_IGNORED_CACHE_FILES.lock().unwrap();

                // 检查文件路径是否与上次相同
                let paths_changed = last_ignored.len() != file_paths.len()
                    || !file_paths.iter().all(|path| last_ignored.contains(path));

                if paths_changed {
                    // 文件路径发生了变化，更新记录
                    *last_ignored = file_paths.clone();
                }
                // 无论是否变化，都忽略这次剪贴板变化
                return None;
            } else {
                // 不是缓存文件，清空上次忽略的记录
                let mut last_ignored = LAST_IGNORED_CACHE_FILES.lock().unwrap();
                last_ignored.clear();
            }

            // 处理文件列表
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

                // 序列化文件数据
                if let Ok(json_str) = serde_json::to_string(&file_data) {
                    return Some((format!("files:{}", json_str), None));
                }
            }
        }
    }

    // 尝试获取文本和HTML
    if let Ok(text) = clipboard.get_text() {
        // 过滤空白内容：检查去除空白字符后是否为空
        if !text.is_empty() && !text.trim().is_empty() {
            // 尝试获取HTML格式
            #[cfg(windows)]
            let html_content = try_get_windows_clipboard_html();
            #[cfg(not(windows))]
            let html_content = None;
            
            // 直接使用系统提供的纯文本
            return Some((text, html_content));
        }
    }

    // 尝试获取图片
    if clipboard_history::is_save_images() {
        // 尝试Windows特定的方法获取图片
        #[cfg(windows)]
        if let Some(img) = try_get_windows_clipboard_image() {
            let data_url = image_to_data_url(&img);

            // 尝试使用图片管理器保存图片
            if let Ok(image_manager) = get_image_manager() {
                if let Ok(manager) = image_manager.lock() {
                    match manager.save_image(&data_url) {
                        Ok(image_info) => {
                            return Some((format!("image:{}", image_info.id), None));
                        }
                        Err(e) => {
                            println!("保存图片失败: {}, 使用原始data URL", e);
                            return Some((data_url, None));
                        }
                    }
                }
            }
            return Some((data_url, None));
        }

        // 回退到arboard方法
        if let Ok(img) = clipboard.get_image() {
            println!(
                "通过arboard成功获取剪贴板图片: {}x{}",
                img.width, img.height
            );
            // 将图片转换为 data URL
            let data_url = image_to_data_url(&img);

            // 尝试使用图片管理器保存图片
            if let Ok(image_manager) = get_image_manager() {
                if let Ok(manager) = image_manager.lock() {
                    match manager.save_image(&data_url) {
                        Ok(image_info) => {
                            // 返回图片引用而不是完整的data URL
                            return Some((format!("image:{}", image_info.id), None));
                        }
                        Err(e) => {
                            println!("保存图片失败: {}, 使用原始data URL", e);
                            return Some((data_url, None));
                        }
                    }
                }
            }

            // 如果图片管理器不可用，回退到原始方式
            return Some((data_url, None));
        }
    }

    None
}


// 开始粘贴操作 - 增加粘贴计数器
pub fn start_pasting_operation() {
    PASTING_COUNT.fetch_add(1, Ordering::Relaxed);
}

// 结束粘贴操作 - 减少粘贴计数器
pub fn end_pasting_operation() {
    PASTING_COUNT.fetch_sub(1, Ordering::Relaxed);
}

// 检查是否正在粘贴（内部使用）
fn is_pasting_internal() -> bool {
    PASTING_COUNT.load(Ordering::Relaxed) > 0
}

// 检查是否正在粘贴（公开接口）
pub fn is_currently_pasting() -> bool {
    PASTING_COUNT.load(Ordering::Relaxed) > 0
}

// 初始化最后的剪贴板内容，避免启动时重复添加
pub fn initialize_last_content(content: String) {
    if let Ok(mut last_content) = LAST_CLIPBOARD_CONTENT.lock() {
        *last_content = content;
    }
}

// 初始化剪贴板状态 - 获取当前剪贴板内容并添加到历史记录，同时初始化监听器状态
pub fn initialize_clipboard_state() {
    if let Ok(mut clipboard) = Clipboard::new() {
        // 使用与监听器相同的逻辑获取剪贴板内容
        if let Some((content, html_content)) = get_clipboard_content(&mut clipboard) {
            // 过滤空白内容：检查去除空白字符后是否为空
            if !content.trim().is_empty() {
                // 使用与监听器相同的逻辑：检查重复并决定是否添加/移动
                // 初始化时不移动重复内容，只是确保内容在历史记录中
                let _was_added =
                    clipboard_history::add_to_history_with_check_and_move_html(content.clone(), html_content, false);
                // 初始化监听器的最后内容，避免重复添加
                initialize_last_content(content);
            }
        }
    }
}

// 检查文件路径是否来自图片缓存目录
fn is_from_image_cache(file_path: &str) -> bool {
    // 白名单
    if file_path.contains("scrolling_screenshots") || file_path.contains("pin_images") {
        return false;
    }
    
    // 获取图片缓存目录路径
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

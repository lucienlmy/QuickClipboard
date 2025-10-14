use arboard::Clipboard;
use base64::{engine::general_purpose as b64_engine, Engine as _};
use image::{ImageBuffer, Rgba};
use once_cell::sync::Lazy;
use std::sync::Mutex;

const CF_DIB: u32 = 8;

pub static CLIPBOARD_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

pub fn image_to_data_url(image: &arboard::ImageData) -> String {
    use image::codecs::png::PngEncoder;
    use image::{ExtendedColorType, ImageEncoder};
    
    let buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(
        image.width as u32,
        image.height as u32,
        image.bytes.clone().into_owned(),
    )
    .expect("无法创建图像缓冲区");
    
    let mut png_bytes: Vec<u8> = Vec::new();
    let encoder = PngEncoder::new(&mut png_bytes);
    let _ = encoder.write_image(
        buffer.as_raw(),
        image.width as u32,
        image.height as u32,
        ExtendedColorType::Rgba8
    );
    
    let b64 = b64_engine::STANDARD.encode(png_bytes);
    format!("data:image/png;base64,{}", b64)
}

pub fn data_url_to_bgra_and_png(data_url: &str) -> Result<(Vec<u8>, Vec<u8>, u32, u32), String> {
    let comma = data_url
        .find(',')
        .ok_or_else(|| "无效Data URL".to_string())?;
    let encoded = &data_url[(comma + 1)..];
    let png_bytes = b64_engine::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Base64解码失败: {}", e))?;

    let img = image::load_from_memory(&png_bytes)
        .map_err(|e| format!("解析PNG失败: {}", e))?
        .to_rgba8();
    let (width, height) = img.dimensions();
    let mut bgra: Vec<u8> = Vec::with_capacity((width * height * 4) as usize);
    for px in img.pixels() {
        let [r, g, b, a] = px.0;
        bgra.extend_from_slice(&[b, g, r, a]);
    }
    Ok((bgra, png_bytes, width, height))
}

#[cfg(windows)]
pub fn set_windows_clipboard_image(
    bgra: &[u8],
    png_bytes: &[u8],
    width: u32,
    height: u32,
) -> Result<(), String> {
    set_windows_clipboard_image_with_file(bgra, png_bytes, width, height, None)
}

#[cfg(windows)]
pub fn set_windows_clipboard_image_with_file(
    bgra: &[u8],
    png_bytes: &[u8],
    width: u32,
    height: u32,
    file_path: Option<&str>,
) -> Result<(), String> {
    use windows::core::w;
    use windows::Win32::Foundation::{HANDLE, HWND};
    use windows::Win32::System::DataExchange::{
        EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    const MAX_IMAGE_SIZE: usize = 100 * 1024 * 1024;
    if bgra.len() > MAX_IMAGE_SIZE || png_bytes.len() > MAX_IMAGE_SIZE {
        return Err("图片太大，超过100MB限制".to_string());
    }

    // 获取全局锁，防止并发访问剪贴板
    let _lock = CLIPBOARD_LOCK.lock().map_err(|e| format!("获取剪贴板锁失败: {}", e))?;

    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return Err("打开剪贴板失败".into());
        }
        
        let _guard = ClipboardGuard;
        
        if EmptyClipboard().is_err() {
            return Err("清空剪贴板失败".into());
        }

        let mut dib: Vec<u8> = Vec::with_capacity(40 + bgra.len());
        dib.extend_from_slice(&(40u32).to_le_bytes());
        dib.extend_from_slice(&(width as i32).to_le_bytes());
        dib.extend_from_slice(&(-(height as i32)).to_le_bytes());
        dib.extend_from_slice(&(1u16).to_le_bytes());
        dib.extend_from_slice(&(32u16).to_le_bytes());
        dib.extend_from_slice(&(0u32).to_le_bytes());
        dib.extend_from_slice(&(0u32).to_le_bytes());
        dib.extend_from_slice(&(0i32).to_le_bytes());
        dib.extend_from_slice(&(0i32).to_le_bytes());
        dib.extend_from_slice(&(0u32).to_le_bytes());
        dib.extend_from_slice(&(0u32).to_le_bytes());
        dib.extend_from_slice(bgra);
        match GlobalAlloc(GMEM_MOVEABLE, dib.len()) {
            Ok(hmem_dib) if !hmem_dib.0.is_null() => {
                let ptr = GlobalLock(hmem_dib);
                if ptr.is_null() {
                    return Err("锁定DIB内存失败".to_string());
                }
                
                std::ptr::copy_nonoverlapping(dib.as_ptr(), ptr as *mut u8, dib.len());
                let _ = GlobalUnlock(hmem_dib);
                
                if SetClipboardData(CF_DIB, HANDLE(hmem_dib.0 as isize)).is_err() {
                    return Err("设置DIB数据到剪贴板失败".to_string());
                }
            }
            _ => return Err("分配DIB内存失败".to_string()),
        }

        let fmt_png = RegisterClipboardFormatW(w!("PNG"));
        if fmt_png != 0 {
            match GlobalAlloc(GMEM_MOVEABLE, png_bytes.len()) {
                Ok(hmem_png) if !hmem_png.0.is_null() => {
                    let ptr = GlobalLock(hmem_png);
                    if ptr.is_null() {
                        eprintln!("锁定PNG内存失败");
                    } else {
                        std::ptr::copy_nonoverlapping(png_bytes.as_ptr(), ptr as *mut u8, png_bytes.len());
                        let _ = GlobalUnlock(hmem_png);
                        
                        if SetClipboardData(fmt_png, HANDLE(hmem_png.0 as isize)).is_err() {
                            eprintln!("设置PNG数据失败");
                        }
                    }
                }
                _ => eprintln!("分配PNG内存失败"),
            }
        }

        if let Some(path) = file_path {
            if let Err(e) = set_clipboard_hdrop_internal(&[path.to_string()]) {
                eprintln!("设置文件路径失败: {}", e);
            }
        }
    }
    
    Ok(())
}

#[cfg(windows)]
struct ClipboardGuard;

#[cfg(windows)]
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            use windows::Win32::System::DataExchange::CloseClipboard;
            let _ = CloseClipboard();
        }
    }
}

#[cfg(windows)]
fn set_clipboard_hdrop_internal(file_paths: &[String]) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::DataExchange::SetClipboardData;
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::CF_HDROP;

    unsafe {
        let mut total_size = std::mem::size_of::<windows::Win32::UI::Shell::DROPFILES>();
        for path in file_paths {
            let wide_path: Vec<u16> = OsStr::new(path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            total_size += wide_path.len() * 2;
        }
        total_size += 2;

        let hmem = GlobalAlloc(GMEM_MOVEABLE, total_size)
            .map_err(|e| format!("GlobalAlloc失败: {}", e))?;

        if hmem.is_invalid() {
            return Err("无法分配内存".to_string());
        }

        let ptr = GlobalLock(hmem);
        if ptr.is_null() {
            return Err("无法锁定内存".to_string());
        }

        let dropfiles = ptr as *mut windows::Win32::UI::Shell::DROPFILES;
        (*dropfiles).pFiles = std::mem::size_of::<windows::Win32::UI::Shell::DROPFILES>() as u32;
        (*dropfiles).pt.x = 0;
        (*dropfiles).pt.y = 0;
        (*dropfiles).fNC = windows::Win32::Foundation::BOOL(0);
        (*dropfiles).fWide = windows::Win32::Foundation::BOOL(1);

        let mut offset = std::mem::size_of::<windows::Win32::UI::Shell::DROPFILES>();
        for path in file_paths {
            let wide_path: Vec<u16> = OsStr::new(path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let dest_ptr = (ptr as *mut u8).add(offset) as *mut u16;
            std::ptr::copy_nonoverlapping(wide_path.as_ptr(), dest_ptr, wide_path.len());
            offset += wide_path.len() * 2;
        }

        let final_ptr = (ptr as *mut u8).add(offset) as *mut u16;
        *final_ptr = 0;

        let _ = GlobalUnlock(hmem);

        if SetClipboardData(CF_HDROP.0 as u32, HANDLE(hmem.0 as isize)).is_err() {
            return Err("设置剪贴板数据失败".to_string());
        }

        Ok(())
    }
}

///设置纯文本和HTML格式到剪贴板
#[cfg(windows)]
fn set_windows_clipboard_both_formats(plain_text: &str, html: &str) -> Result<(), String> {
    use windows::core::w;
    use windows::Win32::Foundation::{HANDLE, HGLOBAL, HWND};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return Err("打开剪贴板失败".into());
        }
        let _ = EmptyClipboard();
        let wide_text: Vec<u16> = plain_text.encode_utf16().chain(std::iter::once(0)).collect();
        let unicode_hmem: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, wide_text.len() * 2)
            .map_err(|e| format!("GlobalAlloc Unicode失败: {e}"))?;
        if !unicode_hmem.0.is_null() {
            let ptr = GlobalLock(unicode_hmem) as *mut u16;
            if !ptr.is_null() {
                std::ptr::copy_nonoverlapping(wide_text.as_ptr(), ptr, wide_text.len());
                let _ = GlobalUnlock(unicode_hmem);
                let _ = SetClipboardData(13, HANDLE(unicode_hmem.0 as isize)); // CF_UNICODETEXT = 13
            }
        }
        let text_bytes = plain_text.as_bytes();
        let text_hmem: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, text_bytes.len() + 1)
            .map_err(|e| format!("GlobalAlloc文本失败: {e}"))?;
        if !text_hmem.0.is_null() {
            let ptr = GlobalLock(text_hmem) as *mut u8;
            if !ptr.is_null() {
                std::ptr::copy_nonoverlapping(text_bytes.as_ptr(), ptr, text_bytes.len());
                *ptr.add(text_bytes.len()) = 0; // null terminator
                let _ = GlobalUnlock(text_hmem);
                let _ = SetClipboardData(1, HANDLE(text_hmem.0 as isize)); // CF_TEXT = 1
            }
        }
        let fmt_html = RegisterClipboardFormatW(w!("HTML Format"));
        if fmt_html != 0 {
            // 创建符合Windows标准的HTML格式
            let html_with_header = create_windows_html_format(html);
            let html_bytes = html_with_header.as_bytes();
            let html_hmem: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, html_bytes.len() + 1)
                .map_err(|e| format!("GlobalAlloc HTML失败: {e}"))?;
            if !html_hmem.0.is_null() {
                let ptr = GlobalLock(html_hmem) as *mut u8;
                if !ptr.is_null() {
                    std::ptr::copy_nonoverlapping(html_bytes.as_ptr(), ptr, html_bytes.len());
                    *ptr.add(html_bytes.len()) = 0;
                    let _ = GlobalUnlock(html_hmem);
                    let _ = SetClipboardData(fmt_html, HANDLE(html_hmem.0 as isize));
                }
            }
        }

        let _ = CloseClipboard();
    }
    
    Ok(())
}

/// 创建Windows标准HTML格式
#[cfg(windows)]
fn create_windows_html_format(html: &str) -> String {
    let fixed_html = fix_image_urls(html);

    let full_html = format!(
        "<html>\r\n<body>\r\n<!--StartFragment-->{}<!--EndFragment-->\r\n</body>\r\n</html>",
        fixed_html
    );
    
    // 计算各部分的字节偏移
    let version = "Version:0.9";
    let start_html_tag = "StartHTML:";
    let end_html_tag = "EndHTML:";
    let start_fragment_tag = "StartFragment:";
    let end_fragment_tag = "EndFragment:";

    let header_template = format!("{}\r\n{}00000000\r\n{}00000000\r\n{}00000000\r\n{}00000000\r\n",
        version, start_html_tag, end_html_tag, start_fragment_tag, end_fragment_tag);
    
    let header_length = header_template.len();
    let html_start = header_length;
    let html_end = html_start + full_html.len();

    let fragment_start = if let Some(pos) = full_html.find("<!--StartFragment-->") {
        header_length + pos + "<!--StartFragment-->".len()
    } else {
        html_start
    };
    
    let fragment_end = if let Some(pos) = full_html.find("<!--EndFragment-->") {
        header_length + pos
    } else {
        html_end
    };
    
    // 创建最终的Windows HTML格式
    format!("{}\r\n{}{:08}\r\n{}{:08}\r\n{}{:08}\r\n{}{:08}\r\n{}",
        version,
        start_html_tag, html_start,
        end_html_tag, html_end,
        start_fragment_tag, fragment_start,
        end_fragment_tag, fragment_end,
        full_html
    )
}

fn fix_image_urls(html: &str) -> String {
    use regex::Regex;
    let mut fixed = html.to_string();
    if let Ok(re) = Regex::new(r#"src="image-id:([^"]+)""#) {
        fixed = re.replace_all(&fixed, |caps: &regex::Captures| {
            let image_id = &caps[1];
            
            // 尝试从图片管理器加载图片
            if let Ok(manager_result) = crate::image_manager::get_image_manager() {
                if let Ok(guard) = manager_result.lock() {
                    if let Ok(data_url) = guard.get_image_data_url(image_id) {
                        return format!("src=\"{}\"", data_url);
                    }
                }
            }
            caps[0].to_string()
        }).to_string();
    }
    fixed = fixed.replace("src=\"//", "src=\"https://")
                 .replace("data-original=\"//", "data-original=\"https://");
    let base_domain = if fixed.contains("mcmod.cn") {
        "https://www.mcmod.cn"
    } else if fixed.contains("githubusercontent.com") {
        "https://raw.githubusercontent.com"
    } else {
        "https://www.mcmod.cn"
    };
    fixed = fixed.replace("src=\"/", &format!("src=\"{}/", base_domain))
                 .replace("data-original=\"/", &format!("data-original=\"{}/", base_domain));
    fixed = fixed.replace(&format!("{}/images/cursor/", base_domain), "https://www.mcmod.cn/images/cursor/");
    
    // 修复 src="domain.com/path" 格式的链接
    if let Ok(re) = Regex::new(r#"src="([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^"]*)"#) {
        fixed = re.replace_all(&fixed, |caps: &regex::Captures| {
            let url = &caps[1];
            if !url.starts_with("http://") && !url.starts_with("https://") {
                format!("src=\"https://{}\"", url)
            } else {
                caps[0].to_string()
            }
        }).to_string();
    }
    if let Ok(re) = Regex::new(r#"data-original="([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^"]*)"#) {
        fixed = re.replace_all(&fixed, |caps: &regex::Captures| {
            let url = &caps[1];
            if !url.starts_with("http://") && !url.starts_with("https://") {
                format!("data-original=\"https://{}\"", url)
            } else {
                caps[0].to_string()
            }
        }).to_string();
    }
    
    fixed
}

/// 自动判断文本/图片并设置剪贴板内容
pub fn set_clipboard_content(content: String) -> Result<(), String> {
    set_clipboard_content_internal(content, true)
}

/// 设置剪贴板内容（包含HTML格式）
pub fn set_clipboard_content_with_html(content: String, html_content: Option<String>) -> Result<(), String> {
    set_clipboard_content_with_html_internal(content, html_content, true)
}

/// 设置剪贴板内容但不添加到历史记录（用于避免重复添加）
pub fn set_clipboard_content_no_history(content: String) -> Result<(), String> {
    set_clipboard_content_internal(content, false)
}

/// 设置剪贴板内容但不添加到历史记录（包含HTML格式）
pub fn set_clipboard_content_no_history_with_html(content: String, html_content: Option<String>) -> Result<(), String> {
    set_clipboard_content_with_html_internal(content, html_content, false)
}

/// 内部函数：设置剪贴板内容（包含HTML格式）
fn set_clipboard_content_with_html_internal(content: String, html_content: Option<String>, add_to_history: bool) -> Result<(), String> {
    if content.starts_with("data:image/") {
        return set_clipboard_content_internal(content, add_to_history);
    } else if content.starts_with("image:") {
        return set_clipboard_content_internal(content, add_to_history);
    } else {
        if let Some(html) = &html_content {
            #[cfg(windows)]
            {
                set_windows_clipboard_both_formats(&content, html)?;
            }
        } else {
            // 只有纯文本
            match Clipboard::new() {
                Ok(mut clipboard) => {
                    clipboard
                        .set_text(content.clone())
                        .map_err(|e| format!("设置剪贴板文本失败: {}", e))?;
                }
                Err(e) => return Err(format!("获取剪贴板失败: {}", e)),
            }
        }
    }
    if add_to_history {
        println!("剪贴板内容已设置，将由监听器自动添加到历史记录");
    }

    Ok(())
}

/// 内部函数：设置剪贴板内容
fn set_clipboard_content_internal(content: String, add_to_history: bool) -> Result<(), String> {
    if content.starts_with("data:image/") {
        let (bgra, png_bytes, width, height) = data_url_to_bgra_and_png(&content)?;
        set_windows_clipboard_image(&bgra, &png_bytes, width, height)?;
    } else if content.starts_with("image:") {
        let image_id = content.strip_prefix("image:").unwrap_or("");

        // 从图片管理器获取图片数据和文件路径
        use crate::image_manager::get_image_manager;
        let image_manager = get_image_manager()?;
        let manager = image_manager
            .lock()
            .map_err(|e| format!("获取图片管理器锁失败: {}", e))?;

        let (bgra, png_bytes, width, height) = manager.get_image_bgra_and_png(image_id)?;
        let file_path = manager.get_image_file_path(image_id)?;
        drop(manager);

        set_windows_clipboard_image_with_file(
            &bgra,
            &png_bytes,
            width,
            height,
            Some(&file_path),
        )?;
        return Ok(());
    } else {
        match Clipboard::new() {
            Ok(mut clipboard) => {
                clipboard
                    .set_text(content.clone())
                    .map_err(|e| format!("设置剪贴板文本失败: {}", e))?;
            }
            Err(e) => return Err(format!("获取剪贴板失败: {}", e)),
        }
    }
    if add_to_history {
        println!("剪贴板内容已设置，将由监听器自动添加到历史记录");
    }

    Ok(())
}

// 文件处理模块 - 处理文件复制、图标获取等功能

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_directory: bool,
    pub icon_data: Option<String>, // Base64编码的图标数据
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileClipboardData {
    pub files: Vec<FileInfo>,
    pub operation: String, // "copy" 或 "cut"
}

// 将文件路径写入剪贴板
#[cfg(windows)]
pub fn set_clipboard_files(file_paths: &[String]) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::{HANDLE, HWND};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::CF_HDROP;

    unsafe {
        // 打开剪贴板
        if OpenClipboard(HWND(0)).is_err() {
            return Err("无法打开剪贴板".to_string());
        }

        // 清空剪贴板
        if EmptyClipboard().is_err() {
            let _ = CloseClipboard();
            return Err("无法清空剪贴板".to_string());
        }

        // 计算所需内存大小
        let mut total_size = std::mem::size_of::<windows::Win32::UI::Shell::DROPFILES>();
        for path in file_paths {
            let wide_path: Vec<u16> = OsStr::new(path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            total_size += wide_path.len() * 2; // UTF-16 字符
        }
        total_size += 2; // 双重空终止符

        // 分配全局内存
        let hmem = match GlobalAlloc(GMEM_MOVEABLE, total_size) {
            Ok(h) => h,
            Err(_) => {
                let _ = CloseClipboard();
                return Err("无法分配内存".to_string());
            }
        };

        if hmem.is_invalid() {
            let _ = CloseClipboard();
            return Err("无法分配内存".to_string());
        }

        let ptr = GlobalLock(hmem);
        if ptr.is_null() {
            let _ = CloseClipboard();
            return Err("无法锁定内存".to_string());
        }

        // 设置 DROPFILES 结构
        let dropfiles = ptr as *mut windows::Win32::UI::Shell::DROPFILES;
        (*dropfiles).pFiles = std::mem::size_of::<windows::Win32::UI::Shell::DROPFILES>() as u32;
        (*dropfiles).pt.x = 0;
        (*dropfiles).pt.y = 0;
        (*dropfiles).fNC = windows::Win32::Foundation::BOOL(0);
        (*dropfiles).fWide = windows::Win32::Foundation::BOOL(1); // Unicode

        // 写入文件路径
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

        // 添加双重空终止符
        let final_ptr = (ptr as *mut u8).add(offset) as *mut u16;
        *final_ptr = 0;

        let _ = GlobalUnlock(hmem);

        // 设置剪贴板数据
        if SetClipboardData(CF_HDROP.0 as u32, HANDLE(hmem.0 as isize)).is_err() {
            let _ = CloseClipboard();
            return Err("无法设置剪贴板数据".to_string());
        }

        let _ = CloseClipboard();
        Ok(())
    }
}

#[cfg(not(windows))]
pub fn set_clipboard_files(_file_paths: &[String]) -> Result<(), String> {
    Err("当前平台不支持文件剪贴板操作".to_string())
}

// 从剪贴板获取文件路径列表
#[cfg(windows)]
pub fn get_clipboard_files() -> Result<Vec<String>, String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::UI::Shell::DragQueryFileW;

    unsafe {
        // 打开剪贴板
        if OpenClipboard(HWND(0)).is_err() {
            return Err("无法打开剪贴板".to_string());
        }

        let mut files = Vec::new();

        // 检查是否有文件格式
        if IsClipboardFormatAvailable(CF_HDROP.0 as u32).is_ok() {
            // 获取文件数据
            if let Ok(hdrop) = GetClipboardData(CF_HDROP.0 as u32) {
                if !hdrop.is_invalid() {
                    let hdrop_ptr = GlobalLock(windows::Win32::Foundation::HGLOBAL(
                        hdrop.0 as *mut core::ffi::c_void,
                    ));
                    if !hdrop_ptr.is_null() {
                        // 获取文件数量
                        let file_count = DragQueryFileW(
                            windows::Win32::UI::Shell::HDROP(hdrop_ptr as isize),
                            0xFFFFFFFF,
                            None,
                        );

                        for i in 0..file_count {
                            // 获取文件路径长度
                            let path_len = DragQueryFileW(
                                windows::Win32::UI::Shell::HDROP(hdrop_ptr as isize),
                                i,
                                None,
                            );
                            if path_len > 0 {
                                // 获取文件路径
                                let mut buffer = vec![0u16; (path_len + 1) as usize];
                                let actual_len = DragQueryFileW(
                                    windows::Win32::UI::Shell::HDROP(hdrop_ptr as isize),
                                    i,
                                    Some(buffer.as_mut_slice()),
                                );

                                if actual_len > 0 {
                                    buffer.truncate(actual_len as usize);
                                    let os_string = OsString::from_wide(&buffer);
                                    if let Some(path_str) = os_string.to_str() {
                                        files.push(path_str.to_string());
                                    }
                                }
                            }
                        }

                        let _ = GlobalUnlock(windows::Win32::Foundation::HGLOBAL(
                            hdrop.0 as *mut core::ffi::c_void,
                        ));
                    }
                }
            }
        }

        let _ = CloseClipboard();
        Ok(files)
    }
}

#[cfg(not(windows))]
pub fn get_clipboard_files() -> Result<Vec<String>, String> {
    // 非Windows平台暂不支持
    Err("当前平台不支持文件剪贴板操作".to_string())
}

// 获取文件信息
pub fn get_file_info(path: &str) -> Result<FileInfo, String> {
    let path_buf = PathBuf::from(path);

    if !path_buf.exists() {
        return Err(format!("文件不存在: {}", path));
    }

    let metadata = fs::metadata(&path_buf).map_err(|e| format!("获取文件元数据失败: {}", e))?;

    let name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("未知文件")
        .to_string();

    let is_directory = metadata.is_dir();
    let size = metadata.len();

    // 获取文件类型
    let file_type = if is_directory {
        "文件夹".to_string()
    } else {
        path_buf
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_uppercase())
            .unwrap_or_else(|| "文件".to_string())
    };

    // 获取文件图标
    let icon_data = get_file_icon(path)?;

    Ok(FileInfo {
        path: path.to_string(),
        name,
        size,
        is_directory,
        icon_data: Some(icon_data),
        file_type,
    })
}

// 获取文件图标（Windows系统图标）
#[cfg(windows)]
pub fn get_file_icon(path: &str) -> Result<String, String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, ReleaseDC,
        SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use windows::Win32::UI::Shell::{
        SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_USEFILEATTRIBUTES,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};

    let path_obj = Path::new(path);

    
    // 如果文件不存在，使用扩展名获取图标
    let use_file_attributes = !path_obj.exists();

    // 转换路径为 Windows 宽字符
    let wide_path: Vec<u16> = OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut file_info: SHFILEINFOW = std::mem::zeroed();
        let mut flags = SHGFI_ICON;

        if use_file_attributes {
            flags |= SHGFI_USEFILEATTRIBUTES;
        }

        use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;

        let result = SHGetFileInfoW(
            windows::core::PCWSTR(wide_path.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut file_info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        );

        // 如果第一次失败且文件存在，尝试使用SHGFI_USEFILEATTRIBUTES标志重试
        if (result == 0 || file_info.hIcon.is_invalid()) && path_obj.exists() && !use_file_attributes {
            
            let mut file_info_retry: SHFILEINFOW = std::mem::zeroed();
            let flags_retry = SHGFI_ICON | SHGFI_USEFILEATTRIBUTES;
            
            let result_retry = SHGetFileInfoW(
                windows::core::PCWSTR(wide_path.as_ptr()),
                FILE_FLAGS_AND_ATTRIBUTES(0),
                Some(&mut file_info_retry),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                flags_retry,
            );
            
            if result_retry != 0 && !file_info_retry.hIcon.is_invalid() {
                // 重试成功，使用重试的结果
                file_info = file_info_retry;
            } else {
                // 重试也失败，回退到简单图标
                return Ok(get_fallback_icon(path));
            }
        } else if result == 0 || file_info.hIcon.is_invalid() {
            // 如果获取系统图标失败，回退到简单图标
            return Ok(get_fallback_icon(path));
        }

        // 获取图标信息
        let mut icon_info: ICONINFO = std::mem::zeroed();
        if GetIconInfo(file_info.hIcon, &mut icon_info).is_err() {
            let _ = DestroyIcon(file_info.hIcon);
            return Ok(get_fallback_icon(path));
        }

        // 创建设备上下文
        let screen_dc = GetDC(HWND(0));
        let mem_dc = CreateCompatibleDC(screen_dc);

        if mem_dc.is_invalid() {
            let _ = ReleaseDC(HWND(0), screen_dc);
            let _ = DeleteObject(icon_info.hbmColor);
            let _ = DeleteObject(icon_info.hbmMask);
            let _ = DestroyIcon(file_info.hIcon);
            return Ok(get_fallback_icon(path));
        }

        // 创建兼容位图 (32x32 像素)
        let icon_size = 64;
        let bitmap = CreateCompatibleBitmap(screen_dc, icon_size, icon_size);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(HWND(0), screen_dc);
            let _ = DeleteObject(icon_info.hbmColor);
            let _ = DeleteObject(icon_info.hbmMask);
            let _ = DestroyIcon(file_info.hIcon);
            return Ok(get_fallback_icon(path));
        }

        let old_bitmap = SelectObject(mem_dc, bitmap);

        // 绘制图标到位图
        use windows::Win32::UI::WindowsAndMessaging::DrawIconEx;
        let draw_result = DrawIconEx(
            mem_dc,
            0,
            0,
            file_info.hIcon,
            icon_size,
            icon_size,
            0,
            windows::Win32::Graphics::Gdi::HBRUSH(0),
            windows::Win32::UI::WindowsAndMessaging::DI_NORMAL,
        );

        if draw_result.is_err() {
            let _ = SelectObject(mem_dc, old_bitmap);
            let _ = DeleteObject(bitmap);
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(HWND(0), screen_dc);
            let _ = DeleteObject(icon_info.hbmColor);
            let _ = DeleteObject(icon_info.hbmMask);
            let _ = DestroyIcon(file_info.hIcon);
            return Ok(get_fallback_icon(path));
        }

        // 获取位图数据
        let mut bmp_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: icon_size,
                biHeight: -icon_size, // 负值表示自上而下
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [windows::Win32::Graphics::Gdi::RGBQUAD::default(); 1],
        };

        let mut pixel_data: Vec<u8> = vec![0; (icon_size * icon_size * 4) as usize];

        use windows::Win32::Graphics::Gdi::GetDIBits;
        let bits_result = GetDIBits(
            mem_dc,
            bitmap,
            0,
            icon_size as u32,
            Some(pixel_data.as_mut_ptr() as *mut _),
            &mut bmp_info,
            DIB_RGB_COLORS,
        );

        // 清理资源
        let _ = SelectObject(mem_dc, old_bitmap);
        let _ = DeleteObject(bitmap);
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(HWND(0), screen_dc);
        let _ = DeleteObject(icon_info.hbmColor);
        let _ = DeleteObject(icon_info.hbmMask);
        let _ = DestroyIcon(file_info.hIcon);

        if bits_result == 0 {
            return Ok(get_fallback_icon(path));
        }

        // 转换 BGRA 到 RGBA 并生成 PNG
        for chunk in pixel_data.chunks_mut(4) {
            chunk.swap(0, 2); // B <-> R
        }

        // 使用 image crate 创建 PNG
        match image::RgbaImage::from_raw(icon_size as u32, icon_size as u32, pixel_data) {
            Some(img) => {
                let mut png_data = Vec::new();
                match img.write_to(
                    &mut std::io::Cursor::new(&mut png_data),
                    image::ImageFormat::Png,
                ) {
                    Ok(_) => {
                        use base64::{engine::general_purpose, Engine as _};
                        let base64_data = general_purpose::STANDARD.encode(&png_data);
                        Ok(format!("data:image/png;base64,{}", base64_data))
                    }
                    Err(_) => {
                        Ok(get_fallback_icon(path))
                    },
                }
            }
            None => Ok(get_fallback_icon(path)),
        }
    }
}

// 回退图标函数
fn get_fallback_icon(path: &str) -> String {
    use std::path::Path;

    let path_obj = Path::new(path);

    if path_obj.is_dir() {
        get_folder_icon()
    } else {
        let extension = path_obj
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();
        get_file_icon_by_extension(&extension)
    }
}

#[cfg(not(windows))]
pub fn get_file_icon(_path: &str) -> Result<String, String> {
    // 非Windows平台返回默认图标
    Ok(get_default_file_icon())
}

// 获取文件夹图标
fn get_folder_icon() -> String {
    // 简单的文件夹图标 SVG，转换为 base64
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIgM0gyVjEzSDEzVjVINy41TDYgM0gyWiIgZmlsbD0iIzU0OUJGRiIvPgo8L3N2Zz4K".to_string()
}

// 根据文件扩展名获取图标
fn get_file_icon_by_extension(extension: &str) -> String {
    match extension {
        "txt" | "md" | "log" => get_text_file_icon(),
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" | "webp" => get_image_file_icon(),
        "mp4" | "avi" | "mkv" | "mov" | "wmv" | "flv" => get_video_file_icon(),
        "mp3" | "wav" | "flac" | "aac" | "ogg" => get_audio_file_icon(),
        "pdf" => get_pdf_file_icon(),
        "doc" | "docx" => get_word_file_icon(),
        "xls" | "xlsx" => get_excel_file_icon(),
        "ppt" | "pptx" => get_powerpoint_file_icon(),
        "zip" | "rar" | "7z" | "tar" | "gz" => get_archive_file_icon(),
        "exe" | "msi" => get_executable_file_icon(),
        _ => get_default_file_icon(),
    }
}

// 各种文件类型的图标
fn get_text_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTMgMkgxMFYxNEgzVjJaIiBmaWxsPSIjRkZGRkZGIiBzdHJva2U9IiM5OTk5OTkiLz4KPHA+PC9wPgo8L3N2Zz4K".to_string()
}

fn get_image_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjRkY2QjZCIi8+Cjwvc3ZnPgo=".to_string()
}

fn get_video_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjRkY5NTAwIi8+Cjwvc3ZnPgo=".to_string()
}

fn get_audio_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjOUMzNUZGIi8+Cjwvc3ZnPgo=".to_string()
}

fn get_pdf_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjRkYwMDAwIi8+Cjwvc3ZnPgo=".to_string()
}

fn get_word_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjMjk3NEZGIi8+Cjwvc3ZnPgo=".to_string()
}

fn get_excel_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjMDBCMDUwIi8+Cjwvc3ZnPgo=".to_string()
}

fn get_powerpoint_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjRkY0NTAwIi8+Cjwvc3ZnPgo=".to_string()
}

fn get_archive_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjRkZEQjAwIi8+Cjwvc3ZnPgo=".to_string()
}

fn get_executable_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjNjY2NjY2Ii8+Cjwvc3ZnPgo=".to_string()
}

fn get_default_file_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjEyIiBoZWlnaHQ9IjEyIiBmaWxsPSIjQ0NDQ0NDIi8+Cjwvc3ZnPgo=".to_string()
}

#[allow(dead_code)]
fn get_default_image_icon() -> String {
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBmaWxsPSIjNDI4NWY0IiBzdHJva2U9IiM0Mjg1ZjQiIHN0cm9rZS13aWR0aD0iMiIgcng9IjIiLz4KPGNpcmNsZSBjeD0iOSIgY3k9IjkiIHI9IjIiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Im0yMSAxNS0zLjA4Ni0zLjA4NmEyIDIgMCAwIDAtMi44MjggMEwxMiAxNSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPC9zdmc+".to_string()
}

// 图片文件大小限制常量
#[allow(dead_code)]
const MAX_IMAGE_SIZE_FOR_DIRECT_ACCESS: u64 = 10 * 1024 * 1024; // 10MB

// 检查文件是否为图片类型
#[allow(dead_code)]
fn is_image_file(path: &str) -> bool {
    use std::path::Path;

    let path_obj = Path::new(path);
    if let Some(extension) = path_obj.extension() {
        if let Some(ext_str) = extension.to_str() {
            let ext_lower = ext_str.to_lowercase();
            return matches!(
                ext_lower.as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "tiff" | "tif" | "ico" | "svg"
            );
        }
    }
    false
}

// 检查文件大小是否适合直接访问
#[allow(dead_code)]
fn is_file_size_suitable_for_direct_access(path: &str) -> bool {
    if let Ok(metadata) = fs::metadata(path) {
        metadata.len() <= MAX_IMAGE_SIZE_FOR_DIRECT_ACCESS
    } else {
        false
    }
}

// 复制文件到目标位置
    #[allow(dead_code)]
    pub fn copy_files_to_target(files: &[String], target_dir: &str) -> Result<Vec<String>, String> {
    let target_path = Path::new(target_dir);

    if !target_path.exists() {
        return Err(format!("目标目录不存在: {}", target_dir));
    }

    if !target_path.is_dir() {
        return Err(format!("目标路径不是目录: {}", target_dir));
    }

    let mut copied_files = Vec::new();

    for file_path in files {
        let source_path = Path::new(file_path);
        if !source_path.exists() {
            continue; // 跳过不存在的文件
        }

        let file_name = source_path
            .file_name()
            .ok_or_else(|| format!("无法获取文件名: {}", file_path))?;

        let target_file_path = target_path.join(file_name);

        // 如果目标文件已存在，生成新名称
        let final_target_path = generate_unique_path(&target_file_path)?;

        if source_path.is_dir() {
            // 复制目录
            copy_dir_recursive(source_path, &final_target_path)?;
        } else {
            // 复制文件
            fs::copy(source_path, &final_target_path)
                .map_err(|e| format!("复制文件失败 {}: {}", file_path, e))?;
        }

        copied_files.push(final_target_path.to_string_lossy().to_string());
    }

    Ok(copied_files)
}

// 递归复制目录
#[allow(dead_code)]
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("创建目录失败 {}: {}", dst.display(), e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("读取目录失败 {}: {}", src.display(), e))?
    {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;

        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("复制文件失败 {}: {}", src_path.display(), e))?;
        }
    }

    Ok(())
}

// 生成唯一的文件路径（如果文件已存在，添加数字后缀）
fn generate_unique_path(path: &Path) -> Result<PathBuf, String> {
    if !path.exists() {
        return Ok(path.to_path_buf());
    }

    let parent = path.parent().unwrap_or(Path::new(""));
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("");

    for i in 1..1000 {
        let new_name = if extension.is_empty() {
            format!("{} ({})", stem, i)
        } else {
            format!("{} ({}).{}", stem, i, extension)
        };

        let new_path = parent.join(new_name);
        if !new_path.exists() {
            return Ok(new_path);
        }
    }

    Err("无法生成唯一文件名".to_string())
}

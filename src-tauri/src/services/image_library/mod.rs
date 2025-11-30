use std::{fs, path::PathBuf};
use serde::{Serialize, Deserialize};
use crate::services::get_data_directory;

const IMAGE_LIBRARY_DIR: &str = "image_library";
const IMAGES_SUBDIR: &str = "images";
const GIFS_SUBDIR: &str = "gifs";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub id: String,
    pub filename: String,
    pub path: String,
    pub size: u64,
    pub created_at: u64,
    pub category: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImageListResult {
    pub total: usize,
    pub items: Vec<ImageInfo>,
}

/// 获取图片库目录路径
pub fn get_image_library_dir() -> Result<PathBuf, String> {
    let data_dir = get_data_directory()?;
    Ok(data_dir.join(IMAGE_LIBRARY_DIR))
}

/// 获取图片子目录路径
pub fn get_images_dir() -> Result<PathBuf, String> {
    Ok(get_image_library_dir()?.join(IMAGES_SUBDIR))
}

/// 获取 GIF 子目录路径
pub fn get_gifs_dir() -> Result<PathBuf, String> {
    Ok(get_image_library_dir()?.join(GIFS_SUBDIR))
}

/// 初始化图片库目录结构
pub fn init_image_library() -> Result<(), String> {
    let images_dir = get_images_dir()?;
    let gifs_dir = get_gifs_dir()?;
    
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir)
            .map_err(|e| format!("创建图片目录失败: {}", e))?;
    }
    
    if !gifs_dir.exists() {
        fs::create_dir_all(&gifs_dir)
            .map_err(|e| format!("创建 GIF 目录失败: {}", e))?;
    }
    
    Ok(())
}

/// 通过文件头魔数判断是否为 GIF
fn is_gif_by_magic(data: &[u8]) -> bool {
    if data.len() < 6 {
        return false;
    }
    &data[0..6] == b"GIF87a" || &data[0..6] == b"GIF89a"
}

/// 通过文件头判断是否为 WebP
fn is_webp_by_magic(data: &[u8]) -> bool {
    if data.len() < 12 {
        return false;
    }
    &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP"
}

/// 检测 WebP 是否为动态图
fn is_animated_webp(data: &[u8]) -> bool {
    if !is_webp_by_magic(data) || data.len() < 30 {
        return false;
    }
    
    if data.len() >= 16 && &data[12..16] == b"VP8X" {
        if data.len() >= 21 {
            let flags = data[20];
            return (flags & 0x02) != 0;
        }
    }
    false
}

/// 将静态 WebP 转换为 JPG
fn convert_webp_to_jpg(data: &[u8]) -> Result<Vec<u8>, String> {
    use image::ImageReader;
    use std::io::Cursor;
    
    let reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|e| format!("读取 WebP 失败: {}", e))?;
    
    let img = reader.decode()
        .map_err(|e| format!("解码 WebP 失败: {}", e))?;
    
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    img.write_to(&mut cursor, image::ImageFormat::Jpeg)
        .map_err(|e| format!("编码 JPG 失败: {}", e))?;
    
    Ok(buffer)
}

/// 保存图片到图片库
pub fn save_image(filename: &str, data: &[u8]) -> Result<ImageInfo, String> {
    init_image_library()?;
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    
    let uuid_part = uuid::Uuid::new_v4().to_string();
    let uuid_short = uuid_part.split('-').next().unwrap_or("");
    
    let (final_data, extension, category): (Vec<u8>, &str, &str) = if is_gif_by_magic(data) {
        // GIF 文件直接保存
        (data.to_vec(), "gif", "gifs")
    } else if is_webp_by_magic(data) {
        if is_animated_webp(data) {
            // 动态 WebP 直接保存
            (data.to_vec(), "webp", "gifs")
        } else {
            // 静态 WebP 转 JPG
            let jpg_data = convert_webp_to_jpg(data)?;
            (jpg_data, "jpg", "images")
        }
    } else {
        // 其他格式保留原扩展名
        let ext = std::path::Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        (data.to_vec(), ext, "images")
    };
    
    let target_dir = if category == "gifs" { get_gifs_dir()? } else { get_images_dir()? };
    let new_filename = format!("{}_{}.{}", timestamp, uuid_short, extension);
    let file_path = target_dir.join(&new_filename);
    
    fs::write(&file_path, &final_data)
        .map_err(|e| format!("保存图片失败: {}", e))?;
    
    Ok(ImageInfo {
        id: new_filename.clone(),
        filename: new_filename,
        path: file_path.to_string_lossy().to_string(),
        size: final_data.len() as u64,
        created_at: timestamp as u64,
        category: category.to_string(),
    })
}

/// 获取图片列表
pub fn get_image_list(category: &str, offset: usize, limit: usize) -> Result<ImageListResult, String> {
    init_image_library()?;
    
    let (dir, cat_str) = match category {
        "gifs" => (get_gifs_dir()?, "gifs"),
        _ => (get_images_dir()?, "images"),
    };
    
    let mut items: Vec<ImageInfo> = Vec::new();
    
    if dir.exists() {
        let entries: Vec<_> = fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().is_file() && {
                    let ext = e.path().extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_lowercase())
                        .unwrap_or_default();
                    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp")
                }
            })
            .collect();
        
        let total = entries.len();
        
        let mut sorted_entries = entries;
        sorted_entries.sort_by(|a, b| {
            let time_a = a.metadata().and_then(|m| m.modified()).ok();
            let time_b = b.metadata().and_then(|m| m.modified()).ok();
            time_b.cmp(&time_a)
        });
        
        for entry in sorted_entries.into_iter().skip(offset).take(limit) {
            let path = entry.path();
            let filename = entry.file_name().to_string_lossy().to_string();
            let metadata = entry.metadata().ok();
            
            let created_at = metadata.as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            
            let size = metadata.map(|m| m.len()).unwrap_or(0);
            
            items.push(ImageInfo {
                id: filename.clone(),
                filename,
                path: path.to_string_lossy().to_string(),
                size,
                created_at,
                category: cat_str.to_string(),
            });
        }
        
        return Ok(ImageListResult { total, items });
    }
    
    Ok(ImageListResult { total: 0, items: vec![] })
}

/// 获取图片总数
pub fn get_image_count(category: &str) -> Result<usize, String> {
    init_image_library()?;
    
    let dir = match category {
        "gifs" => get_gifs_dir()?,
        _ => get_images_dir()?,
    };
    
    if !dir.exists() {
        return Ok(0);
    }
    
    let count = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().is_file() && {
                let ext = e.path().extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
                    .unwrap_or_default();
                matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp")
            }
        })
        .count();
    
    Ok(count)
}

/// 删除图片
pub fn delete_image(category: &str, filename: &str) -> Result<(), String> {
    let dir = match category {
        "gifs" => get_gifs_dir()?,
        _ => get_images_dir()?,
    };
    
    let file_path = dir.join(filename);
    
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("删除图片失败: {}", e))?;
    }
    
    Ok(())
}

/// 重命名图片
pub fn rename_image(category: &str, old_filename: &str, new_filename: &str) -> Result<ImageInfo, String> {
    let dir = match category {
        "gifs" => get_gifs_dir()?,
        _ => get_images_dir()?,
    };
    
    let old_path = dir.join(old_filename);
    if !old_path.exists() {
        return Err(format!("文件不存在: {}", old_filename));
    }
    
    let old_ext = std::path::Path::new(old_filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    
    let new_name_with_ext = if new_filename.contains('.') {
        new_filename.to_string()
    } else {
        format!("{}.{}", new_filename, old_ext)
    };
    
    let new_path = dir.join(&new_name_with_ext);
    
    if new_path.exists() {
        return Err("目标文件名已存在".to_string());
    }
    
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("重命名失败: {}", e))?;
    
    let metadata = fs::metadata(&new_path).ok();
    let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
    let created_at = metadata
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    
    Ok(ImageInfo {
        id: new_name_with_ext.clone(),
        filename: new_name_with_ext,
        path: new_path.to_string_lossy().to_string(),
        size,
        created_at,
        category: category.to_string(),
    })
}

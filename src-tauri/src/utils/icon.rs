use file_icon_provider::get_file_icon;
use image::{RgbaImage, ImageFormat};
use std::io::Cursor;
use sha2::{Sha256, Digest};

// 获取文件图标并转换为 Base64 Data URL
pub fn get_file_icon_base64(path: &str) -> Option<String> {
    match get_file_icon(path, 32) {
        Ok(icon) => {
            if is_image_file(path) {
                if let Ok(image_data) = read_image_thumbnail(path, 32) {
                    return Some(image_data);
                }
            }
            
            if let Ok(png_data) = icon_to_png(&icon) {
                use base64::{Engine as _, engine::general_purpose};
                let base64_str = general_purpose::STANDARD.encode(&png_data);
                return Some(format!("data:image/png;base64,{}", base64_str));
            }
            None
        }
        Err(_) => None,
    }
}

// 将 Icon 转换为 PNG 格式
pub fn icon_to_png(icon: &file_icon_provider::Icon) -> Result<Vec<u8>, String> {
    let img = RgbaImage::from_raw(icon.width, icon.height, icon.pixels.clone())
        .ok_or("创建图像失败")?;
    
    let mut png_data = Vec::new();
    let mut cursor = Cursor::new(&mut png_data);
    img.write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("PNG编码失败: {}", e))?;
    
    Ok(png_data)
}

// 判断是否是图片文件
pub fn is_image_file(path: &str) -> bool {
    let path_lower = path.to_lowercase();
    path_lower.ends_with(".jpg") || 
    path_lower.ends_with(".jpeg") || 
    path_lower.ends_with(".png") || 
    path_lower.ends_with(".gif") || 
    path_lower.ends_with(".bmp") || 
    path_lower.ends_with(".webp")
}

// 读取图片文件的缩略图
fn read_image_thumbnail(path: &str, size: u32) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    
    let img = image::open(path).map_err(|e| format!("读取图片失败: {}", e))?;
    let thumbnail = img.thumbnail(size, size);
    
    let mut png_data = Vec::new();
    let mut cursor = Cursor::new(&mut png_data);
    thumbnail.write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("PNG编码失败: {}", e))?;
    
    let base64_str = general_purpose::STANDARD.encode(&png_data);
    Ok(format!("data:image/png;base64,{}", base64_str))
}

// 计算图标哈希
fn calculate_icon_hash(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let hash = format!("{:x}", hasher.finalize());
    hash[..16].to_string()
}

// 保存应用图标到 app_icons 目录
pub fn save_app_icon(exe_path: &str) -> Option<String> {
    let icon = match get_file_icon(exe_path, 32) {
        Ok(icon) => icon,
        Err(_) => return None,
    };
    
    let png_data = match icon_to_png(&icon) {
        Ok(data) => data,
        Err(_) => return None,
    };

    let hash = calculate_icon_hash(&png_data);

    let data_dir = match crate::services::get_data_directory() {
        Ok(dir) => dir,
        Err(_) => return None,
    };

    let icons_dir = data_dir.join("app_icons");
    if !icons_dir.exists() {
        if std::fs::create_dir_all(&icons_dir).is_err() {
            return None;
        }
    }

    let icon_path = icons_dir.join(format!("{}.png", hash));
    if !icon_path.exists() {
        if std::fs::write(&icon_path, &png_data).is_err() {
            return None;
        }
    }
    
    Some(hash)
}

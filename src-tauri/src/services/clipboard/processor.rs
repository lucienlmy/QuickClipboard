use super::capture::{ClipboardContent, ContentType as CaptureType};
use super::content_type::{ContentType, PrimaryType, TagType};
use image::ImageFormat;
use std::io::Cursor;
use std::fs;
use std::path::Path;
use regex::Regex;
use sha2::{Sha256, Digest};
use serde::{Serialize, Deserialize};


/// 文件信息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileInfo {
    path: String,
    name: String,
    size: u64,
    is_directory: bool,
    icon_data: Option<String>,
    file_type: String,
}

/// 文件剪贴板数据
#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileClipboardData {
    files: Vec<FileInfo>,
    operation: String,
}

/// 处理后的剪贴板数据结构
pub struct ProcessedContent {
    pub content: String,              // 主要内容
    pub html_content: Option<String>, // HTML富文本内容
    pub content_type: String,         // 内容类型：text/rich_text/image/file/link
}

/// 处理剪贴板内容，将原始数据转换为可存储的格式
pub fn process_content(content: ClipboardContent) -> Result<ProcessedContent, String> {
    match content.content_type {
        // 纯文本处理
        CaptureType::Text => {
            let text = content.text.ok_or("文本内容为空")?;
            
            let mut ct = ContentType::new(PrimaryType::Text);
            
            if is_url(&text) {
                ct.add_tag(TagType::Link);
            } else if contains_links(&text) {
                ct.add_tag(TagType::Link);
            }
            
            Ok(ProcessedContent {
                content: text,
                html_content: None,
                content_type: ct.to_db_string(),
            })
        }
        
            // 富文本处理（HTML）
            CaptureType::RichText => {
                let html = content.html.ok_or("HTML内容为空")?;
                let text = content.text.unwrap_or_else(|| strip_html(&html));
                
                let mut ct = ContentType::new(PrimaryType::Text);
                
                ct.add_tag(TagType::RichText);
                
                if is_url(&text) {
                    ct.add_tag(TagType::Link);
                } else if contains_links(&text) || contains_links(&html) {
                    ct.add_tag(TagType::Link);
                }
                
                let (processed_html, _image_ids) = process_html_images(&html)?;
                
                Ok(ProcessedContent {
                    content: text,
                    html_content: Some(processed_html),
                    content_type: ct.to_db_string(),
                })
            }
        
        // 文件路径处理
        CaptureType::Files => {
            let files = content.files.ok_or("文件列表为空")?;
            
            // 获取文件详细信息
            let file_infos = collect_file_info(&files)?;
            
            // 序列化为JSON格式
            let file_data = FileClipboardData {
                files: file_infos.clone(),
                operation: "copy".to_string(),
            };
            
            let json_str = serde_json::to_string(&file_data)
                .map_err(|e| format!("序列化文件信息失败: {}", e))?;
            
            let ct = if file_infos.len() == 1 && is_image_file(&file_infos[0].path) {
                ContentType::new(PrimaryType::Image)
            } else {
                ContentType::new(PrimaryType::File)
            };
            
            Ok(ProcessedContent {
                content: format!("files:{}", json_str),
                html_content: None,
                content_type: ct.to_db_string(),
            })
        }
    }
}

/// 收集文件信息
fn collect_file_info(file_paths: &[String]) -> Result<Vec<FileInfo>, String> {
    let mut file_infos = Vec::new();
    
    for path_str in file_paths {
        let path = Path::new(path_str);
        
        // 获取文件元数据
        let metadata = fs::metadata(path)
            .map_err(|e| format!("无法读取文件信息 {}: {}", path_str, e))?;
        
        // 提取文件名
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("未知文件")
            .to_string();
        
        // 获取文件类型（扩展名）
        let file_type = if metadata.is_dir() {
            "folder".to_string()
        } else {
            path.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_uppercase())
                .unwrap_or_else(|| "文件".to_string())
        };
        
        // 获取文件图标
        let icon_data = get_file_icon_base64(path_str);
        
        file_infos.push(FileInfo {
            path: path_str.clone(),
            name,
            size: metadata.len(),
            is_directory: metadata.is_dir(),
            icon_data,
            file_type,
        });
    }
    
    Ok(file_infos)
}

/// 获取文件图标并转换为Base64 Data URL
fn get_file_icon_base64(path: &str) -> Option<String> {
    use file_icon_provider::get_file_icon;
    
    // 尝试获取系统文件图标
    match get_file_icon(path, 32) {
        Ok(icon) => {
            // 检查是否是图片文件，如果是则直接读取图片作为缩略图
            if is_image_file(path) {
                if let Ok(image_data) = read_image_thumbnail(path, 32) {
                    return Some(image_data);
                }
            }
            
            // 将图标转换为PNG格式的Base64
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

/// 判断是否是图片文件
fn is_image_file(path: &str) -> bool {
    let path_lower = path.to_lowercase();
    path_lower.ends_with(".jpg") || 
    path_lower.ends_with(".jpeg") || 
    path_lower.ends_with(".png") || 
    path_lower.ends_with(".gif") || 
    path_lower.ends_with(".bmp") || 
    path_lower.ends_with(".webp")
}

/// 读取图片文件的缩略图
fn read_image_thumbnail(path: &str, size: u32) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    
    // 读取图片
    let img = image::open(path)
        .map_err(|e| format!("读取图片失败: {}", e))?;
    
    // 生成缩略图
    let thumbnail = img.thumbnail(size, size);
    
    // 转换为PNG
    let mut png_data = Vec::new();
    {
        let mut cursor = Cursor::new(&mut png_data);
        thumbnail.write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| format!("PNG编码失败: {}", e))?;
    }
    
    let base64_str = general_purpose::STANDARD.encode(&png_data);
    Ok(format!("data:image/png;base64,{}", base64_str))
}

/// 将Icon转换为PNG数据
fn icon_to_png(icon: &file_icon_provider::Icon) -> Result<Vec<u8>, String> {
    use image::{RgbaImage, ImageFormat};

    let img = RgbaImage::from_raw(
        icon.width,
        icon.height,
        icon.pixels.clone()
    ).ok_or("创建图像失败")?;
    
    // 转换为PNG
    let mut png_data = Vec::new();
    {
        let mut cursor = Cursor::new(&mut png_data);
        img.write_to(&mut cursor, ImageFormat::Png)
            .map_err(|e| format!("PNG编码失败: {}", e))?;
    }
    
    Ok(png_data)
}

/// 检测字符串是否是URL
fn is_url(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.starts_with("http://") || 
    trimmed.starts_with("https://") ||
    trimmed.starts_with("ftp://") ||
    trimmed.starts_with("www.")
}

/// 检测文本中是否包含链接
fn contains_links(text: &str) -> bool {
    let url_regex = Regex::new(r#"(?i)\b(https?://|ftp://|www\.)[^\s<>"]+\b"#).unwrap();
    url_regex.is_match(text)
}

/// 从HTML中提取纯文本
fn strip_html(html: &str) -> String {
    let tag_regex = Regex::new(r"<[^>]*>").unwrap();
    let entity_regex = Regex::new(r"&[a-zA-Z]+;").unwrap();
    
    let mut text = tag_regex.replace_all(html, " ").to_string();
    text = entity_regex.replace_all(&text, " ").to_string();
    
    // 清理多余的空白
    let whitespace_regex = Regex::new(r"\s+").unwrap();
    whitespace_regex.replace_all(&text, " ").trim().to_string()
}

/// 处理HTML中的图片
fn process_html_images(html: &str) -> Result<(String, Vec<String>), String> {
    use regex::Regex;
    
    let mut processed_html = html.to_string();
    let mut image_ids = Vec::new();
    
    if let Ok(re) = Regex::new(r#"(<img\b[^>]*?\bsrc\s*=\s*")([^"]+)(")"#) {
        processed_html = re.replace_all(&processed_html, |caps: &regex::Captures| {
            let full_tag = &caps[0];
            let src = &caps[2];
            
            if full_tag.contains("data-image-id") {
                return full_tag.to_string();
            }
            
            if let Some(image_id) = try_save_image_from_url(src) {
                image_ids.push(image_id.clone());
                // 在 <img 后插入 data-image-id 属性
                full_tag.replacen("<img", &format!(r#"<img data-image-id="{}""#, image_id), 1)
            } else {
                full_tag.to_string()
            }
        }).to_string();
    }
    
    if let Ok(re) = Regex::new(r#"(<img\b[^>]*?\bsrc\s*=\s*')([^']+)(')"#) {
        processed_html = re.replace_all(&processed_html, |caps: &regex::Captures| {
            let full_tag = &caps[0];
            let src = &caps[2];
            
            if full_tag.contains("data-image-id") {
                return full_tag.to_string();
            }
            
            if let Some(image_id) = try_save_image_from_url(src) {
                if !image_ids.contains(&image_id) {
                    image_ids.push(image_id.clone());
                }
                full_tag.replacen("<img", &format!(r#"<img data-image-id="{}""#, image_id), 1)
            } else {
                full_tag.to_string()
            }
        }).to_string();
    }
    
    Ok((processed_html, image_ids))
}

/// 尝试从URL保存图片并返回图片ID
fn try_save_image_from_url(src: &str) -> Option<String> {
    let src = src.trim();
    
    if src.is_empty() || src == "about:blank" || src.contains("/none.") {
        return None;
    }
    
    match fetch_image_data(src) {
        Ok(image_data) => {
            match save_image_as_file(&image_data) {
                Ok(file_path) => {
                    std::path::Path::new(&file_path)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string())
                }
                Err(_) => None,
            }
        }
        Err(_) => None,
    }
}


/// 获取图片数据（网络或本地）
fn fetch_image_data(src: &str) -> Result<Vec<u8>, String> {
    let src = if src.starts_with("//") {
        format!("https:{}", src)
    } else {
        src.to_string()
    };
    
    if src.starts_with("http://") || src.starts_with("https://") {
        fetch_remote_image(&src)
    } else if src.starts_with("data:image/") {
        parse_data_url(&src)
    } else if src.starts_with("file://") {
        let path = src.trim_start_matches("file://");
        let path = path.trim_start_matches('/');
        std::fs::read(path).map_err(|e| format!("读取本地图片失败 [{}]: {}", path, e))
    } else if std::path::Path::new(&src).exists() {
        std::fs::read(&src).map_err(|e| format!("读取图片失败 [{}]: {}", src, e))
    } else {
        Err(format!("不支持的图片源或文件不存在: {}", src))
    }
}

/// 下载网络图片
fn fetch_remote_image(url: &str) -> Result<Vec<u8>, String> {
    use reqwest::blocking::Client;
    use std::time::Duration;
    
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;
    
    let response = client.get(url)
        .send()
        .map_err(|e| format!("下载图片失败: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("下载图片失败: HTTP {}", response.status()));
    }
    
    let bytes = response.bytes()
        .map_err(|e| format!("读取图片数据失败: {}", e))?;
    
    Ok(bytes.to_vec())
}

/// 解析Data URL
fn parse_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    use base64::{Engine as _, engine::general_purpose};

    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return Err("无效的Data URL格式".to_string());
    }
    
    let data = parts[1];
    general_purpose::STANDARD.decode(data).map_err(|e| format!("Base64解码失败: {}", e))
}

/// 保存图片到本地文件和数据库，返回图片ID
fn save_image_as_file(image_data: &[u8]) -> Result<String, String> {
    // 解码图片
    let cursor = Cursor::new(image_data);
    let img = image::ImageReader::new(cursor)
        .with_guessed_format()
        .map_err(|e| format!("图片格式识别失败: {}", e))?
        .decode()
        .map_err(|e| format!("图片解码失败: {}", e))?;
    
    // 编码为PNG格式
    let mut png_data = Vec::new();
    {
        let mut cursor = Cursor::new(&mut png_data);
        img.write_to(&mut cursor, ImageFormat::Png)
            .map_err(|e| format!("PNG编码失败: {}", e))?;
    }
    
    // 生成图片ID
    let image_id = calculate_image_id(&png_data);
    
    // 保存到文件系统
    use crate::services::get_data_directory;
    use std::fs;
    
    let data_dir = get_data_directory()?;
    let images_dir = data_dir.join("clipboard_images");
    
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir)
            .map_err(|e| format!("创建图片目录失败: {}", e))?;
    }
    
    let image_path = images_dir.join(format!("{}.png", image_id));
    
    if !image_path.exists() {
        fs::write(&image_path, png_data)
            .map_err(|e| format!("保存图片文件失败: {}", e))?;
    }
    
    image_path.to_str()
        .ok_or("文件路径转换失败".to_string())
        .map(|s| s.to_string())
}

/// 根据图片数据计算图片ID
fn calculate_image_id(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let hash = format!("{:x}", hasher.finalize());
    hash[..16].to_string()
}




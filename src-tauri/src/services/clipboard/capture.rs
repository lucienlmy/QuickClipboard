use clipboard_rs::{Clipboard, ClipboardContext, common::RustImage, RustImageData};

// 剪贴板内容类型
#[derive(Debug, Clone, PartialEq)]
pub enum ContentType {
    Text,
    RichText,
    Files,
}

// 剪贴板内容
#[derive(Debug, Clone)]
pub struct ClipboardContent {
    pub content_type: ContentType,
    pub text: Option<String>,
    pub html: Option<String>,
    pub files: Option<Vec<String>>,
}

// 保存剪贴板图片到缓存目录
fn save_clipboard_image(rust_image: RustImageData) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    use crate::services::get_data_directory;
    use image::{ImageEncoder, codecs::png::PngEncoder};
    
    let images_dir = get_data_directory()?.join("clipboard_images");
    std::fs::create_dir_all(&images_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    
    let rgba_image = rust_image.to_rgba8().map_err(|e| e.to_string())?;
    let (width, height) = (rgba_image.width(), rgba_image.height());
    
    let mut png_data = Vec::new();
    let encoder = PngEncoder::new(&mut png_data);
    encoder.write_image(
        rgba_image.as_raw(),
        width,
        height,
        image::ExtendedColorType::Rgba8,
    ).map_err(|e| e.to_string())?;
    
    let hash = format!("{:x}", Sha256::digest(&png_data));
    let filename = format!("{}.png", &hash[..16]);
    let final_path = images_dir.join(&filename);
    
    if final_path.exists() {
        return Ok(format!("clipboard_images/{}", filename));
    }
    
    std::fs::write(&final_path, &png_data).map_err(|e| e.to_string())?;
    
    Ok(format!("clipboard_images/{}", filename))
}

impl ClipboardContent {
    // 从剪贴板捕获内容
    pub fn capture() -> Result<Vec<Self>, String> {
        for attempt in 0..3 {
            if attempt > 0 {
                std::thread::sleep(std::time::Duration::from_millis(50 * (attempt as u64 + 1)));
            }
            
            match Self::capture_internal() {
                Ok(results) if !results.is_empty() => return Ok(results),
                Ok(_) => {}
                Err(_) => {}
            }
        }
        
        Ok(vec![])
    }
    
    fn capture_internal() -> Result<Vec<Self>, String> {
        let ctx = ClipboardContext::new()
            .map_err(|e| format!("创建剪贴板上下文失败: {}", e))?;
        
        let mut results = Vec::new();
        
        // 获取文件路径
        if let Ok(files) = ctx.get_files() {
            if !files.is_empty() {
                return Ok(vec![ClipboardContent {
                    content_type: ContentType::Files,
                    text: Some(files.join("\n")),
                    html: None,
                    files: Some(files),
                }]);
            }
        }
        
        // 获取HTML（富文本）
        if let Ok(html) = ctx.get_html() {
            if !html.trim().is_empty() {
                let text = ctx.get_text().ok();
                
                results.push(ClipboardContent {
                    content_type: ContentType::RichText,
                    text,
                    html: Some(html),
                    files: None,
                });
            }
        } else if let Ok(text) = ctx.get_text() {
            // 获取纯文本
            if !text.trim().is_empty() {
                results.push(ClipboardContent {
                    content_type: ContentType::Text,
                    text: Some(text),
                    html: None,
                    files: None,
                });
            }
        }
        
        // 获取图片
        if let Ok(rust_image) = ctx.get_image() {
            if let Ok(image_path) = save_clipboard_image(rust_image) {
                results.push(ClipboardContent {
                    content_type: ContentType::Files,
                    text: Some(image_path.clone()),
                    html: None,
                    files: Some(vec![image_path]),
                });
            }
        }

        // 如果同时有图片文件和纯图片HTML（无文本内容），移除HTML版本
        let has_image_file = results.iter().any(|r| {
            r.content_type == ContentType::Files && 
            r.files.as_ref().map(|f| f.len() == 1 && is_image_path(&f[0])).unwrap_or(false)
        });
        
        if has_image_file {
            results.retain(|r| {
                if r.content_type != ContentType::RichText {
                    return true;
                }
                r.text.as_ref().map(|t| !t.trim().is_empty()).unwrap_or(false)
            });
        }

        Ok(results)
    }
    
    // 计算内容的哈希值
    pub fn calculate_hash(&self) -> String {
        use sha2::{Sha256, Digest};
        
        let mut hasher = Sha256::new();
        
        match &self.content_type {
            ContentType::Text => {
                if let Some(text) = &self.text {
                    hasher.update(text.as_bytes());
                }
            }
            ContentType::RichText => {
                if let Some(text) = &self.text {
                    hasher.update(text.as_bytes());
                }
            }
            ContentType::Files => {
                if let Some(files) = &self.files {
                    for file in files {
                        let normalized = crate::services::normalize_path_for_hash(file);
                        hasher.update(normalized.as_bytes());
                    }
                }
            }
        }
        
        format!("{:x}", hasher.finalize())
    }
}

// 检查路径是否是图片文件
fn is_image_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") 
        || lower.ends_with(".gif") || lower.ends_with(".webp") || lower.ends_with(".bmp")
}

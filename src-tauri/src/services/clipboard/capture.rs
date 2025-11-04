use clipboard_rs::{Clipboard, ClipboardContext, common::RustImage};

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
fn save_clipboard_image(rust_image: &impl RustImage) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    use uuid::Uuid;
    use crate::services::get_data_directory;
    
    let images_dir = get_data_directory()?.join("clipboard_images");
    std::fs::create_dir_all(&images_dir).map_err(|e| format!("创建目录失败: {}", e))?;
    
    // 保存到临时文件
    let temp_file = images_dir.join(format!("temp_{}.png", Uuid::new_v4()));
    rust_image.save_to_path(temp_file.to_str().ok_or("路径转换失败")?).map_err(|e| e.to_string())?;
    
    // 计算哈希并重命名
    let png_data = std::fs::read(&temp_file).map_err(|e| e.to_string())?;
    let hash = format!("{:x}", Sha256::digest(&png_data));
    let final_path = images_dir.join(format!("{}.png", &hash[..16]));
    
    if final_path.exists() {
        std::fs::remove_file(&temp_file).ok();
    } else {
        std::fs::rename(&temp_file, &final_path).map_err(|e| e.to_string())?;
    }
    
    Ok(final_path.to_str().ok_or("路径转换失败")?.to_string())
}

impl ClipboardContent {
    // 从剪贴板捕获内容
    pub fn capture() -> Result<Option<Self>, String> {
        let ctx = ClipboardContext::new()
            .map_err(|e| format!("创建剪贴板上下文失败: {}", e))?;
        
        // 获取图片
        if let Ok(rust_image) = ctx.get_image() {
            if let Ok(image_path) = save_clipboard_image(&rust_image) {
                return Ok(Some(ClipboardContent {
                    content_type: ContentType::Files,
                    text: Some(image_path.clone()),
                    html: None,
                    files: Some(vec![image_path]),
                }));
            }
        }
        
        // 取文件路径
        if let Ok(files) = ctx.get_files() {
            if !files.is_empty() {
                return Ok(Some(ClipboardContent {
                    content_type: ContentType::Files,
                    text: Some(files.join("\n")),
                    html: None,
                    files: Some(files),
                }));
            }
        }
        
        // 获取HTML（富文本）
        if let Ok(html) = ctx.get_html() {
            if !html.trim().is_empty() {
                let text = ctx.get_text().ok();
                
                return Ok(Some(ClipboardContent {
                    content_type: ContentType::RichText,
                    text,
                    html: Some(html),
                    files: None,
                }));
            }
        }
        
        // 获取纯文本
        if let Ok(text) = ctx.get_text() {
            if !text.trim().is_empty() {
                return Ok(Some(ClipboardContent {
                    content_type: ContentType::Text,
                    text: Some(text),
                    html: None,
                    files: None,
                }));
            }
        }

        Ok(None)
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
                        hasher.update(file.as_bytes());
                    }
                }
            }
        }
        
        format!("{:x}", hasher.finalize())
    }
}

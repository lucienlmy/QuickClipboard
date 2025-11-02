use clipboard_rs::{Clipboard, ClipboardContext, common::RustImage};
use std::io::Cursor;

/// 剪贴板内容类型
#[derive(Debug, Clone, PartialEq)]
pub enum ContentType {
    Text,
    RichText,
    Image,
    Files,
}

/// 剪贴板内容
#[derive(Debug, Clone)]
pub struct ClipboardContent {
    pub content_type: ContentType,
    pub text: Option<String>,
    pub html: Option<String>,
    pub image_data: Option<Vec<u8>>,
    pub files: Option<Vec<String>>,
}

impl ClipboardContent {
    /// 从剪贴板捕获内容
    pub fn capture() -> Result<Option<Self>, String> {
        let ctx = ClipboardContext::new()
            .map_err(|e| format!("创建剪贴板上下文失败: {}", e))?;
        
        // 获取图片
        if let Ok(rust_image) = ctx.get_image() {
            use uuid::Uuid;
            
            let temp_dir = std::env::temp_dir();
            let temp_file = temp_dir.join(format!("clipboard_{}.png", Uuid::new_v4()));

            if let Ok(_) = RustImage::save_to_path(&rust_image, temp_file.to_str().unwrap()) {

                if let Ok(png_data) = std::fs::read(&temp_file) {
       
                    let _ = std::fs::remove_file(&temp_file);
                    
                    if !png_data.is_empty() {
                        return Ok(Some(ClipboardContent {
                            content_type: ContentType::Image,
                            text: None,
                            html: None,
                            image_data: Some(png_data),
                            files: None,
                        }));
                    }
                }
            }
        }
        
        // 取文件路径
        if let Ok(files) = ctx.get_files() {
            if !files.is_empty() {
                return Ok(Some(ClipboardContent {
                    content_type: ContentType::Files,
                    text: Some(files.join("\n")),
                    html: None,
                    image_data: None,
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
                    image_data: None,
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
                    image_data: None,
                    files: None,
                }));
            }
        }

        Ok(None)
    }
    
    /// 验证图片数据是否有效
    fn validate_image(data: &[u8]) -> bool {
        if data.is_empty() {
            return false;
        }
        
        // 尝试加载图片以验证数据有效性
        let cursor = Cursor::new(data);
        image::ImageReader::new(cursor)
            .with_guessed_format()
            .ok()
            .and_then(|reader| reader.decode().ok())
            .is_some()
    }
    
    /// 计算内容的哈希值
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
                if let Some(html) = &self.html {
                    hasher.update(html.as_bytes());
                }
            }
            ContentType::Image => {
                if let Some(data) = &self.image_data {
                    hasher.update(data);
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


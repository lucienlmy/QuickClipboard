//! 剪贴板内容设置的共用逻辑

use clipboard_rs::{Clipboard, ClipboardContext, ClipboardContent};
use std::path::Path;
use super::text::generate_cf_html;

// 文件信息结构
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileInfo {
    pub path: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub is_directory: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_data: Option<String>,
    #[serde(default)]
    pub file_type: String,
    #[serde(default)]
    pub exists: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actual_path: Option<String>,
}

// 文件剪贴板数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FilesData {
    pub files: Vec<FileInfo>,
    #[serde(default)]
    pub operation: String,
}

// 解析 files: 格式的内容，返回文件路径列表
pub fn parse_files_content(content: &str) -> Result<Vec<String>, String> {
    if !content.starts_with("files:") {
        return Err("无效的文件内容格式".to_string());
    }
    
    let json_str = &content[6..];
    let file_data: FilesData = serde_json::from_str(json_str)
        .map_err(|e| format!("解析文件数据失败: {}", e))?;
    
    let paths: Vec<String> = file_data.files
        .iter()
        .map(|f| crate::services::resolve_stored_path(&f.path))
        .collect();
    
    Ok(paths)
}

// 解析 files: 格式的内容，只返回存在的文件路径
pub fn parse_files_content_existing(content: &str) -> Result<Vec<String>, String> {
    let paths = parse_files_content(content)?;
    let existing: Vec<String> = paths.into_iter()
        .filter(|p| Path::new(p).exists())
        .collect();
    
    if existing.is_empty() {
        return Err("所有文件都不存在".to_string());
    }
    
    Ok(existing)
}

// 设置剪贴板为文件列表
pub fn set_clipboard_files(ctx: &ClipboardContext, paths: Vec<String>) -> Result<(), String> {
    ctx.set_files(paths)
        .map_err(|e| format!("设置文件到剪贴板失败: {}", e))
}

// 设置剪贴板为纯文本
pub fn set_clipboard_text(ctx: &ClipboardContext, text: &str) -> Result<(), String> {
    ctx.set_text(text.to_string())
        .map_err(|e| format!("设置文本到剪贴板失败: {}", e))
}

// 设置剪贴板为富文本（文本 + HTML）
pub fn set_clipboard_rich_text(ctx: &ClipboardContext, text: &str, html: &str) -> Result<(), String> {
    let cf_html = generate_cf_html(html);
    ctx.set(vec![
        ClipboardContent::Text(text.to_string()),
        ClipboardContent::Html(cf_html),
    ])
    .map_err(|e| format!("设置剪贴板内容失败: {}", e))
}

// 根据内容类型设置剪贴板（不触发粘贴，用于复制操作）
pub fn set_clipboard_from_item(
    content_type: &str,
    content: &str,
    html_content: &Option<String>,
    skip_record: bool,
) -> Result<(), String> {
    let ctx = ClipboardContext::new()
        .map_err(|e| format!("创建剪贴板上下文失败: {}", e))?;
    
    let primary_type = content_type.split(',').next().unwrap_or(content_type);
    
    match primary_type {
        "image" | "file" => {
            let paths = parse_files_content(content)?;
            if paths.is_empty() {
                return Err("无法解析文件内容".to_string());
            }
            
            if skip_record {
                crate::services::clipboard::set_last_hash_files(content);
            }
            
            set_clipboard_files(&ctx, paths)
        }
        _ => {
            // 文本类型（text, rich_text, link 等）
            let text = if content.starts_with("files:") {
                content[6..].to_string()
            } else {
                content.to_string()
            };
            
            if skip_record {
                crate::services::clipboard::set_last_hash_text(&text);
            }
            
            if let Some(html) = html_content {
                set_clipboard_rich_text(&ctx, &text, html)
            } else {
                set_clipboard_text(&ctx, &text)
            }
        }
    }
}

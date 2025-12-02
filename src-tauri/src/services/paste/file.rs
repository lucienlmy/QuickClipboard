use clipboard_rs::{ClipboardContext, Clipboard};
use std::path::Path;

// 文件信息结构
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FileInfo {
    path: String,
    name: String,
    size: u64,
    is_directory: bool,
    icon_data: Option<String>,
    file_type: String,
}

// 文件剪贴板数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FileClipboardData {
    files: Vec<FileInfo>,
    operation: String,
}

// 粘贴文件路径（只粘贴存在的文件）
pub fn paste_files(ctx: &ClipboardContext, content: &str) -> Result<(), String> {
    if !content.starts_with("files:") {
        return Err("无效的文件内容格式".to_string());
    }
    
    let json_str = content.strip_prefix("files:").unwrap_or("");
    let file_data: FileClipboardData = serde_json::from_str(json_str)
        .map_err(|e| format!("解析文件数据失败: {}", e))?;
    
    let file_paths: Vec<String> = file_data.files
        .iter()
        .map(|f| f.path.clone())
        .filter(|p| Path::new(p).exists())
        .collect();
    
    if file_paths.is_empty() {
        return Err("所有文件都不存在".to_string());
    }
    
    ctx.set_files(file_paths)
        .map_err(|e| format!("设置文件到剪贴板失败: {}", e))
}






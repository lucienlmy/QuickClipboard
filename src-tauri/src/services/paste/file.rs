use clipboard_rs::{ClipboardContext, Clipboard};
use std::path::Path;

/// 文件信息结构
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FileInfo {
    path: String,
    name: String,
    size: u64,
    is_directory: bool,
    icon_data: Option<String>,
    file_type: String,
}

/// 文件剪贴板数据
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct FileClipboardData {
    files: Vec<FileInfo>,
    operation: String,
}

/// 粘贴文件路径
pub fn paste_files(ctx: &ClipboardContext, content: &str) -> Result<(), String> {
    // 解析文件数据
    if !content.starts_with("files:") {
        return Err("无效的文件内容格式".to_string());
    }
    
    let json_str = content.strip_prefix("files:").unwrap_or("");
    let file_data: FileClipboardData = serde_json::from_str(json_str)
        .map_err(|e| format!("解析文件数据失败: {}", e))?;
    
    // 提取文件路径列表
    let file_paths: Vec<String> = file_data.files
        .iter()
        .map(|f| f.path.clone())
        .collect();
    
    // 验证所有文件是否存在
    for path in &file_paths {
        if !Path::new(path).exists() {
            return Err(format!("文件不存在: {}", path));
        }
    }
    
    // 设置文件路径到剪贴板
    ctx.set_files(file_paths)
        .map_err(|e| format!("设置文件到剪贴板失败: {}", e))
}






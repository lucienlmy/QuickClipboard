use crate::services::database::{query_clipboard_items, get_clipboard_count, move_clipboard_item_by_index, limit_clipboard_history, QueryParams, PaginatedResult, ClipboardItem};

/// 分页查询剪贴板历史
#[tauri::command]
pub fn get_clipboard_history(
    offset: Option<i64>,
    limit: Option<i64>,
    search: Option<String>,
    content_type: Option<String>,
) -> Result<PaginatedResult<ClipboardItem>, String> {
    let params = QueryParams {
        offset: offset.unwrap_or(0),
        limit: limit.unwrap_or(50),
        search,
        content_type,
    };
    
    query_clipboard_items(params)
}

/// 获取剪贴板总数
#[tauri::command]
pub fn get_clipboard_total_count() -> Result<i64, String> {
    get_clipboard_count()
}

/// 移动剪贴板项（拖拽排序）
#[tauri::command]
pub fn move_clipboard_item(from_index: i64, to_index: i64) -> Result<(), String> {
    move_clipboard_item_by_index(from_index, to_index)
}

/// 应用历史记录数量限制
#[tauri::command]
pub fn apply_history_limit(limit: u64) -> Result<(), String> {
    limit_clipboard_history(limit)
}

/// 获取图片文件路径
#[tauri::command]
pub fn get_image_file_path(content: String) -> Result<String, String> {
    use std::path::PathBuf;
    
    // 提取 image_id
    if !content.starts_with("image:") {
        return Err("不支持的图片格式".to_string());
    }
    
    let image_id = content.strip_prefix("image:").unwrap_or("");
    
    // 获取图片存储目录
    let data_dir = crate::get_data_directory()?;
    let images_dir = data_dir.join("clipboard_images");
    let image_path = images_dir.join(format!("{}.png", image_id));
    
    // 检查文件是否存在
    if !image_path.exists() {
        return Err(format!("图片文件不存在: {}", image_id));
    }
    
    Ok(image_path.to_string_lossy().to_string())
}


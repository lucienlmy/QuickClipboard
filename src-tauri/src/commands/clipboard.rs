use crate::services::database::{
    query_clipboard_items, 
    get_clipboard_count, 
    move_clipboard_item_by_index, 
    limit_clipboard_history, 
    get_clipboard_item_by_id,
    delete_clipboard_item as db_delete_clipboard_item,
    clear_clipboard_history as db_clear_clipboard_history,
    QueryParams, 
    PaginatedResult, 
    ClipboardItem
};

// 分页查询剪贴板历史
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

// 获取剪贴板总数
#[tauri::command]
pub fn get_clipboard_total_count() -> Result<i64, String> {
    get_clipboard_count()
}

// 移动剪贴板项（拖拽排序）
#[tauri::command]
pub fn move_clipboard_item(from_index: i64, to_index: i64) -> Result<(), String> {
    move_clipboard_item_by_index(from_index, to_index)
}

// 应用历史记录数量限制
#[tauri::command]
pub fn apply_history_limit(limit: u64) -> Result<(), String> {
    limit_clipboard_history(limit)
}


// 粘贴参数
#[derive(Debug, serde::Deserialize)]
pub struct PasteParams {
    #[serde(default)]
    pub clipboard_id: Option<i64>,
    #[serde(default)]
    pub favorite_id: Option<String>,
    #[serde(default)]
    pub format: Option<String>,
}

// 粘贴剪贴板项或收藏项
#[tauri::command]
pub fn paste_content(params: PasteParams, app: tauri::AppHandle) -> Result<(), String> {
    use crate::services::database::get_favorite_by_id;
    use crate::services::paste::paste_handler::{
        paste_clipboard_item_with_update, 
        paste_favorite_item_with_update,
        paste_clipboard_item_with_format,
        paste_favorite_item_with_format
    };
    use crate::services::paste::PasteFormat;
    
    let paste_format = params.format.as_ref().and_then(|f| match f.as_str() {
        "plain" => Some(PasteFormat::PlainText),
        "formatted" => Some(PasteFormat::WithFormat),
        _ => None,
    });
    
    // 根据参数类型处理粘贴
    if let Some(clipboard_id) = params.clipboard_id {
        let item = get_clipboard_item_by_id(clipboard_id)?
            .ok_or_else(|| format!("剪贴板项不存在: {}", clipboard_id))?;
        
        if paste_format.is_some() {
            paste_clipboard_item_with_format(&item, paste_format)?;
        } else {
        paste_clipboard_item_with_update(&item)?;
        }
    } else if let Some(favorite_id) = params.favorite_id {
        let favorite = get_favorite_by_id(&favorite_id)?
            .ok_or_else(|| format!("收藏项不存在: {}", favorite_id))?;
        
        // 将收藏项转换为剪贴板项格式
        let item = ClipboardItem {
            id: 0,
            content: favorite.content,
            html_content: favorite.html_content,
            content_type: favorite.content_type,
            image_id: favorite.image_id,
            item_order: favorite.item_order,
            created_at: favorite.created_at,
            updated_at: favorite.updated_at,
        };
        
        if paste_format.is_some() {
            paste_favorite_item_with_format(&item, &favorite_id, paste_format)?;
        } else {
        paste_favorite_item_with_update(&item, &favorite_id)?;
        }
    } else {
        return Err("必须 clipboard_id 或 favorite_id".to_string());
    };
    
    if let Some(window) = crate::get_main_window(&app) {
        crate::hide_main_window(&window);
    }
    Ok(())
}

// 删除单个剪贴板项
#[tauri::command]
pub fn delete_clipboard_item(id: i64) -> Result<(), String> {
    db_delete_clipboard_item(id)
}

// 清空剪贴板历史
#[tauri::command]
pub fn clear_clipboard_history() -> Result<(), String> {
    db_clear_clipboard_history()
}

// 另存为图片
#[tauri::command]
pub async fn save_image_from_clipboard(clipboard_id: i64, app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let item = get_clipboard_item_by_id(clipboard_id)?.ok_or("剪贴板项不存在")?;
    
    let image_path = if item.content.starts_with("files:") {
        let json: serde_json::Value = serde_json::from_str(&item.content[6..])
            .map_err(|_| "解析文件数据失败")?;
        json["files"][0]["path"].as_str().ok_or("无法获取图片路径")?.to_string()
    } else {
        item.content.clone()
    };
    
    let path = std::path::Path::new(&image_path);
    if !path.exists() { return Err("图片文件不存在".to_string()); }
    
    let filename = format!("QC_{}.png", path.file_stem().and_then(|s| s.to_str()).unwrap_or("image"));
    
    let save_path = app.dialog().file()
        .add_filter("PNG Image", &["png"])
        .set_file_name(&filename)
        .blocking_save_file()
        .ok_or("用户取消保存")?;
    
    let dest = save_path.as_path().ok_or("无效的文件路径")?;
    std::fs::copy(&image_path, dest).map_err(|e| format!("保存失败: {}", e))?;
    
    Ok(dest.to_string_lossy().to_string())
}


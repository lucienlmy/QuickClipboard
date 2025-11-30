use crate::services::database::{
    clear_clipboard_history as db_clear_clipboard_history,
    delete_clipboard_item as db_delete_clipboard_item, get_clipboard_count,
    get_clipboard_item_by_id, limit_clipboard_history, move_clipboard_item_to_top,
    move_clipboard_item_by_id as db_move_clipboard_item_by_id,
    query_clipboard_items, update_clipboard_item as db_update_clipboard_item,
    toggle_pin_clipboard_item as db_toggle_pin, ClipboardItem,
    PaginatedResult, QueryParams,
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

// 另存图片
#[tauri::command]
pub async fn save_image_from_path(
    file_path: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use std::path::Path;
    use tauri_plugin_dialog::DialogExt;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("图片文件不存在".to_string());
    }

    let filename = format!(
        "QC_{}.png",
        path.file_stem().and_then(|s| s.to_str()).unwrap_or("image")
    );

    let save_path = app
        .dialog()
        .file()
        .set_file_name(filename)
        .blocking_save_file()
        .ok_or("用户取消保存")?;

    let dest = save_path.as_path().ok_or("无效的文件路径")?;
    std::fs::copy(&file_path, dest).map_err(|e| format!("保存失败: {}", e))?;

    Ok(dest.to_string_lossy().to_string())
}

// 获取剪贴板总数
#[tauri::command]
pub fn get_clipboard_total_count() -> Result<i64, String> {
    get_clipboard_count()
}

// 移动剪贴板项到顶部（粘贴后置顶使用）
#[tauri::command]
pub fn move_clipboard_item(id: i64) -> Result<(), String> {
    move_clipboard_item_to_top(id)
}

// 移动剪贴板项（拖拽排序，按 ID，用于搜索/筛选时）
#[tauri::command]
pub fn move_clipboard_item_by_id(from_id: i64, to_id: i64) -> Result<(), String> {
    db_move_clipboard_item_by_id(from_id, to_id)
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
        paste_clipboard_item_with_format, paste_clipboard_item_with_update,
        paste_favorite_item_with_format, paste_favorite_item_with_update,
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
            is_pinned: false,
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
    if !crate::get_window_state().is_pinned {
        if let Some(window) = crate::get_main_window(&app) {
            crate::hide_main_window(&window);
        }
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
// 根据 ID 获取单个剪贴板项
#[tauri::command]
pub fn get_clipboard_item_by_id_cmd(id: i64) -> Result<ClipboardItem, String> {
    get_clipboard_item_by_id(id)?.ok_or_else(|| format!("剪贴板项不存在: {}", id))
}

// 更新剪贴板项内容
#[tauri::command]
pub fn update_clipboard_item_cmd(id: i64, content: String) -> Result<(), String> {
    db_update_clipboard_item(id, content)
}

// 切换剪贴板项置顶状态
#[tauri::command]
pub fn toggle_pin_clipboard_item(id: i64) -> Result<bool, String> {
    db_toggle_pin(id)
}

// 复制图片文件到剪贴板
#[tauri::command]
pub fn copy_image_to_clipboard(file_path: String) -> Result<(), String> {
    use clipboard_rs::{Clipboard, ClipboardContext};
    use std::path::Path;
    
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("图片文件不存在: {}", file_path));
    }
    
    let ctx = ClipboardContext::new()
        .map_err(|e| format!("创建剪贴板上下文失败: {}", e))?;
    
    ctx.set_files(vec![file_path])
        .map_err(|e| format!("复制到剪贴板失败: {}", e))
}

// 直接粘贴文本
#[tauri::command]
pub fn paste_text_direct(text: String, app: tauri::AppHandle) -> Result<(), String> {
    use crate::services::paste::paste_handler::paste_text_direct as do_paste;
    
    do_paste(&text)?;
    
    if !crate::get_window_state().is_pinned {
        if let Some(window) = crate::get_main_window(&app) {
            crate::hide_main_window(&window);
        }
    }
    
    Ok(())
}

// 粘贴图片文件
#[tauri::command]
pub fn paste_image_file(file_path: String, app: tauri::AppHandle) -> Result<(), String> {
    use crate::services::paste::paste_handler::paste_image_file as do_paste;
    
    do_paste(&file_path)?;

    if !crate::get_window_state().is_pinned {
        if let Some(window) = crate::get_main_window(&app) {
            crate::hide_main_window(&window);
        }
    }
    
    Ok(())
}

use clipboard_rs::ClipboardContext;
use crate::services::database::ClipboardItem;
use super::text::paste_rich_text;
use super::file::paste_files;
use super::keyboard::simulate_paste;
use chrono;

/// 粘贴剪贴板项
pub fn paste_clipboard_item(item: &ClipboardItem) -> Result<(), String> {
    paste_item_internal(item, None, None)
}

/// 粘贴剪贴板项并自动转换旧格式（更新 clipboard 表）
pub fn paste_clipboard_item_with_update(item: &ClipboardItem) -> Result<(), String> {
    paste_item_internal(item, Some(item.id), None)
}

/// 粘贴收藏项并自动转换旧格式（更新 favorites 表）
pub fn paste_favorite_item_with_update(item: &ClipboardItem, favorite_id: &str) -> Result<(), String> {
    paste_item_internal(item, None, Some(favorite_id.to_string()))
}

/// 内部粘贴实现
fn paste_item_internal(item: &ClipboardItem, clipboard_id: Option<i64>, favorite_id: Option<String>) -> Result<(), String> {
    let primary_type = item.content_type.split(',').next().unwrap_or(&item.content_type);
    
    // 检查并转换旧格式图片
    let content = if primary_type == "image" && !item.content.starts_with("files:") {
        let new_content = convert_legacy_image_format(item)?;
        
        // 更新数据库并刷新时间戳
        if let Some(id) = clipboard_id {
            update_item_content(Some(id), None, &new_content)?;
        } else if let Some(id) = favorite_id {
            update_item_content(None, Some(&id), &new_content)?;
        }
        
        new_content
    } else {
        item.content.clone()
    };
    
    crate::services::clipboard::set_last_hash(&item.content);
    
    // 设置剪贴板
    let ctx = ClipboardContext::new()
        .map_err(|e| format!("创建剪贴板上下文失败: {}", e))?;
    
    match primary_type {
        "text" | "link" | "rich_text" => {
            paste_rich_text(&ctx, &item.content, &item.html_content)?
        },
        "image" | "file" => paste_files(&ctx, &content)?,
        _ => return Err(format!("不支持的内容类型: {}", item.content_type)),
    }
    
    std::thread::sleep(std::time::Duration::from_millis(50));
    simulate_paste()?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    
    Ok(())
}

/// 转换旧格式图片为新格式（files:{json}）
fn convert_legacy_image_format(item: &ClipboardItem) -> Result<String, String> {
    use crate::services::get_data_directory;
    
    let image_id = item.image_id.as_deref()
        .or_else(|| item.content.strip_prefix("image:"))
        .ok_or("无法获取图片ID")?;
    
    let image_path = get_data_directory()?
        .join("clipboard_images")
        .join(format!("{}.png", image_id));
    
    if !image_path.exists() {
        return Err(format!("图片文件不存在: {}", image_path.display()));
    }
    
    let file_data = serde_json::json!({
        "files": [{
            "path": image_path.to_str().ok_or("路径转换失败")?,
            "name": format!("{}.png", image_id),
            "size": std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
            "is_directory": false,
            "file_type": "PNG"
        }],
        "operation": "copy"
    });
    
    Ok(format!("files:{}", file_data))
}

/// 更新项内容并刷新时间戳
fn update_item_content(clipboard_id: Option<i64>, favorite_id: Option<&str>, new_content: &str) -> Result<(), String> {
    use crate::services::database::connection::with_connection;
    use rusqlite::params;
    
    with_connection(|conn| {
        let now = chrono::Local::now().timestamp();
        
        if let Some(id) = clipboard_id {
            conn.execute(
                "UPDATE clipboard SET content = ?, updated_at = ?, created_at = ? WHERE id = ?",
                params![new_content, now, now, id],
            )?;
        } else if let Some(id) = favorite_id {
            conn.execute(
                "UPDATE favorites SET content = ?, updated_at = ? WHERE id = ?",
                params![new_content, now, id],
            )?;
        }
        Ok(())
    })
}

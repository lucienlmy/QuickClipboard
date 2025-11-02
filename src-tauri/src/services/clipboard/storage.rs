use super::processor::ProcessedContent;
use crate::services::database::connection::with_connection;
use crate::services::database::clipboard::limit_clipboard_history;
use crate::services::settings::get_settings;
use rusqlite::params;
use chrono;

/// 存储剪贴板内容到数据库
pub fn store_clipboard_item(content: ProcessedContent) -> Result<i64, String> {
    let result = with_connection(|conn| {
        let now = chrono::Local::now().timestamp();
        
        // 检查最近10条记录是否有重复
        let is_dup = match is_duplicate_content(&content, conn) {
            Ok(dup) => dup,
            Err(e) => {
                eprintln!("检查重复内容失败: {}", e);
                false
            }
        };
        
        if is_dup {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        
        // 插入新记录
        conn.execute(
            "INSERT INTO clipboard (content, html_content, content_type, image_id, item_order, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)",
            params![
                content.content,
                content.html_content,
                content.content_type,
                content.image_id,
                now,
                now
            ],
        )?;
        
        Ok(conn.last_insert_rowid())
    });
    
    match result {
        Ok(id) => {
            let settings = get_settings();
            let _ = limit_clipboard_history(settings.history_limit);
            Ok(id)
        },
        Err(e) if e.contains("Query returned no rows") => Err("重复内容".to_string()),
        Err(e) => Err(e),
    }
}

/// 检查是否是重复内容
fn is_duplicate_content(content: &ProcessedContent, conn: &rusqlite::Connection) -> Result<bool, rusqlite::Error> {
    // 只检查最近的10条记录
    let mut stmt = conn.prepare(
        "SELECT content, html_content, content_type, image_id 
         FROM clipboard 
         ORDER BY created_at DESC 
         LIMIT 10"
    )?;
    
    let recent_items = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;
    
    for item in recent_items {
        let (db_content, db_html, db_type, db_image_id) = item?;
        
        // 比较内容类型
        if db_type != content.content_type {
            continue;
        }
        
        // 根据类型比较内容
        let is_same = match content.content_type.as_str() {
            "image" => {
                // 图片通过image_id比较
                content.image_id.as_ref() == Some(&db_image_id.unwrap_or_default())
            }
            "rich_text" => {
                // 富文本通过HTML比较
                if let Some(html) = &content.html_content {
                    html == &db_html.unwrap_or_default()
                } else {
                    false
                }
            }
            _ => {
                // 其他类型通过纯文本比较
                content.content == db_content
            }
        };
        
        if is_same {
            return Ok(true);
        }
    }
    
    Ok(false)
}


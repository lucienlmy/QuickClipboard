use super::processor::ProcessedContent;
use crate::services::database::connection::with_connection;
use crate::services::database::clipboard::limit_clipboard_history;
use crate::services::settings::get_settings;
use rusqlite::params;
use chrono;
use serde_json::Value;

pub fn store_clipboard_item(content: ProcessedContent) -> Result<i64, String> {
    let settings = get_settings();
    
    if !settings.save_images && is_image_type(&content.content_type) {
        return Err("已禁止保存图片".to_string());
    }
    
    let result = with_connection(|conn| {
        let now = chrono::Local::now().timestamp();
        
        match check_and_handle_duplicate(&content, conn, now) {
            Ok(Some(existing_id)) => {
                return Ok(existing_id);
            }
            Ok(None) => {}
            Err(e) => {
                eprintln!("检查重复内容失败: {}", e);
            }
        }
        
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
            let _ = limit_clipboard_history(settings.history_limit);
            Ok(id)
        },
        Err(e) => Err(e),
    }
}

// 智能去重
fn check_and_handle_duplicate(
    content: &ProcessedContent,
    conn: &rusqlite::Connection,
    now: i64,
) -> Result<Option<i64>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, content, content_type 
         FROM clipboard 
         ORDER BY created_at DESC 
         LIMIT 100"
    )?;
    
    let recent_items = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,      // id
            row.get::<_, String>(1)?,   // content
            row.get::<_, String>(2)?,   // content_type
        ))
    })?;
    
    for item in recent_items {
        let (db_id, db_content, db_type) = item?;

        let is_text_same = if is_text_type(&content.content_type) && is_text_type(&db_type) {
            content.content == db_content
        } else if is_file_type(&content.content_type) && is_file_type(&db_type) {
            compare_file_contents(&content.content, &db_content)
        } else {
            false
        };
        
        if !is_text_same {
            continue;
        }
        
        conn.execute("DELETE FROM clipboard WHERE id = ?", params![db_id])?;
        return Ok(None);
    }
    
    Ok(None)
}


fn is_text_type(content_type: &str) -> bool {
    content_type.starts_with("text") || content_type.contains("rich_text") || content_type.contains("link")
}

fn is_file_type(content_type: &str) -> bool {
    content_type.contains("image") || content_type.contains("file")
}

fn is_image_type(content_type: &str) -> bool {
    content_type.contains("image")
}

// 比较文件内容
fn compare_file_contents(content1: &str, content2: &str) -> bool {
    if !content1.starts_with("files:") || !content2.starts_with("files:") {
        return content1 == content2;
    }
    
    let Ok(json1) = serde_json::from_str::<Value>(&content1[6..]) else { return false };
    let Ok(json2) = serde_json::from_str::<Value>(&content2[6..]) else { return false };
    
    extract_file_paths(&json1) == extract_file_paths(&json2)
}

// 从 JSON 提取并排序文件路径
fn extract_file_paths(json: &Value) -> Vec<String> {
    let mut paths: Vec<String> = json["files"]
        .as_array()
        .into_iter()
        .flat_map(|files| files.iter())
        .filter_map(|file| file["path"].as_str().map(String::from))
        .collect();
    
    paths.sort();
    paths
}


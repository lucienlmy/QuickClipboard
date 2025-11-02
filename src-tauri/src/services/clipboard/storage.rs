use super::processor::ProcessedContent;
use crate::services::database::connection::with_connection;
use crate::services::database::clipboard::limit_clipboard_history;
use crate::services::settings::get_settings;
use rusqlite::params;
use chrono;
use serde_json::Value;

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
            "INSERT INTO clipboard (content, html_content, content_type, item_order, created_at, updated_at) 
             VALUES (?1, ?2, ?3, 0, ?4, ?5)",
            params![
                content.content,
                content.html_content,
                content.content_type,
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
        "SELECT content, html_content, content_type 
         FROM clipboard 
         ORDER BY created_at DESC 
         LIMIT 10"
    )?;
    
    let recent_items = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    
    for item in recent_items {
        let (db_content, db_html, db_type) = item?;
        
        if db_type != content.content_type {
            continue;
        }
        
        let is_same = match content.content_type.as_str() {
            "rich_text" => {
                if let Some(html) = &content.html_content {
                    html == &db_html.unwrap_or_default()
                } else {
                    false
                }
            }
            "image" | "file" => compare_file_contents(&content.content, &db_content),
            _ => content.content == db_content,
        };
        
        if is_same {
            return Ok(true);
        }
    }
    
    Ok(false)
}

/// 比较文件内容
fn compare_file_contents(content1: &str, content2: &str) -> bool {
    if !content1.starts_with("files:") || !content2.starts_with("files:") {
        return content1 == content2;
    }
    
    let Ok(json1) = serde_json::from_str::<Value>(&content1[6..]) else { return false };
    let Ok(json2) = serde_json::from_str::<Value>(&content2[6..]) else { return false };
    
    extract_file_paths(&json1) == extract_file_paths(&json2)
}

/// 从 JSON 提取并排序文件路径
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


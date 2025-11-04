use super::models::{ClipboardItem, PaginatedResult, QueryParams};
use super::connection::{with_connection, truncate_string, MAX_CONTENT_LENGTH};
use rusqlite::{params, OptionalExtension};
use chrono;

// 分页查询剪贴板历史
pub fn query_clipboard_items(params: QueryParams) -> Result<PaginatedResult<ClipboardItem>, String> {
    with_connection(|conn| {
        let mut where_clauses = vec![];
        let mut count_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        
        if let Some(ref search) = params.search {
            if !search.trim().is_empty() {
                where_clauses.push("content LIKE ?");
                let search_pattern = format!("%{}%", search);
                count_params.push(Box::new(search_pattern.clone()));
                query_params.push(Box::new(search_pattern));
            }
        }
        
        if let Some(ref content_type) = params.content_type {
            if content_type != "all" {
                let pattern = format!("%{}%", content_type);
                where_clauses.push("content_type LIKE ?");
                count_params.push(Box::new(pattern.clone()));
                query_params.push(Box::new(pattern));
            }
        }
        
        let where_clause = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };
        
        let count_sql = format!("SELECT COUNT(*) FROM clipboard {}", where_clause);
        let total_count: i64 = conn.query_row(
            &count_sql,
            rusqlite::params_from_iter(count_params.iter().map(|p| p.as_ref())),
            |row| row.get(0)
        )?;
        
        if total_count == 0 {
            return Ok(PaginatedResult::new(0, vec![], params.offset, params.limit));
        }
        
        let query_sql = format!(
            "SELECT id, content, html_content, content_type, image_id, item_order, created_at, updated_at 
             FROM clipboard 
             {} 
             ORDER BY item_order ASC, updated_at DESC 
             LIMIT ? OFFSET ?",
            where_clause
        );
        
        query_params.push(Box::new(params.limit));
        query_params.push(Box::new(params.offset));
        
        let mut stmt = conn.prepare(&query_sql)?;
        
        let items = stmt.query_map(
            rusqlite::params_from_iter(query_params.iter().map(|p| p.as_ref())),
            |row| {
                let content: String = row.get(1)?;
                let html_content: Option<String> = row.get(2)?;
                let content_type: String = row.get(3)?;
                
                let (truncated_content, truncated_html) = if content_type == "text" || content_type == "rich_text" || content_type == "link" {
                    let content = if content.len() > MAX_CONTENT_LENGTH {
                        truncate_string(content, MAX_CONTENT_LENGTH)
                    } else {
                        content
                    };
                    
                    let html = html_content.map(|h| {
                        if h.len() > MAX_CONTENT_LENGTH {
                            truncate_string(h, MAX_CONTENT_LENGTH)
                        } else {
                            h
                        }
                    });
                    
                    (content, html)
                } else {
                    (content, html_content)
                };
                
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content: truncated_content,
                    html_content: truncated_html,
                    content_type,
                    image_id: row.get(4)?,
                    item_order: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            }
        )?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(PaginatedResult::new(total_count, items, params.offset, params.limit))
    })
}

// 获取剪贴板总数
pub fn get_clipboard_count() -> Result<i64, String> {
    with_connection(|conn| {
        conn.query_row("SELECT COUNT(*) FROM clipboard", [], |row| row.get(0))
    })
}

// 根据ID获取剪贴板项（完整内容，不截断）
pub fn get_clipboard_item_by_id(id: i64) -> Result<Option<ClipboardItem>, String> {
    with_connection(|conn| {
        conn.query_row(
            "SELECT id, content, html_content, content_type, image_id, item_order, created_at, updated_at 
             FROM clipboard WHERE id = ?",
            params![id],
            |row| {
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    html_content: row.get(2)?,
                    content_type: row.get(3)?,
                    image_id: row.get(4)?,
                    item_order: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            }
        )
        .optional()
        .map_err(|e| e.into())
    })
}

// 限制剪贴板历史数量（删除超出限制的旧记录）
pub fn limit_clipboard_history(max_count: u64) -> Result<(), String> {
    if max_count >= 999999 {
        return Ok(());
    }
    
    with_connection(|conn| {
        conn.execute(
            "DELETE FROM clipboard WHERE id NOT IN (
                SELECT id FROM clipboard ORDER BY item_order, updated_at DESC LIMIT ?1
            )",
            params![max_count],
        )?;
        Ok(())
    })
}

// 删除单个剪贴板项
pub fn delete_clipboard_item(id: i64) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute("DELETE FROM clipboard WHERE id = ?1", params![id])?;
        Ok(())
    })
}

// 清空所有剪贴板历史
pub fn clear_clipboard_history() -> Result<(), String> {
    with_connection(|conn| {
        conn.execute("DELETE FROM clipboard", [])?;
        Ok(())
    })
}

// 移动剪贴板项（拖拽排序）
pub fn move_clipboard_item_by_index(from_index: i64, to_index: i64) -> Result<(), String> {
    if from_index == to_index {
        return Ok(());
    }

    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id FROM clipboard ORDER BY item_order, updated_at DESC"
        )?;
        
        let item_ids: Vec<i64> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<i64>, _>>()?;

        drop(stmt);

        let len = item_ids.len() as i64;
        if from_index < 0 || from_index >= len {
            return Err(rusqlite::Error::InvalidParameterName(
                format!("源索引 {} 超出范围 (0-{})", from_index, len - 1)
            ));
        }
        if to_index < 0 || to_index >= len {
            return Err(rusqlite::Error::InvalidParameterName(
                format!("目标索引 {} 超出范围 (0-{})", to_index, len - 1)
            ));
        }

        let mut reordered_ids = item_ids;
        let moved_id = reordered_ids.remove(from_index as usize);
        reordered_ids.insert(to_index as usize, moved_id);

        let tx = conn.unchecked_transaction()?;
        let now = chrono::Local::now().timestamp();

        for (index, &id) in reordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE clipboard SET item_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![index as i64, now, id],
            )?;
        }

        tx.commit()?;
        Ok(())
    })
}


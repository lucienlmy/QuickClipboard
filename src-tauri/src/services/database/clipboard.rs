use super::models::{ClipboardItem, PaginatedResult, QueryParams};
use super::connection::{with_connection, MAX_CONTENT_LENGTH};
use crate::utils::{truncate_string, truncate_around_keyword, truncate_html};
use rusqlite::{params, OptionalExtension};
use std::collections::HashSet;
use chrono;

// 计算文本字符数
fn calculate_char_count(content: &str, content_type: &str) -> Option<i64> {
    if content_type.contains("text") || content_type.contains("rich_text") {
        let count = content.chars().count() as i64;
        if count > 0 {
            Some(count)
        } else {
            None
        }
    } else {
        None
    }
}

// 异步更新缺失的字符数
pub fn update_missing_char_counts(items: Vec<(i64, String, String)>) {
    if items.is_empty() { return; }
    
    std::thread::spawn(move || {
        let _ = with_connection(|conn| {
            for (id, content, content_type) in items {
                if let Some(char_count) = calculate_char_count(&content, &content_type) {
                    conn.execute(
                        "UPDATE clipboard SET char_count = ?1 WHERE id = ?2",
                        params![char_count, id],
                    )?;
                }
            }
            Ok(())
        });
    });
}

// 按逗号拆分图片ID
fn split_image_ids(s: &str) -> Vec<String> {
    s.split(',')
        .map(|x| x.trim())
        .filter(|x| !x.is_empty())
        .map(|x| x.to_string())
        .collect()
}

// 检查图片ID是否仍被 clipboard 或 favorites 引用
fn is_image_id_referenced(conn: &rusqlite::Connection, image_id: &str) -> Result<bool, rusqlite::Error> {
    let exact = image_id;
    let p1 = format!("{},%", image_id);
    let p2 = format!("%,{},%", image_id);
    let p3 = format!("%,{}", image_id);

    let q = |table: &str| -> Result<bool, rusqlite::Error> {
        let sql = format!(
            "SELECT EXISTS(SELECT 1 FROM {} WHERE image_id = ?1 OR image_id LIKE ?2 OR image_id LIKE ?3 OR image_id LIKE ?4)",
            table
        );
        let exists: i64 = conn.query_row(&sql, params![exact, p1, p2, p3], |row| row.get(0))?;
        Ok(exists != 0)
    };

    Ok(q("clipboard")? || q("favorites")?)
}

// 删除图片文件
fn delete_image_files(image_ids: Vec<String>) -> Result<(), String> {
    if image_ids.is_empty() { return Ok(()); }
    let data_dir = crate::services::get_data_directory()?;
    let images_dir = data_dir.join("clipboard_images");
    for iid in image_ids {
        let p = images_dir.join(format!("{}.png", iid));
        if p.exists() {
            let _ = std::fs::remove_file(&p);
        }
    }
    Ok(())
}

// 分页查询剪贴板历史
pub fn query_clipboard_items(params: QueryParams) -> Result<PaginatedResult<ClipboardItem>, String> {
    let search_keyword = params.search.clone();
    let has_filter = search_keyword.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false)
        || params.content_type.as_ref().map(|t| t != "all").unwrap_or(false);
    
    with_connection(|conn| {
        let mut where_clauses = vec![];
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        
        if let Some(ref search) = search_keyword {
            if !search.trim().is_empty() {
                where_clauses.push("content LIKE ?");
                let search_pattern = format!("%{}%", search);
                query_params.push(Box::new(search_pattern));
            }
        }
        
        if let Some(ref content_type) = params.content_type {
            if content_type != "all" {
                where_clauses.push("content_type = ?");
                query_params.push(Box::new(content_type.clone()));
            }
        }
        
        let where_clause = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };
        
        let total_count: i64 = if has_filter {
            let count_sql = format!("SELECT COUNT(*) FROM clipboard {}", where_clause);
            let count_params: Vec<Box<dyn rusqlite::ToSql>> = query_params.iter().map(|p| {
                let val: Box<dyn rusqlite::ToSql> = match p.as_ref().to_sql() {
                    Ok(rusqlite::types::ToSqlOutput::Borrowed(rusqlite::types::ValueRef::Text(s))) => {
                        Box::new(String::from_utf8_lossy(s).to_string())
                    }
                    _ => Box::new("")
                };
                val
            }).collect();
            conn.query_row(
                &count_sql,
                rusqlite::params_from_iter(count_params.iter().map(|p| p.as_ref())),
                |row| row.get(0)
            )?
        } else {
            conn.query_row("SELECT COUNT(*) FROM clipboard", [], |row| row.get(0))?
        };
        
        if total_count == 0 {
            return Ok(PaginatedResult::new(0, vec![], params.offset, params.limit));
        }
        
        let query_sql = format!(
            "SELECT id, content, html_content, content_type, image_id, item_order, is_pinned, paste_count, source_app, source_icon_hash, created_at, updated_at, char_count 
             FROM clipboard 
             {} 
             ORDER BY is_pinned DESC, item_order DESC, updated_at DESC 
             LIMIT ? OFFSET ?",
            where_clause
        );
        
        query_params.push(Box::new(params.limit));
        query_params.push(Box::new(params.offset));
        
        let mut stmt = conn.prepare(&query_sql)?;

        let mut items_to_update: Vec<(i64, String, String)> = vec![];
        
        let items = stmt.query_map(
            rusqlite::params_from_iter(query_params.iter().map(|p| p.as_ref())),
            |row| {
                let id: i64 = row.get(0)?;
                let content: String = row.get(1)?;
                let html_content: Option<String> = row.get(2)?;
                let content_type: String = row.get(3)?;
                let char_count: Option<i64> = row.get(12)?;
                
                let (truncated_content, truncated_html) = if content_type == "text" || content_type == "rich_text" || content_type == "link" {
                    let truncated_content = if content.len() > MAX_CONTENT_LENGTH {
                        if let Some(ref keyword) = search_keyword {
                            if !keyword.trim().is_empty() {
                                truncate_around_keyword(content.clone(), keyword, MAX_CONTENT_LENGTH)
                            } else {
                                truncate_string(content.clone(), MAX_CONTENT_LENGTH)
                            }
                        } else {
                            truncate_string(content.clone(), MAX_CONTENT_LENGTH)
                        }
                    } else {
                        content.clone()
                    };
                    
                    let truncated_html = html_content.map(|h| {
                        if h.len() > MAX_CONTENT_LENGTH {
                            truncate_html(h, MAX_CONTENT_LENGTH)
                        } else {
                            h
                        }
                    });
                    
                    (truncated_content, truncated_html)
                } else {
                    (content.clone(), html_content)
                };

                let needs_char_count = content_type.contains("text") || content_type.contains("rich_text");
                let final_char_count = if char_count.is_none() && needs_char_count && !content.is_empty() {
                    Some(content.chars().count() as i64)
                } else {
                    char_count
                };
                
                Ok((ClipboardItem {
                    id,
                    content: truncated_content,
                    html_content: truncated_html,
                    content_type: content_type.clone(),
                    image_id: row.get(4)?,
                    item_order: row.get(5)?,
                    is_pinned: row.get::<_, i64>(6)? != 0,
                    paste_count: row.get(7)?,
                    source_app: row.get(8)?,
                    source_icon_hash: row.get(9)?,
                    char_count: final_char_count,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                }, char_count.is_none() && needs_char_count, id, content, content_type))
            }
        )?
        .collect::<Result<Vec<_>, _>>()?;
        
        let mut result_items = vec![];
        for (item, needs_update, id, content, content_type) in items {
            if needs_update {
                items_to_update.push((id, content, content_type));
            }
            result_items.push(item);
        }

        if !items_to_update.is_empty() {
            update_missing_char_counts(items_to_update);
        }
        
        Ok(PaginatedResult::new(total_count, result_items, params.offset, params.limit))
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
    get_clipboard_item_by_id_with_limit(id, None)
}

// 根据ID获取剪贴板项（指定截断长度）
pub fn get_clipboard_item_by_id_with_limit(id: i64, max_content_length: Option<usize>) -> Result<Option<ClipboardItem>, String> {
    with_connection(|conn| {
        conn.query_row(
            "SELECT id, content, html_content, content_type, image_id, item_order, is_pinned, paste_count, source_app, source_icon_hash, created_at, updated_at, char_count 
             FROM clipboard WHERE id = ?",
            params![id],
            |row| {
                let content: String = row.get(1)?;
                let html_content: Option<String> = row.get(2)?;
                let content_type: String = row.get(3)?;
                let char_count: Option<i64> = row.get(12)?;
                let final_content = if let Some(max_len) = max_content_length {
                    let is_text_type = content_type == "text" || content_type == "rich_text" || content_type == "link";
                    if is_text_type && content.len() > max_len {
                        truncate_string(content.clone(), max_len)
                    } else {
                        content.clone()
                    }
                } else {
                    content.clone()
                };
                
                // 计算字符数
                let final_char_count = if char_count.is_none() && (content_type.contains("text") || content_type.contains("rich_text")) && !content.is_empty() {
                    Some(content.chars().count() as i64)
                } else {
                    char_count
                };
                
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content: final_content,
                    html_content,
                    content_type,
                    image_id: row.get(4)?,
                    item_order: row.get(5)?,
                    is_pinned: row.get::<_, i64>(6)? != 0,
                    paste_count: row.get(7)?,
                    source_app: row.get(8)?,
                    source_icon_hash: row.get(9)?,
                    char_count: final_char_count,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            }
        )
        .optional()
        .map_err(|e| e.into())
    })
}

pub fn increment_paste_count(id: i64) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE clipboard SET paste_count = paste_count + 1 WHERE id = ?",
            params![id],
        )?;
        Ok(())
    })
}

// 限制剪贴板历史数量（删除超出限制的旧记录）
pub fn limit_clipboard_history(max_count: u64) -> Result<(), String> {
    if max_count >= 999999 {
        return Ok(());
    }
    
    let images_to_delete: Vec<String> = with_connection(|conn| {
        let sql_ids = "SELECT image_id FROM clipboard WHERE id NOT IN (SELECT id FROM clipboard ORDER BY is_pinned DESC, item_order DESC, updated_at DESC LIMIT ?1) AND image_id IS NOT NULL AND image_id <> ''";
        let mut stmt = conn.prepare(sql_ids)?;
        let ids_iter = stmt.query_map(params![max_count], |row| row.get::<_, String>(0))?;
        let mut set: HashSet<String> = HashSet::new();
        for r in ids_iter {
            if let Ok(s) = r {
                for iid in split_image_ids(&s) {
                    set.insert(iid);
                }
            }
        }
        drop(stmt);

        conn.execute(
            "DELETE FROM clipboard WHERE id NOT IN (
                SELECT id FROM clipboard ORDER BY is_pinned DESC, item_order DESC, updated_at DESC LIMIT ?1
            )",
            params![max_count],
        )?;

        let mut to_delete = Vec::new();
        for iid in set.into_iter() {
            if !is_image_id_referenced(conn, &iid)? {
                to_delete.push(iid);
            }
        }
        Ok(to_delete)
    })?;

    delete_image_files(images_to_delete)
}

// 删除单个剪贴板项
pub fn delete_clipboard_item(id: i64) -> Result<(), String> {
    let images_to_delete: Vec<String> = with_connection(|conn| {
        let image_ids_opt: Option<Option<String>> = conn
            .query_row(
                "SELECT image_id FROM clipboard WHERE id = ?",
                params![id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?;
        let image_ids: Option<String> = image_ids_opt.flatten();

        conn.execute("DELETE FROM clipboard WHERE id = ?1", params![id])?;

        let mut to_delete = Vec::new();
        if let Some(ids) = image_ids {
            for iid in split_image_ids(&ids) {
                if !is_image_id_referenced(conn, &iid)? {
                    to_delete.push(iid);
                }
            }
        }
        Ok(to_delete)
    })?;

    delete_image_files(images_to_delete)
}

// 清空所有剪贴板历史
pub fn clear_clipboard_history() -> Result<(), String> {
    let images_to_delete: Vec<String> = with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT image_id FROM clipboard WHERE image_id IS NOT NULL AND image_id <> ''",
        )?;
        let ids_iter = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut set: HashSet<String> = HashSet::new();
        for r in ids_iter {
            if let Ok(s) = r {
                for iid in split_image_ids(&s) {
                    set.insert(iid);
                }
            }
        }
        drop(stmt);

        conn.execute("DELETE FROM clipboard", [])?;

        let mut to_delete = Vec::new();
        for iid in set.into_iter() {
            if !is_image_id_referenced(conn, &iid)? {
                to_delete.push(iid);
            }
        }
        Ok(to_delete)
    })?;

    delete_image_files(images_to_delete)
}

// 排序逻辑
fn reorder_items(conn: &rusqlite::Connection, from_idx: usize, to_idx: usize, items: &[(i64, i64)]) -> Result<(), rusqlite::Error> {
    if from_idx == to_idx { return Ok(()); }
    
    let tx = conn.unchecked_transaction()?;
    let now = chrono::Local::now().timestamp();
    let moved_id = items[from_idx].0;
    let target_order = items[to_idx].1;

    if from_idx < to_idx {
        for i in (from_idx + 1)..=to_idx {
            tx.execute("UPDATE clipboard SET item_order = item_order + 1 WHERE id = ?1", params![items[i].0])?;
        }
    } else {
        for i in to_idx..from_idx {
            tx.execute("UPDATE clipboard SET item_order = item_order - 1 WHERE id = ?1", params![items[i].0])?;
        }
    }
    tx.execute("UPDATE clipboard SET item_order = ?1, updated_at = ?2 WHERE id = ?3", params![target_order, now, moved_id])?;
    tx.commit()
}

// 移动剪贴板项到顶部（非置顶区的顶部）
pub fn move_clipboard_item_to_top(id: i64) -> Result<(), String> {
    with_connection(|conn| {
        let now = chrono::Local::now().timestamp();
        let max_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(item_order), 0) FROM clipboard WHERE is_pinned = 0",
            [],
            |row| row.get(0)
        ).unwrap_or(0);
        
        conn.execute(
            "UPDATE clipboard SET item_order = ?1, updated_at = ?2 WHERE id = ?3 AND is_pinned = 0",
            params![max_order + 1, now, id],
        )?;
        Ok(())
    })
}

// 移动剪贴板项
pub fn move_clipboard_item_by_id(from_id: i64, to_id: i64) -> Result<(), String> {
    if from_id == to_id { return Ok(()); }

    with_connection(|conn| {
        let from_pinned: i64 = conn.query_row(
            "SELECT is_pinned FROM clipboard WHERE id = ?",
            params![from_id], |row| row.get(0)
        )?;
        let to_pinned: i64 = conn.query_row(
            "SELECT is_pinned FROM clipboard WHERE id = ?",
            params![to_id], |row| row.get(0)
        )?;
        
        if from_pinned != to_pinned {
            return Ok(());
        }
        
        let items: Vec<(i64, i64)> = conn.prepare("SELECT id, item_order FROM clipboard ORDER BY is_pinned DESC, item_order DESC, updated_at DESC")?
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let from_idx = items.iter().position(|(id, _)| *id == from_id)
            .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("ID {} 不存在", from_id)))?;
        let to_idx = items.iter().position(|(id, _)| *id == to_id)
            .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("ID {} 不存在", to_id)))?;
        
        reorder_items(conn, from_idx, to_idx, &items)
    })
}

// 更新剪贴板项的内容
pub fn update_clipboard_item(id: i64, content: String) -> Result<(), String> {
    with_connection(|conn| {
        let rows = conn.execute(
            "UPDATE clipboard SET content = ?1, updated_at = ?2 WHERE id = ?3",
            params![content, chrono::Local::now().timestamp(), id],
        )?;
        if rows == 0 { Err(rusqlite::Error::QueryReturnedNoRows) } else { Ok(()) }
    }).map_err(|e| if e.contains("QueryReturnedNoRows") {
        format!("剪贴板项不存在: {}", id)
    } else { e })
}

// 切换剪贴板项的置顶状态（置顶时放到置顶区第一位，取消置顶时移到非置顶区第一位）
pub fn toggle_pin_clipboard_item(id: i64) -> Result<bool, String> {
    with_connection(|conn| {
        let current_pinned: i64 = conn.query_row(
            "SELECT is_pinned FROM clipboard WHERE id = ?", params![id], |row| row.get(0)
        )?;
        
        let now = chrono::Local::now().timestamp();
        if current_pinned == 0 {
            let max_pinned_order: i64 = conn.query_row(
                "SELECT COALESCE(MAX(item_order), 0) FROM clipboard WHERE is_pinned = 1", [], |row| row.get(0)
            ).unwrap_or(0);
            conn.execute("UPDATE clipboard SET is_pinned = 1, item_order = ?1, updated_at = ?2 WHERE id = ?3", params![max_pinned_order + 1, now, id])?;
            Ok(true)
        } else {
            let max_order: i64 = conn.query_row(
                "SELECT COALESCE(MAX(item_order), 0) FROM clipboard WHERE is_pinned = 0", [], |row| row.get(0)
            ).unwrap_or(0);
            conn.execute("UPDATE clipboard SET is_pinned = 0, item_order = ?1, updated_at = ?2 WHERE id = ?3", params![max_order + 1, now, id])?;
            Ok(false)
        }
    })
}


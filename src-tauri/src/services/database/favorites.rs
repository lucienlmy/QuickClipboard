use super::models::{FavoriteItem, PaginatedResult, FavoritesQueryParams};
use super::connection::{with_connection, truncate_string, MAX_CONTENT_LENGTH};
use rusqlite::{params, OptionalExtension};
use chrono;

/// 分页查询收藏列表
pub fn query_favorites(params: FavoritesQueryParams) -> Result<PaginatedResult<FavoriteItem>, String> {
    with_connection(|conn| {
        let mut where_clauses = vec![];
        let mut count_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];

        if let Some(group_name) = params.group_name {
            if group_name != "全部" {
                where_clauses.push("group_name = ?");
                count_params.push(Box::new(group_name.clone()));
                query_params.push(Box::new(group_name));
            }
        }

        if let Some(search_query) = params.search {
            if !search_query.is_empty() {
                where_clauses.push("(title LIKE ? OR content LIKE ? OR html_content LIKE ?)");
                let search_pattern = format!("%{}%", search_query);
                count_params.push(Box::new(search_pattern.clone()));
                count_params.push(Box::new(search_pattern.clone()));
                count_params.push(Box::new(search_pattern.clone()));
                query_params.push(Box::new(search_pattern.clone()));
                query_params.push(Box::new(search_pattern.clone()));
                query_params.push(Box::new(search_pattern));
            }
        }

        if let Some(content_type) = params.content_type {
            if content_type != "all" {
                where_clauses.push("content_type = ?");
                count_params.push(Box::new(content_type.clone()));
                query_params.push(Box::new(content_type));
            }
        }

        let where_sql = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };

        let total_count_sql = format!("SELECT COUNT(*) FROM favorites {}", where_sql);
        let total_count: i64 = conn.query_row(&total_count_sql, rusqlite::params_from_iter(count_params), |row| row.get(0))?;

        let query_sql = format!(
            "SELECT id, title, content, html_content, content_type, image_id, group_name, item_order, created_at, updated_at 
             FROM favorites {} ORDER BY item_order, updated_at DESC LIMIT ? OFFSET ?",
            where_sql
        );

        query_params.push(Box::new(params.limit));
        query_params.push(Box::new(params.offset));

        let mut stmt = conn.prepare(&query_sql)?;
        
        let items = stmt.query_map(rusqlite::params_from_iter(query_params), |row| {
            let content: String = row.get(2)?;
            let html_content: Option<String> = row.get(3)?;
            let content_type: String = row.get(4)?;

            let (truncated_content, truncated_html) = if content_type == "text" || content_type == "rich_text" || content_type == "link" {
                let truncated_content = if content.len() > MAX_CONTENT_LENGTH {
                    truncate_string(content, MAX_CONTENT_LENGTH)
                } else {
                    content
                };
                let truncated_html = html_content.map(|html| {
                    if html.len() > MAX_CONTENT_LENGTH {
                        truncate_string(html, MAX_CONTENT_LENGTH)
                    } else {
                        html
                    }
                });
                (truncated_content, truncated_html)
            } else {
                (content, html_content)
            };

            Ok(FavoriteItem {
                id: row.get(0)?,
                title: row.get(1)?,
                content: truncated_content,
                html_content: truncated_html,
                content_type,
                image_id: row.get(5)?,
                group_name: row.get(6)?,
                item_order: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<FavoriteItem>, rusqlite::Error>>()?;
        
        Ok(PaginatedResult::new(total_count, items, params.offset, params.limit))
    })
}

/// 获取收藏总数
pub fn get_favorites_count(group_name: Option<String>) -> Result<i64, String> {
    with_connection(|conn| {
        let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(group) = group_name {
            if group == "全部" {
                ("SELECT COUNT(*) FROM favorites".to_string(), vec![])
            } else {
                ("SELECT COUNT(*) FROM favorites WHERE group_name = ?".to_string(), vec![Box::new(group)])
            }
        } else {
            ("SELECT COUNT(*) FROM favorites".to_string(), vec![])
        };
        
        conn.query_row(&sql, rusqlite::params_from_iter(params), |row| row.get(0))
    })
}

/// 根据ID获取收藏项（完整内容，不截断）
pub fn get_favorite_by_id(id: &str) -> Result<Option<FavoriteItem>, String> {
    with_connection(|conn| {
        conn.query_row(
            "SELECT id, title, content, html_content, content_type, image_id, group_name, item_order, created_at, updated_at 
             FROM favorites WHERE id = ?",
            params![id],
            |row| {
                Ok(FavoriteItem {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    html_content: row.get(3)?,
                    content_type: row.get(4)?,
                    image_id: row.get(5)?,
                    group_name: row.get(6)?,
                    item_order: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            }
        )
        .optional()
        .map_err(|e| e.into())
    })
}

/// 移动收藏项（拖拽排序）
pub fn move_favorite_by_index(group_name: Option<String>, from_index: i64, to_index: i64) -> Result<(), String> {
    if from_index == to_index {
        return Ok(());
    }

    with_connection(|conn| {
        let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(group) = group_name {
            if group == "全部" {
                ("SELECT id FROM favorites ORDER BY item_order, updated_at DESC".to_string(), vec![])
            } else {
                ("SELECT id FROM favorites WHERE group_name = ? ORDER BY item_order, updated_at DESC".to_string(), vec![Box::new(group)])
            }
        } else {
            ("SELECT id FROM favorites ORDER BY item_order, updated_at DESC".to_string(), vec![])
        };

        let mut stmt = conn.prepare(&sql)?;
        
        let item_ids: Vec<String> = stmt
            .query_map(rusqlite::params_from_iter(params), |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;

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

        for (index, id) in reordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE favorites SET item_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![index as i64, now, id],
            )?;
        }

        tx.commit()?;
        Ok(())
    })
}

/// 从剪贴板历史添加到收藏
pub fn add_clipboard_to_favorites(clipboard_id: i64, group_name: Option<String>) -> Result<FavoriteItem, String> {
    use uuid::Uuid;
    
    let group_name = group_name.unwrap_or_else(|| "全部".to_string());
    
    with_connection(|conn| {
        let (content, html_content, content_type, image_id) = conn.query_row(
            "SELECT content, html_content, content_type, image_id FROM clipboard WHERE id = ?",
            params![clipboard_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            }
        )?;
        
        let title = if content.len() > 50 {
            format!("{}...", &content[..50])
        } else {
            content.clone()
        };
        
        let id = Uuid::new_v4().to_string();
        
        let max_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(item_order), -1) FROM favorites WHERE group_name = ?",
            params![&group_name],
            |row| row.get(0)
        ).unwrap_or(0);
        
        let now = chrono::Local::now().timestamp();
        
        conn.execute(
            "INSERT INTO favorites (id, title, content, html_content, content_type, image_id, group_name, item_order, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &id,
                &title,
                &content,
                &html_content,
                &content_type,
                &image_id,
                &group_name,
                max_order + 1,
                now,
                now,
            ],
        )?;
        
        Ok(FavoriteItem {
            id,
            title,
            content,
            html_content,
            content_type,
            image_id,
            group_name,
            item_order: max_order + 1,
            created_at: now,
            updated_at: now,
        })
    })
}

/// 移动收藏项到指定分组
pub fn move_favorite_to_group(id: String, group_name: String) -> Result<(), String> {
    with_connection(|conn| {
        let existing_item = conn.query_row(
            "SELECT id, group_name FROM favorites WHERE id = ?",
            params![&id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        )?;
        
        let old_group_name = existing_item.1;
        
        if old_group_name == group_name {
            return Ok(());
        }
        
        let max_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(item_order), -1) FROM favorites WHERE group_name = ?",
            params![&group_name],
            |row| row.get(0)
        ).unwrap_or(0);
        
        let now = chrono::Local::now().timestamp();
        
        conn.execute(
            "UPDATE favorites SET group_name = ?1, item_order = ?2, updated_at = ?3 WHERE id = ?4",
            params![&group_name, max_order + 1, now, &id],
        )?;
        
        let mut stmt = conn.prepare(
            "SELECT id FROM favorites WHERE group_name = ? ORDER BY item_order, updated_at DESC"
        )?;
        let item_ids: Vec<String> = stmt
            .query_map(params![&old_group_name], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        drop(stmt);
        
        for (index, item_id) in item_ids.iter().enumerate() {
            conn.execute(
                "UPDATE favorites SET item_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![index as i64, now, item_id],
            )?;
        }
        
        Ok(())
    })
}

/// 删除收藏项
pub fn delete_favorite(id: String) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute("DELETE FROM favorites WHERE id = ?1", params![id])?;
        Ok(())
    })
}


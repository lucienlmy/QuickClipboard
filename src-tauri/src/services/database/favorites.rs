use super::models::{FavoriteItem, PaginatedResult, FavoritesQueryParams};
use super::connection::{with_connection, MAX_CONTENT_LENGTH};
use crate::utils::{truncate_string, truncate_around_keyword, truncate_html};
use rusqlite::{params, OptionalExtension};
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
pub fn update_missing_favorite_char_counts(items: Vec<(String, String, String)>) {
    if items.is_empty() { return; }
    
    std::thread::spawn(move || {
        let _ = with_connection(|conn| {
            for (id, content, content_type) in items {
                if let Some(char_count) = calculate_char_count(&content, &content_type) {
                    conn.execute(
                        "UPDATE favorites SET char_count = ?1 WHERE id = ?2",
                        params![char_count, id],
                    )?;
                }
            }
            Ok(())
        });
    });
}

// 分页查询收藏列表
pub fn query_favorites(params: FavoritesQueryParams) -> Result<PaginatedResult<FavoriteItem>, String> {
    let search_keyword = params.search.clone();
    
    with_connection(|conn| {
        let mut where_clauses = vec![];
        let mut count_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];

        if let Some(ref group_name) = params.group_name {
            if group_name != "全部" {
                where_clauses.push("group_name = ?");
                count_params.push(Box::new(group_name.clone()));
                query_params.push(Box::new(group_name.clone()));
            }
        }

        if let Some(ref search_query) = search_keyword {
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
                let pattern = format!("%{}%", content_type);
                where_clauses.push("content_type LIKE ?");
                count_params.push(Box::new(pattern.clone()));
                query_params.push(Box::new(pattern));
            }
        }

        let where_sql = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };

        let total_count_sql = format!("SELECT COUNT(*) FROM favorites {}", where_sql);
        let total_count: i64 = conn.query_row(&total_count_sql, rusqlite::params_from_iter(count_params), |row| row.get(0))?;

        let is_all_groups = params.group_name.is_none() || 
                           params.group_name.as_ref().map(|g| g == "全部").unwrap_or(false);
        
        let query_sql = if is_all_groups {
            // 查询全部分组时，按分组顺序排列
            format!(
                "SELECT f.id, f.title, f.content, f.html_content, f.content_type, f.image_id, f.group_name, f.item_order, f.paste_count, f.created_at, f.updated_at, f.char_count 
                 FROM favorites f 
                 LEFT JOIN groups g ON f.group_name = g.name 
                 {} 
                 ORDER BY CASE WHEN f.group_name = '全部' THEN 0 ELSE 1 END, COALESCE(g.order_index, 999999), f.item_order DESC, f.updated_at DESC 
                 LIMIT ? OFFSET ?",
                where_sql
            )
        } else {
            format!(
                "SELECT id, title, content, html_content, content_type, image_id, group_name, item_order, paste_count, created_at, updated_at, char_count 
                 FROM favorites {} ORDER BY item_order DESC, updated_at DESC LIMIT ? OFFSET ?",
                where_sql
            )
        };

        query_params.push(Box::new(params.limit));
        query_params.push(Box::new(params.offset));

        let mut stmt = conn.prepare(&query_sql)?;

        let mut items_to_update: Vec<(String, String, String)> = vec![];
        
        let items = stmt.query_map(rusqlite::params_from_iter(query_params), |row| {
            let id: String = row.get(0)?;
            let content: String = row.get(2)?;
            let html_content: Option<String> = row.get(3)?;
            let content_type: String = row.get(4)?;
            let char_count: Option<i64> = row.get(11)?;

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
                let truncated_html = html_content.map(|html| {
                    if html.len() > MAX_CONTENT_LENGTH {
                        truncate_html(html, MAX_CONTENT_LENGTH)
                    } else {
                        html
                    }
                });
                (truncated_content, truncated_html)
            } else {
                (content.clone(), html_content)
            };

            // 计算字符数
            let needs_char_count = content_type.contains("text") || content_type.contains("rich_text");
            let final_char_count = if char_count.is_none() && needs_char_count && !content.is_empty() {
                Some(content.chars().count() as i64)
            } else {
                char_count
            };

            Ok((FavoriteItem {
                id: id.clone(),
                title: row.get(1)?,
                content: truncated_content,
                html_content: truncated_html,
                content_type: content_type.clone(),
                image_id: row.get(5)?,
                group_name: row.get(6)?,
                item_order: row.get(7)?,
                paste_count: row.get(8)?,
                char_count: final_char_count,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            }, char_count.is_none() && needs_char_count, id, content, content_type))
        })?
        .collect::<Result<Vec<_>, rusqlite::Error>>()?;

        let mut result_items = vec![];
        for (item, needs_update, id, content, content_type) in items {
            if needs_update {
                items_to_update.push((id, content, content_type));
            }
            result_items.push(item);
        }

        if !items_to_update.is_empty() {
            update_missing_favorite_char_counts(items_to_update);
        }
        
        Ok(PaginatedResult::new(total_count, result_items, params.offset, params.limit))
    })
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

// 获取收藏总数
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

// 根据ID获取收藏项（完整内容，不截断）
pub fn get_favorite_by_id(id: &str) -> Result<Option<FavoriteItem>, String> {
    with_connection(|conn| {
        conn.query_row(
            "SELECT id, title, content, html_content, content_type, image_id, group_name, item_order, paste_count, created_at, updated_at, char_count 
             FROM favorites WHERE id = ?",
            params![id],
            |row| {
                let content: String = row.get(2)?;
                let content_type: String = row.get(4)?;
                let char_count: Option<i64> = row.get(11)?;
                
                // 计算字符数
                let final_char_count = if char_count.is_none() && (content_type.contains("text") || content_type.contains("rich_text")) && !content.is_empty() {
                    Some(content.chars().count() as i64)
                } else {
                    char_count
                };
                
                Ok(FavoriteItem {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content,
                    html_content: row.get(3)?,
                    content_type,
                    image_id: row.get(5)?,
                    group_name: row.get(6)?,
                    item_order: row.get(7)?,
                    paste_count: row.get(8)?,
                    char_count: final_char_count,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            }
        )
        .optional()
        .map_err(|e| e.into())
    })
}

pub fn increment_favorite_paste_count(id: &str) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE favorites SET paste_count = paste_count + 1 WHERE id = ?",
            params![id],
        )?;
        Ok(())
    })
}

// 排序逻辑
fn reorder_favorite_items(conn: &rusqlite::Connection, from_idx: usize, to_idx: usize, items: &[(String, i64)]) -> Result<(), rusqlite::Error> {
    if from_idx == to_idx { return Ok(()); }
    
    let tx = conn.unchecked_transaction()?;
    let now = chrono::Local::now().timestamp();
    let moved_id = &items[from_idx].0;
    let target_order = items[to_idx].1;

    if from_idx < to_idx {
        for i in (from_idx + 1)..=to_idx {
            tx.execute("UPDATE favorites SET item_order = item_order + 1 WHERE id = ?1", params![items[i].0])?;
        }
    } else {
        for i in to_idx..from_idx {
            tx.execute("UPDATE favorites SET item_order = item_order - 1 WHERE id = ?1", params![items[i].0])?;
        }
    }
    tx.execute("UPDATE favorites SET item_order = ?1, updated_at = ?2 WHERE id = ?3", params![target_order, now, moved_id])?;
    tx.commit()
}

// 移动收藏项
pub fn move_favorite_by_id(group_name: Option<String>, from_id: String, to_id: String) -> Result<(), String> {
    if from_id == to_id { return Ok(()); }

    with_connection(|conn| {
        let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = match &group_name {
            Some(group) if group != "全部" => (
                "SELECT id, item_order FROM favorites WHERE group_name = ? ORDER BY item_order DESC, updated_at DESC".to_string(),
                vec![Box::new(group.clone()) as Box<dyn rusqlite::ToSql>]
            ),
            _ => (
                "SELECT id, item_order FROM favorites ORDER BY item_order DESC, updated_at DESC".to_string(),
                vec![]
            ),
        };

        let items: Vec<(String, i64)> = conn.prepare(&sql)?
            .query_map(rusqlite::params_from_iter(params), |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let from_idx = items.iter().position(|(id, _)| id == &from_id)
            .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("ID {} 不存在", from_id)))?;
        let to_idx = items.iter().position(|(id, _)| id == &to_id)
            .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("ID {} 不存在", to_id)))?;

        reorder_favorite_items(conn, from_idx, to_idx, &items)
    })
}

// 从剪贴板历史添加到收藏
pub fn add_clipboard_to_favorites(clipboard_id: i64, group_name: Option<String>) -> Result<FavoriteItem, String> {
    use uuid::Uuid;
    
    let group_name = group_name.unwrap_or_else(|| "全部".to_string());
    
    with_connection(|conn| {
        let (content, html_content, content_type, image_id, char_count) = conn.query_row(
            "SELECT content, html_content, content_type, image_id, char_count FROM clipboard WHERE id = ?",
            params![clipboard_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<i64>>(4)?,
                ))
            }
        )?;
        
        let title = String::new();

        let final_char_count = if char_count.is_none() && (content_type.contains("text") || content_type.contains("rich_text")) && !content.is_empty() {
            Some(content.chars().count() as i64)
        } else {
            char_count
        };
        
        let id = Uuid::new_v4().to_string();
        let now = chrono::Local::now().timestamp();
        
        let max_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(item_order), 0) FROM favorites WHERE group_name = ?",
            params![&group_name],
            |row| row.get(0)
        ).unwrap_or(0);
        let new_order = max_order + 1;
        
        conn.execute(
            "INSERT INTO favorites (id, title, content, html_content, content_type, image_id, group_name, item_order, char_count, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                &id,
                &title,
                &content,
                &html_content,
                &content_type,
                &image_id,
                &group_name,
                new_order,
                final_char_count,
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
            item_order: new_order,
            paste_count: 0,
            char_count: final_char_count,
            created_at: now,
            updated_at: now,
        })
    })
}

// 移动收藏项到指定分组
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
        
        let now = chrono::Local::now().timestamp();
        
        let max_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(item_order), 0) FROM favorites WHERE group_name = ?",
            params![&group_name], |row| row.get(0)
        ).unwrap_or(0);
        let new_order = max_order + 1;
        
        conn.execute(
            "UPDATE favorites SET group_name = ?1, item_order = ?2, updated_at = ?3 WHERE id = ?4",
            params![&group_name, new_order, now, &id],
        )?;
        
        let mut stmt = conn.prepare(
            "SELECT id FROM favorites WHERE group_name = ? ORDER BY item_order DESC, updated_at DESC"
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

// 删除收藏项
pub fn delete_favorite(id: String) -> Result<(), String> {
    let images_to_delete: Vec<String> = with_connection(|conn| {
        let image_ids_opt: Option<Option<String>> = conn
            .query_row(
                "SELECT image_id FROM favorites WHERE id = ?",
                params![&id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?;
        let image_ids: Option<String> = image_ids_opt.flatten();

        conn.execute("DELETE FROM favorites WHERE id = ?1", params![id])?;

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

// 添加收藏项
pub fn add_favorite(title: String, content: String, group_name: Option<String>) -> Result<FavoriteItem, String> {
    use uuid::Uuid;
    
    let group_name = group_name.unwrap_or_else(|| "全部".to_string());
    let (id, now) = (Uuid::new_v4().to_string(), chrono::Local::now().timestamp());

    let char_count = Some(content.chars().count() as i64);
    
    with_connection(|conn| {
        let max_order: i64 = conn.query_row(
            "SELECT COALESCE(MAX(item_order), 0) FROM favorites WHERE group_name = ?",
            params![&group_name], |row| row.get(0)
        ).unwrap_or(0);
        let new_order = max_order + 1;
        
        conn.execute(
            "INSERT INTO favorites (id, title, content, html_content, content_type, image_id, group_name, item_order, char_count, created_at, updated_at) 
             VALUES (?1, ?2, ?3, NULL, 'text', NULL, ?4, ?5, ?6, ?7, ?8)",
            params![&id, &title, &content, &group_name, new_order, char_count, now, now],
        )?;
        
        Ok(FavoriteItem {
            id: id.clone(), title, content, html_content: None,
            content_type: "text".to_string(), image_id: None, group_name,
            item_order: new_order, paste_count: 0, char_count, created_at: now, updated_at: now,
        })
    })
}

// 更新收藏项
pub fn update_favorite(id: String, title: String, content: String, group_name: Option<String>) -> Result<FavoriteItem, String> {
    let group_name = group_name.unwrap_or_else(|| "全部".to_string());
    
    with_connection(|conn| {
        let (old_group_name, content_type) = conn.query_row(
            "SELECT group_name, content_type FROM favorites WHERE id = ?", params![&id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        ).optional()?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        
        let now = chrono::Local::now().timestamp();

        let char_count = calculate_char_count(&content, &content_type);
        
        if old_group_name != group_name {
            let max_order: i64 = conn.query_row(
                "SELECT COALESCE(MAX(item_order), 0) FROM favorites WHERE group_name = ?",
                params![&group_name], |row| row.get(0)
            ).unwrap_or(0);
            let new_order = max_order + 1;
            
            conn.execute(
                "UPDATE favorites SET title = ?1, content = ?2, group_name = ?3, item_order = ?4, char_count = ?5, updated_at = ?6 WHERE id = ?7",
                params![&title, &content, &group_name, new_order, char_count, now, &id],
            )?;
            
            let item_ids: Vec<String> = conn.prepare(
                "SELECT id FROM favorites WHERE group_name = ? ORDER BY item_order DESC, updated_at DESC"
            )?.query_map(params![&old_group_name], |row| row.get(0))?
              .collect::<Result<Vec<String>, _>>()?;
            
            for (index, item_id) in item_ids.iter().enumerate() {
                conn.execute(
                    "UPDATE favorites SET item_order = ?1, updated_at = ?2 WHERE id = ?3",
                    params![index as i64, now, item_id],
                )?;
            }
        } else {
            conn.execute(
                "UPDATE favorites SET title = ?1, content = ?2, char_count = ?3, updated_at = ?4 WHERE id = ?5",
                params![&title, &content, char_count, now, &id],
            )?;
        }
        Ok(())
    })?;
    
    get_favorite_by_id(&id)?.ok_or_else(|| format!("更新后无法获取收藏项: {}", id))
}


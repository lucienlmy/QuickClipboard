use super::models::{ClipboardItem, FavoriteItem, GroupInfo, PaginatedResult, QueryParams, FavoritesQueryParams};
use rusqlite::{params, Connection, OptionalExtension};
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use chrono;

// 数据库连接
static DB_CONNECTION: Lazy<Mutex<Option<Connection>>> = 
    Lazy::new(|| Mutex::new(None));

// 文本内容显示限制
const MAX_CONTENT_LENGTH: usize = 10000;

/// 初始化数据库连接
pub fn init_database(db_path: &str) -> Result<(), String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    
    // 创建表结构
    create_tables(&conn)?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = 10000;
         PRAGMA temp_store = MEMORY;"
    ).map_err(|e| format!("设置数据库参数失败: {}", e))?;
    
    let mut db_conn = DB_CONNECTION.lock();
    *db_conn = Some(conn);
    
    println!("数据库初始化完成: {}", db_path);
    Ok(())
}

/// 创建数据库表
fn create_tables(conn: &Connection) -> Result<(), String> {
    // 剪贴板表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            html_content TEXT,
            content_type TEXT NOT NULL DEFAULT 'text',
            image_id TEXT,
            item_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("创建剪贴板表失败: {}", e))?;

    // 收藏表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS favorites (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            html_content TEXT,
            content_type TEXT NOT NULL DEFAULT 'text',
            image_id TEXT,
            group_name TEXT NOT NULL DEFAULT '全部',
            item_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("创建收藏表失败: {}", e))?;

    // 分组表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS groups (
            name TEXT PRIMARY KEY,
            icon TEXT NOT NULL DEFAULT 'ti ti-folder',
            order_index INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("创建分组表失败: {}", e))?;

    // 图片数据表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS image_data (
            image_id TEXT PRIMARY KEY,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            bgra_data BLOB NOT NULL,
            png_data BLOB NOT NULL,
            created_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("创建图片表失败: {}", e))?;

    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_order_updated ON clipboard(item_order ASC, updated_at DESC)",
        [],
    ).map_err(|e| format!("创建剪贴板索引失败: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_favorites_group ON favorites(group_name, item_order)",
        [],
    ).map_err(|e| format!("创建收藏索引失败: {}", e))?;

    Ok(())
}

/// 获取数据库连接
fn with_connection<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> Result<R, rusqlite::Error>,
{
    let conn_guard = DB_CONNECTION.lock();
    let conn = conn_guard.as_ref()
        .ok_or("数据库未初始化")?;
    f(conn).map_err(|e| format!("数据库操作失败: {}", e))
}

/// 截断字符串用于显示
fn truncate_string(s: String, max_len: usize) -> String {
    if s.len() <= max_len {
        return s;
    }
    
    // 计算理想截断点
    let ideal_point = max_len.saturating_sub(100);
    
    // 向前查找最近的字符边界
    let truncate_point = (0..=ideal_point)
        .rev()
        .find(|&i| s.is_char_boundary(i))
        .unwrap_or(0);
    
    if truncate_point == 0 {
        return "...(内容过长已截断)".to_string();
    }
    
    format!("{}...(内容过长已截断)", &s[..truncate_point])
}

/// 分页查询剪贴板历史
pub fn query_clipboard_items(params: QueryParams) -> Result<PaginatedResult<ClipboardItem>, String> {
    with_connection(|conn| {
        // 构建查询条件
        let mut where_clauses = vec![];
        let mut count_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        
        // 搜索过滤
        if let Some(ref search) = params.search {
            if !search.trim().is_empty() {
                where_clauses.push("content LIKE ?");
                let search_pattern = format!("%{}%", search);
                count_params.push(Box::new(search_pattern.clone()));
                query_params.push(Box::new(search_pattern));
            }
        }
        
        // 内容类型过滤
        if let Some(ref content_type) = params.content_type {
            if content_type != "all" {
                if content_type == "text" {
                    where_clauses.push("(content_type = 'text' OR content_type = 'rich_text')");
                } else {
                    where_clauses.push("content_type = ?");
                    count_params.push(Box::new(content_type.clone()));
                    query_params.push(Box::new(content_type.clone()));
                }
            }
        }
        
        // 组装WHERE子句
        let where_clause = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };
        
        // 查询总数
        let count_sql = format!("SELECT COUNT(*) FROM clipboard {}", where_clause);
        let total_count: i64 = conn.query_row(
            &count_sql,
            rusqlite::params_from_iter(count_params.iter().map(|p| p.as_ref())),
            |row| row.get(0)
        )?;
        
        // 如果总数为0，直接返回空结果
        if total_count == 0 {
            return Ok(PaginatedResult::new(0, vec![], params.offset, params.limit));
        }
        
        // 查询分页数据
        let query_sql = format!(
            "SELECT id, content, html_content, content_type, image_id, item_order, created_at, updated_at 
             FROM clipboard 
             {} 
             ORDER BY item_order ASC, updated_at DESC 
             LIMIT ? OFFSET ?",
            where_clause
        );
        
        // 添加 LIMIT 和 OFFSET 参数
        query_params.push(Box::new(params.limit));
        query_params.push(Box::new(params.offset));
        
        let mut stmt = conn.prepare(&query_sql)?;
        
        let items = stmt.query_map(
            rusqlite::params_from_iter(query_params.iter().map(|p| p.as_ref())),
            |row| {
                let content: String = row.get(1)?;
                let html_content: Option<String> = row.get(2)?;
                let content_type: String = row.get(3)?;
                
                // 截断内容（仅对文本类型）
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

/// 获取剪贴板总数
pub fn get_clipboard_count() -> Result<i64, String> {
    with_connection(|conn| {
        conn.query_row("SELECT COUNT(*) FROM clipboard", [], |row| row.get(0))
    })
}

/// 根据ID获取剪贴板项（完整内容，不截断）
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

/// 限制剪贴板历史数量（删除超出限制的旧记录）
pub fn limit_clipboard_history(max_count: u64) -> Result<(), String> {
    // 如果设置为无限制（大于等于 999999），跳过
    if max_count >= 999999 {
        return Ok(());
    }
    
    with_connection(|conn| {
        // 删除超出限制的记录
        conn.execute(
            "DELETE FROM clipboard WHERE id NOT IN (
                SELECT id FROM clipboard ORDER BY item_order, updated_at DESC LIMIT ?1
            )",
            params![max_count],
        )?;
        Ok(())
    })
}

/// 移动剪贴板项（拖拽排序）
pub fn move_clipboard_item_by_index(from_index: i64, to_index: i64) -> Result<(), String> {
    if from_index == to_index {
        return Ok(());
    }

    with_connection(|conn| {
        // 获取所有项的 ID（按当前排序）
        let mut stmt = conn.prepare(
            "SELECT id FROM clipboard ORDER BY item_order, updated_at DESC"
        )?;
        
        let item_ids: Vec<i64> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<i64>, _>>()?;

        drop(stmt); // 释放 statement

        // 检查索引范围
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

        // 执行移动操作
        let mut reordered_ids = item_ids;
        let moved_id = reordered_ids.remove(from_index as usize);
        reordered_ids.insert(to_index as usize, moved_id);

        // 开始事务批量更新 item_order
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

// ==================== 收藏列表查询 ====================

/// 分页查询收藏列表
pub fn query_favorites(params: FavoritesQueryParams) -> Result<PaginatedResult<FavoriteItem>, String> {
    with_connection(|conn| {
    
    // 构建基础查询条件
    let mut where_clauses = vec![];
    let mut count_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    let mut query_params: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    // 分组过滤
    if let Some(group_name) = params.group_name {
        if group_name != "全部" {
            where_clauses.push("group_name = ?");
            count_params.push(Box::new(group_name.clone()));
            query_params.push(Box::new(group_name));
        }
    }

    // 搜索关键词
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

    // 内容类型过滤
    if let Some(content_type) = params.content_type {
        if content_type != "all" {
            where_clauses.push("content_type = ?");
            count_params.push(Box::new(content_type.clone()));
            query_params.push(Box::new(content_type));
        }
    }

    let where_sql = if where_clauses.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    // 查询总数
    let total_count_sql = format!("SELECT COUNT(*) FROM favorites {}", where_sql);
    let total_count: i64 = conn.query_row(&total_count_sql, rusqlite::params_from_iter(count_params), |row| row.get(0))?;

    // 查询数据
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

        // 截断长文本内容
        let (truncated_content, truncated_html) = if content_type == "text" || content_type == "rich_text" || content_type == "link" {
            let truncated_content = if content.len() > MAX_CONTENT_LENGTH {
                format!("{}...", &content[..MAX_CONTENT_LENGTH])
            } else {
                content
            };
            let truncated_html = html_content.map(|html| {
                if html.len() > MAX_CONTENT_LENGTH {
                    format!("{}...", &html[..MAX_CONTENT_LENGTH])
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

/// 获取收藏总数（快速查询）
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
        // 构建查询：如果指定分组，只在该分组内排序
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

        // 检查索引范围
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

        // 执行移动操作
        let mut reordered_ids = item_ids;
        let moved_id = reordered_ids.remove(from_index as usize);
        reordered_ids.insert(to_index as usize, moved_id);

        // 开始事务批量更新 item_order
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

// ==================== 分组管理 ====================

/// 获取所有分组
pub fn get_all_groups() -> Result<Vec<GroupInfo>, String> {
    with_connection(|conn| {
        let mut groups = Vec::new();
        
        // 首先获取所有在groups表中定义的分组
        let mut stmt = conn.prepare("SELECT name, icon, order_index FROM groups ORDER BY order_index, name")?;
        let group_rows: Vec<(String, String, i32)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        
        drop(stmt);
        
        // 为每个定义的分组计算项目数量
        for (name, icon, order) in group_rows {
            let count: i32 = conn.query_row(
                "SELECT COUNT(*) FROM favorites WHERE group_name = ?1",
                params![&name],
                |row| row.get(0)
            )?;
            
            groups.push(GroupInfo {
                name,
                icon,
                order,
                item_count: count,
            });
        }
        
        Ok(groups)
    })
}

/// 添加分组
pub fn add_group(name: String, icon: String) -> Result<GroupInfo, String> {
    with_connection(|conn| {
        // 检查是否已存在同名分组
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM groups WHERE name = ?1",
            params![&name],
            |row| row.get(0)
        )?;
        
        if exists > 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                format!("分组 '{}' 已存在", name)
            ));
        }
        
        // 获取最大order_index
        let max_order: Option<i32> = conn.query_row(
            "SELECT MAX(order_index) FROM groups",
            [],
            |row| row.get(0)
        ).ok().flatten();
        
        let new_order = max_order.unwrap_or(0) + 1;
        let now = chrono::Local::now().timestamp();
        
        // 插入新分组
        conn.execute(
            "INSERT INTO groups (name, icon, order_index, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![&name, &icon, new_order, now, now],
        )?;
        
        Ok(GroupInfo {
            name,
            icon,
            order: new_order,
            item_count: 0,
        })
    })
}

/// 更新分组
pub fn update_group(old_name: String, new_name: String, new_icon: String) -> Result<GroupInfo, String> {
    with_connection(|conn| {
        // 检查新名称是否与其他分组冲突
        if old_name != new_name {
            let exists: i64 = conn.query_row(
                "SELECT COUNT(*) FROM groups WHERE name = ?1",
                params![&new_name],
                |row| row.get(0)
            )?;
            
            if exists > 0 {
                return Err(rusqlite::Error::InvalidParameterName(
                    format!("分组 '{}' 已存在", new_name)
                ));
            }
        }
        
        let now = chrono::Local::now().timestamp();
        let tx = conn.unchecked_transaction()?;
        
        // 更新分组信息
        tx.execute(
            "UPDATE groups SET name = ?1, icon = ?2, updated_at = ?3 WHERE name = ?4",
            params![&new_name, &new_icon, now, &old_name],
        )?;
        
        // 如果名称变了，更新所有收藏项的group_name
        if old_name != new_name {
            tx.execute(
                "UPDATE favorites SET group_name = ?1 WHERE group_name = ?2",
                params![&new_name, &old_name],
            )?;
        }
        
        tx.commit()?;
        
        // 获取更新后的分组信息
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE group_name = ?1",
            params![&new_name],
            |row| row.get(0)
        )?;
        
        let order: i32 = conn.query_row(
            "SELECT order_index FROM groups WHERE name = ?1",
            params![&new_name],
            |row| row.get(0)
        )?;
        
        Ok(GroupInfo {
            name: new_name,
            icon: new_icon,
            order,
            item_count: count,
        })
    })
}

/// 删除分组
pub fn delete_group(name: String) -> Result<(), String> {
    with_connection(|conn| {
        // 不允许删除"全部"分组
        if name == "全部" {
            return Err(rusqlite::Error::InvalidParameterName(
                "不能删除'全部'分组".to_string()
            ));
        }
        
        let tx = conn.unchecked_transaction()?;
        
        // 将该分组下的所有收藏项移到"全部"分组
        tx.execute(
            "UPDATE favorites SET group_name = '全部' WHERE group_name = ?1",
            params![&name],
        )?;
        
        // 删除分组
        tx.execute(
            "DELETE FROM groups WHERE name = ?1",
            params![&name],
        )?;
        
        tx.commit()?;
        Ok(())
    })
}

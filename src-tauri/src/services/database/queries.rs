use super::models::{ClipboardItem, PaginatedResult, QueryParams};
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

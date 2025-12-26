use rusqlite::Connection;
use parking_lot::Mutex;
use once_cell::sync::Lazy;

pub const MAX_CONTENT_LENGTH: usize = 1600;

// 数据库连接
static DB_CONNECTION: Lazy<Mutex<Option<Connection>>> = 
    Lazy::new(|| Mutex::new(None));

// 初始化数据库连接
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
    
    Ok(())
}

// 关闭数据库连接
pub fn close_database() {
    let mut db_conn = DB_CONNECTION.lock();
    if db_conn.is_some() {
        *db_conn = None;
    }
}

// 创建数据库表
fn create_tables(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            html_content TEXT,
            content_type TEXT NOT NULL DEFAULT 'text',
            image_id TEXT,
            item_order INTEGER NOT NULL DEFAULT 0,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("创建剪贴板表失败: {}", e))?;

    let pinned_exists = conn
        .prepare("PRAGMA table_info(clipboard)")
        .and_then(|mut stmt| {
            let columns = stmt.query_map([], |row| Ok(row.get::<_, String>(1)?))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(columns.iter().any(|c| c == "is_pinned"))
        })
        .unwrap_or(false);
    
    if !pinned_exists {
        conn.execute(
            "ALTER TABLE clipboard ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0",
            [],
        ).map_err(|e| format!("添加置顶字段失败: {}", e))?;
    }

    let paste_count_exists = conn
        .prepare("PRAGMA table_info(clipboard)")
        .and_then(|mut stmt| {
            let columns = stmt.query_map([], |row| Ok(row.get::<_, String>(1)?))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(columns.iter().any(|c| c == "paste_count"))
        })
        .unwrap_or(false);
    
    if !paste_count_exists {
        conn.execute(
            "ALTER TABLE clipboard ADD COLUMN paste_count INTEGER NOT NULL DEFAULT 0",
            [],
        ).map_err(|e| format!("添加粘贴次数字段失败: {}", e))?;
    }
    
    migrate_clipboard_order(conn);

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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS groups (
            name TEXT PRIMARY KEY,
            icon TEXT NOT NULL DEFAULT 'ti ti-folder',
            color TEXT NOT NULL DEFAULT '#dc2626',
            order_index INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("创建分组表失败: {}", e))?;

    let color_exists = conn
        .prepare("PRAGMA table_info(groups)")
        .and_then(|mut stmt| {
            let columns = stmt.query_map([], |row| {
                Ok(row.get::<_, String>(1)?)
            })?;
            Ok(columns.into_iter().any(|col| col.map(|c| c == "color").unwrap_or(false)))
        })
        .unwrap_or(false);
    
    if !color_exists {
        conn.execute(
            "ALTER TABLE groups ADD COLUMN color TEXT NOT NULL DEFAULT '#dc2626'",
            [],
        ).map_err(|e| format!("添加颜色字段失败: {}", e))?;
    }

    let fav_paste_count_exists = conn
        .prepare("PRAGMA table_info(favorites)")
        .and_then(|mut stmt| {
            let columns = stmt.query_map([], |row| Ok(row.get::<_, String>(1)?))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(columns.iter().any(|c| c == "paste_count"))
        })
        .unwrap_or(false);
    
    if !fav_paste_count_exists {
        conn.execute(
            "ALTER TABLE favorites ADD COLUMN paste_count INTEGER NOT NULL DEFAULT 0",
            [],
        ).map_err(|e| format!("添加收藏粘贴次数字段失败: {}", e))?;
    }

    let source_app_exists = conn
        .prepare("PRAGMA table_info(clipboard)")
        .and_then(|mut stmt| {
            let columns = stmt.query_map([], |row| Ok(row.get::<_, String>(1)?))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(columns.iter().any(|c| c == "source_app"))
        })
        .unwrap_or(false);
    
    if !source_app_exists {
        conn.execute("ALTER TABLE clipboard ADD COLUMN source_app TEXT", [])
            .map_err(|e| format!("添加来源应用字段失败: {}", e))?;
    }

    let source_icon_hash_exists = conn
        .prepare("PRAGMA table_info(clipboard)")
        .and_then(|mut stmt| {
            let columns = stmt.query_map([], |row| Ok(row.get::<_, String>(1)?))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(columns.iter().any(|c| c == "source_icon_hash"))
        })
        .unwrap_or(false);
    
    if !source_icon_hash_exists {
        conn.execute("ALTER TABLE clipboard ADD COLUMN source_icon_hash TEXT", [])
            .map_err(|e| format!("添加来源图标哈希字段失败: {}", e))?;
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_order ON clipboard(is_pinned DESC, item_order DESC, updated_at DESC)",
        [],
    ).map_err(|e| format!("创建剪贴板排序索引失败: {}", e))?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_content_type ON clipboard(content_type)",
        [],
    ).map_err(|e| format!("创建内容类型索引失败: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_favorites_group ON favorites(group_name, item_order)",
        [],
    ).map_err(|e| format!("创建收藏索引失败: {}", e))?;

    Ok(())
}

// 迁移 item_order（ASC → DESC）
pub fn migrate_clipboard_order(conn: &Connection) {
    let need_migrate: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM clipboard WHERE item_order < 0) 
         OR (SELECT MAX(item_order) FROM clipboard) < (SELECT COUNT(*) FROM clipboard)",
        [], |row| row.get(0)
    ).unwrap_or(false);
    
    if need_migrate {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id FROM clipboard ORDER BY is_pinned DESC, item_order ASC, updated_at DESC"
        ) {
            let ids: Vec<i64> = stmt.query_map([], |row| row.get(0))
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
                .unwrap_or_default();
            let count = ids.len() as i64;
            for (i, id) in ids.iter().enumerate() {
                conn.execute("UPDATE clipboard SET item_order = ? WHERE id = ?",
                    rusqlite::params![count - i as i64, id]).ok();
            }
        }
    }
    
    // 收藏迁移：按分组独立处理
    if let Ok(groups) = conn.prepare("SELECT DISTINCT group_name FROM favorites")
        .and_then(|mut s| s.query_map([], |r| r.get::<_, String>(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>()))
    {
        for group in groups {
            let need: bool = conn.query_row(
                "SELECT (SELECT MAX(item_order) FROM favorites WHERE group_name = ?1) 
                      < (SELECT COUNT(*) FROM favorites WHERE group_name = ?1)",
                [&group], |row| row.get(0)
            ).unwrap_or(false);
            
            if need {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT id FROM favorites WHERE group_name = ? ORDER BY item_order ASC, updated_at DESC"
                ) {
                    let ids: Vec<String> = stmt.query_map([&group], |row| row.get(0))
                        .map(|rows| rows.filter_map(|r| r.ok()).collect())
                        .unwrap_or_default();
                    let count = ids.len() as i64;
                    for (i, id) in ids.iter().enumerate() {
                        conn.execute("UPDATE favorites SET item_order = ? WHERE id = ?",
                            rusqlite::params![count - i as i64, id]).ok();
                    }
                }
            }
        }
    }
}

// 获取数据库连接
pub fn with_connection<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> Result<R, rusqlite::Error>,
{
    let conn_guard = DB_CONNECTION.lock();
    let conn = conn_guard.as_ref()
        .ok_or("数据库未初始化")?;
    f(conn).map_err(|e| format!("数据库操作失败: {}", e))
}


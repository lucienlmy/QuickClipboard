use once_cell::sync::Lazy;
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

// 对于文本内容，超过此限制会被截断
const MAX_CONTENT_LENGTH_FOR_DISPLAY: usize = 10000;

// 数据库连接池
pub static DB_CONNECTION: Lazy<Arc<Mutex<Option<Connection>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

// 动态获取数据库文件路径
pub fn get_database_path() -> Result<PathBuf, String> {
    let data_dir = crate::settings::get_data_directory()?;
    Ok(data_dir.join("quickclipboard.db"))
}

// 内容类型枚举
#[derive(Clone, Debug, PartialEq)]
pub enum ContentType {
    Text,      // 纯文本
    RichText,  // 富文本(HTML)
    Image,     // 图片
    File,      // 文件
    Link,      // 链接
}

// 自定义序列化，使用to_string方法
impl Serialize for ContentType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// 自定义反序列化，使用from_string方法
impl<'de> Deserialize<'de> for ContentType {
    fn deserialize<D>(deserializer: D) -> Result<ContentType, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Ok(ContentType::from_string(&s))
    }
}

impl ContentType {
    pub fn to_string(&self) -> String {
        match self {
            ContentType::Text => "text".to_string(),
            ContentType::RichText => "rich_text".to_string(),
            ContentType::Image => "image".to_string(),
            ContentType::File => "file".to_string(),
            ContentType::Link => "link".to_string(),
        }
    }

    pub fn from_string(s: &str) -> Self {
        match s {
            "text" => ContentType::Text,
            "rich_text" => ContentType::RichText,
            "image" => ContentType::Image,
            "file" => ContentType::File,
            "link" => ContentType::Link,
            _ => ContentType::Text, // 默认为文本
        }
    }
}

// 剪贴板项目数据结构
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub content: String,
    pub html_content: Option<String>,
    pub content_type: ContentType,
    pub image_id: Option<String>,
    pub item_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ClipboardItem {
    pub fn new_text(content: String) -> Self {
        let now = chrono::Local::now();
        let timestamp = now.timestamp();
        
        Self {
            id: 0,
            content,
            html_content: None,
            content_type: ContentType::Text,
            image_id: None,
            item_order: 0,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    pub fn new_rich_text(content: String, html: String) -> Self {
        let now = chrono::Local::now();
        let timestamp = now.timestamp();
        
        Self {
            id: 0,
            content,
            html_content: Some(html),
            content_type: ContentType::RichText,
            image_id: None,
            item_order: 0,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    pub fn new_image(image_id: String) -> Self {
        let now = chrono::Local::now();
        let timestamp = now.timestamp();
        
        Self {
            id: 0,
            content: format!("image:{}", image_id),
            html_content: None,
            content_type: ContentType::Image,
            image_id: Some(image_id),
            item_order: 0,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    pub fn new_file(file_paths: Vec<String>) -> Self {
        let now = chrono::Local::now();
        let timestamp = now.timestamp();
        
        Self {
            id: 0,
            content: file_paths.join("\n"),
            html_content: None,
            content_type: ContentType::File,
            image_id: None,
            item_order: 0,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

    pub fn new_link(url: String) -> Self {
        let now = chrono::Local::now();
        let timestamp = now.timestamp();
        
        Self {
            id: 0,
            content: url,
            html_content: None,
            content_type: ContentType::Link,
            image_id: None,
            item_order: 0,
            created_at: timestamp,
            updated_at: timestamp,
        }
    }

}

// 常用文本数据结构
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FavoriteItem {
    pub id: String,
    pub title: String,
    pub content: String,
    pub html_content: Option<String>,
    pub content_type: ContentType,
    pub image_id: Option<String>,
    pub group_name: String,       // 分组名称（外键引用groups表）
    pub item_order: i32,          // 组内排序
    pub created_at: i64,
    pub updated_at: i64,
}

impl FavoriteItem {
    pub fn new_text(id: String, title: String, content: String, group_name: String) -> Self {
        let now = chrono::Local::now().timestamp();
        
        Self {
            id,
            title,
            content,
            html_content: None,
            content_type: ContentType::Text,
            image_id: None,
            group_name,
            item_order: 0,
            created_at: now,
            updated_at: now,
        }
    }
    
    pub fn new_text_with_html(id: String, title: String, content: String, html_content: Option<String>, group_name: String) -> Self {
        let now = chrono::Local::now().timestamp();
        let content_type = detect_content_type(&content, html_content.as_deref());
        let image_id = if content.starts_with("image:") {
            Some(content.strip_prefix("image:").unwrap_or("").to_string())
        } else {
            None
        };
        
        Self {
            id,
            title,
            content,
            html_content,
            content_type,
            image_id,
            group_name,
            item_order: 0,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn new_image(id: String, title: String, image_id: String, group_name: String) -> Self {
        let now = chrono::Local::now().timestamp();
        
        Self {
            id,
            title,
            content: format!("image:{}", image_id),
            html_content: None,
            content_type: ContentType::Image,
            image_id: Some(image_id),
            group_name,
            item_order: 0,
            created_at: now,
            updated_at: now,
        }
    }
}

// 分组统计信息（用于查询）
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroupInfo {
    pub name: String,
    pub icon: String,
    pub order: i32,
    pub item_count: i32,
}

// 初始化数据库
pub fn initialize_database() -> SqliteResult<()> {
    let db_path = get_database_path().map_err(|e| {
        eprintln!("获取数据库路径失败: {}", e);
        rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
            Some(format!("无法获取数据库路径: {}", e))
        )
    })?;
    println!("初始化数据库: {:?}", db_path);

    let conn = Connection::open(&db_path)?;

    // 创建表
    create_tables(&conn)?;

    // 存储连接
    let mut db_conn = DB_CONNECTION.lock().unwrap();
    *db_conn = Some(conn);

    println!("数据库初始化完成");
    Ok(())
}

// 创建数据库表
fn create_tables(conn: &Connection) -> SqliteResult<()> {
    // 剪贴板表（重命名并统一字段）
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
    )?;

    // 收藏表（原常用文本表，通过group_name引用groups表）
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
    )?;

    // 分组表（支持空分组）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS groups (
            name TEXT PRIMARY KEY,
            icon TEXT NOT NULL DEFAULT 'ti ti-folder',
            order_index INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard(created_at DESC)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_favorites_group ON favorites(group_name, item_order)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_favorites_updated ON favorites(updated_at DESC)",
        [],
    )?;

    // 图片数据表（存储原始BGRA数据）
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
    )?;

    Ok(())
}


// 关闭数据库连接
pub fn close_database_connection() -> Result<(), String> {
    let mut db_conn = DB_CONNECTION
        .lock()
        .map_err(|e| format!("获取数据库锁失败: {}", e))?;
    
    if let Some(conn) = db_conn.take() {
        drop(conn);
        println!("数据库连接已关闭");
    } else {
        println!("数据库连接已经是关闭状态");
    }
    
    Ok(())
}

// 重新初始化数据库连接
pub fn reinitialize_database() -> Result<(), String> {
    // 先关闭现有连接
    close_database_connection()?;
    
    // 清除连接池中的连接
    {
        let mut db_conn = DB_CONNECTION
            .lock()
            .map_err(|e| format!("获取数据库锁失败: {}", e))?;
        *db_conn = None;
    }
    
    // 重新初始化
    initialize_database()
        .map_err(|e| format!("重新初始化数据库失败: {}", e))
}

// 执行数据库操作的辅助函数
pub fn with_connection<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&Connection) -> SqliteResult<R>,
{
    let conn_arc = DB_CONNECTION.clone();
    let conn_guard = conn_arc
        .lock()
        .map_err(|e| format!("获取数据库锁失败: {}", e))?;

    match conn_guard.as_ref() {
        Some(conn) => f(conn).map_err(|e| format!("数据库操作失败: {}", e)),
        None => Err("数据库未初始化".to_string()),
    }
}

// =================== 内容类型检测函数 ===================

// 智能检测内容类型
pub fn detect_content_type(content: &str, html: Option<&str>) -> ContentType {
    // 首先检查是否为图片标识（优先级最高，避免被其他规则误判）
    if content.starts_with("image:") {
        return ContentType::Image;
    }
    
    // 检查是否为文件数据（以files:开头的JSON格式）
    if content.starts_with("files:") {
        return ContentType::File;
    }
    
    // 如果有HTML内容，直接判定为富文本
    if let Some(html_content) = html {
        if !html_content.trim().is_empty() {
            return ContentType::RichText;
        }
    }
    
    // 检查是否为URL
    if is_url(content) {
        return ContentType::Link;
    }
    // 默认为纯文本
    ContentType::Text
}

// 检查字符串是否为URL
fn is_url(text: &str) -> bool {
    let text = text.trim();
    text.starts_with("http://") || 
    text.starts_with("https://") || 
    text.starts_with("ftp://") || 
    text.starts_with("ftps://") ||
    (text.contains('.') && text.split_whitespace().count() == 1 && 
     (text.ends_with(".com") || text.ends_with(".org") || text.ends_with(".net") || 
      text.ends_with(".edu") || text.ends_with(".gov") || text.ends_with(".cn") ||
      text.ends_with(".io") || text.ends_with(".dev")))
}

// 检查字符串是否为文件路径
fn is_file_paths(text: &str) -> bool {
    let text = text.trim();
    
    // 只检查简单的文件路径模式，避免误判
    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return false;
    }
    
    let mut valid_path_count = 0;
    let total_lines = lines.len();
    
    // 检查每一行是否像文件路径
    for line in &lines {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        
        // Windows绝对路径格式: C:\path\to\file
        if line.len() >= 3 && 
           line.chars().nth(1) == Some(':') && 
           line.chars().nth(2) == Some('\\') &&
           line.chars().nth(0).map_or(false, |c| c.is_ascii_alphabetic()) {
            valid_path_count += 1;
            continue;
        }
        
        // UNC路径格式: \\server\share\path
        if line.starts_with("\\\\") && line.len() > 2 {
            valid_path_count += 1;
            continue;
        }
        
        // Unix绝对路径格式: /path/to/file
        if line.starts_with('/') && line.len() > 1 && !line.contains(' ') {
            valid_path_count += 1;
            continue;
        }
    }
    
    // 需要至少80%的行看起来像文件路径，且至少有1个有效路径
    total_lines > 0 && 
    valid_path_count > 0 &&
    (valid_path_count as f32 / total_lines as f32) >= 0.8
}

// =================== 剪贴板历史数据库操作 ===================

// 智能添加剪贴板项目（根据内容自动检测类型）
pub fn add_clipboard_item_smart(content: String, html: Option<String>) -> Result<i64, String> {
    let content_type = detect_content_type(&content, html.as_deref());
    
    match content_type {
        ContentType::Text => add_clipboard_item(content),
        ContentType::RichText => {
            if let Some(html_content) = html {
                add_clipboard_rich_text(content, html_content)
            } else {
                add_clipboard_item(content)
            }
        },
        ContentType::Link => add_clipboard_link(content),
        ContentType::File => {
            // 对于files:开头的内容，直接保存原始内容但标记为文件类型
            if content.starts_with("files:") {
                let item = ClipboardItem {
                    id: 0,
                    content,
                    html_content: html,
                    content_type: ContentType::File,
                    image_id: None,
                    item_order: 0,
                    created_at: chrono::Local::now().timestamp(),
                    updated_at: chrono::Local::now().timestamp(),
                };
                
                with_connection(|conn| {
                    let new_order = get_new_clipboard_order(conn);
                    
                    conn.execute(
                        "INSERT INTO clipboard (content, html_content, content_type, image_id, item_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![item.content, item.html_content, item.content_type.to_string(), item.image_id, new_order, item.created_at, item.updated_at],
                    )?;
            
                    Ok(conn.last_insert_rowid())
                })
            } else {
                // 传统的文件路径格式，按行分割
                let file_paths: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                add_clipboard_file(file_paths)
            }
        },
        ContentType::Image => {
            // 提取image_id
            if let Some(image_id) = content.strip_prefix("image:") {
                add_clipboard_image(image_id.to_string())
            } else {
                add_clipboard_item(content)
            }
        }
    }
}

// 获取新项目的item_order（确保新项目总是排在最前面）
fn get_new_clipboard_order(conn: &Connection) -> i32 {
    // 获取当前最小的item_order
    let min_order: i32 = conn.query_row(
        "SELECT COALESCE(MIN(item_order), 0) FROM clipboard",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    
    // 如果最小值是正数或0，使用-1；如果已经是负数，继续递减
    if min_order >= 0 {
        -1
    } else {
        min_order - 1
    }
}

// 添加剪贴板项目
pub fn add_clipboard_item(content: String) -> Result<i64, String> {
    let item = ClipboardItem::new_text(content);

    with_connection(|conn| {
        let new_order = get_new_clipboard_order(conn);
        
        conn.execute(
            "INSERT INTO clipboard (content, html_content, content_type, image_id, item_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.content, item.html_content, item.content_type.to_string(), item.image_id, new_order, item.created_at, item.updated_at],
        )?;

        Ok(conn.last_insert_rowid())
    })
}


// 添加富文本剪贴板项目
pub fn add_clipboard_rich_text(content: String, html: String) -> Result<i64, String> {
    // 在存储前统一处理HTML中的所有图片URL，转换为dataURL
    let processed_html = crate::database_image_utils::normalize_html_images(&html);
    let item = ClipboardItem::new_rich_text(content, processed_html);

    with_connection(|conn| {
        let new_order = get_new_clipboard_order(conn);
        
        conn.execute(
            "INSERT INTO clipboard (content, html_content, content_type, image_id, item_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.content, item.html_content, item.content_type.to_string(), item.image_id, new_order, item.created_at, item.updated_at],
        )?;

        Ok(conn.last_insert_rowid())
    })
}

// 添加图片剪贴板项目
pub fn add_clipboard_image(image_id: String) -> Result<i64, String> {
    let item = ClipboardItem::new_image(image_id);

    with_connection(|conn| {
        let new_order = get_new_clipboard_order(conn);
        
        conn.execute(
            "INSERT INTO clipboard (content, html_content, content_type, image_id, item_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.content, item.html_content, item.content_type.to_string(), item.image_id, new_order, item.created_at, item.updated_at],
        )?;

        Ok(conn.last_insert_rowid())
    })
}

// 添加文件剪贴板项目
pub fn add_clipboard_file(file_paths: Vec<String>) -> Result<i64, String> {
    let item = ClipboardItem::new_file(file_paths);

    with_connection(|conn| {
        let new_order = get_new_clipboard_order(conn);
        
        conn.execute(
            "INSERT INTO clipboard (content, html_content, content_type, image_id, item_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.content, item.html_content, item.content_type.to_string(), item.image_id, new_order, item.created_at, item.updated_at],
        )?;

        Ok(conn.last_insert_rowid())
    })
}

// 添加链接剪贴板项目
pub fn add_clipboard_link(url: String) -> Result<i64, String> {
    let item = ClipboardItem::new_link(url);

    with_connection(|conn| {
        let new_order = get_new_clipboard_order(conn);
        
        conn.execute(
            "INSERT INTO clipboard (content, html_content, content_type, image_id, item_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![item.content, item.html_content, item.content_type.to_string(), item.image_id, new_order, item.created_at, item.updated_at],
        )?;

        Ok(conn.last_insert_rowid())
    })
}

fn truncate_string_for_display(s: String, max_len: usize) -> String {
    let original_len = s.len();
    
    if original_len <= max_len {
        return s;
    }
    
    // 截断到最大字节数，并添加省略号提示
    let truncated = if max_len > 3 {
        let target_len = max_len - 3; 

        let mut byte_index = target_len;
        while byte_index > 0 && !s.is_char_boundary(byte_index) {
            byte_index -= 1;
        }
        
        if byte_index > 0 {
            format!("{}...", &s[..byte_index])
        } else {
            "...".to_string()
        }
    } else {
        "...".to_string()
    };
    
    println!("截断内容：原长度 {} 字节 -> 截断后长度 {} 字节", original_len, truncated.len());
    truncated
}

// 获取剪贴板历史（按更新时间倒序，支持拖拽排序）
pub fn get_clipboard_history(limit: Option<usize>) -> Result<Vec<ClipboardItem>, String> {
    with_connection(|conn| {
        let sql = if let Some(limit) = limit {
            // 如果限制数量非常大（≥999999），直接无限制
            if limit >= 999999 {
                "SELECT id, content, html_content, content_type, image_id, item_order, created_at, updated_at FROM clipboard ORDER BY item_order, updated_at DESC".to_string()
            } else {
                format!("SELECT id, content, html_content, content_type, image_id, item_order, created_at, updated_at FROM clipboard ORDER BY item_order, updated_at DESC LIMIT {}", limit)
            }
        } else {
            "SELECT id, content, html_content, content_type, image_id, item_order, created_at, updated_at FROM clipboard ORDER BY item_order, updated_at DESC".to_string()
        };

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            let content: String = row.get(1)?;
            let html_content: Option<String> = row.get(2).ok();
            let content_type = ContentType::from_string(&row.get::<_, String>(3).unwrap_or_default());

            let (truncated_content, truncated_html) = match content_type {
                ContentType::Text | ContentType::RichText | ContentType::Link => {
                    // 截断content
                    let truncated_content = if content.len() > MAX_CONTENT_LENGTH_FOR_DISPLAY {
                        truncate_string_for_display(content, MAX_CONTENT_LENGTH_FOR_DISPLAY)
                    } else {
                        content
                    };
                    
                    // 截断html_content
                    let truncated_html = if let Some(html) = html_content {
                        if html.len() > MAX_CONTENT_LENGTH_FOR_DISPLAY {
                            Some(truncate_string_for_display(html, MAX_CONTENT_LENGTH_FOR_DISPLAY))
                        } else {
                            Some(html)
                        }
                    } else {
                        None
                    };
                    
                    (truncated_content, truncated_html)
                },
                // 图片和文件类型不截断
                ContentType::Image | ContentType::File => {
                    (content, html_content)
                }
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
        })?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }

        Ok(items)
    })
}

// 检查剪贴板项目是否存在
pub fn clipboard_item_exists(content: &str) -> Result<Option<i64>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id FROM clipboard WHERE content = ?1 ORDER BY created_at DESC LIMIT 1",
        )?;
        let mut rows = stmt.query_map([content], |row| Ok(row.get::<_, i64>(0)?))?;

        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    })
}

// 移动剪贴板项目到最前面（使用item_order排序）
pub fn move_clipboard_item_to_front(id: i64) -> Result<(), String> {
    let now = chrono::Local::now();
    let new_timestamp = now.timestamp();

    with_connection(|conn| {
        // 获取当前最小的item_order值，然后减1以确保移动到最前面
        let min_order: i32 = conn.query_row(
            "SELECT MIN(item_order) FROM clipboard",
            [],
            |row| row.get(0)
        ).unwrap_or(0);
        
        let new_order = min_order - 1;
        
        conn.execute(
            "UPDATE clipboard SET item_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_order, new_timestamp, id],
        )?;
        Ok(())
    })
}

// 删除剪贴板项目
pub fn delete_clipboard_item(id: i64) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute("DELETE FROM clipboard WHERE id = ?1", params![id])?;
        Ok(())
    })?;
    
    crate::clipboard_history::cleanup_orphaned_images();
    
    Ok(())
}

// 更新剪贴板项目内容
pub fn update_clipboard_item(id: i64, new_content: String) -> Result<(), String> {
    let now = chrono::Local::now().timestamp();
    
    with_connection(|conn| {
        conn.execute(
            "UPDATE clipboard SET content = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_content, now, id],
        )?;
        Ok(())
    })
}

// 清空剪贴板历史
pub fn clear_clipboard_history() -> Result<(), String> {
    with_connection(|conn| {
        conn.execute("DELETE FROM clipboard", [])?;
        Ok(())
    })?;
    
    crate::clipboard_history::cleanup_orphaned_images();
    
    Ok(())
}

// 限制剪贴板历史数量
pub fn limit_clipboard_history(max_count: usize) -> Result<(), String> {
    if max_count >= 999999 {
        return Ok(());
    }
    
    with_connection(|conn| {
        // 删除超出限制的记录（保留item_order最小的记录）
        conn.execute(
            "DELETE FROM clipboard WHERE id NOT IN (
                SELECT id FROM clipboard ORDER BY item_order, updated_at DESC LIMIT ?1
            )",
            params![max_count],
        )?;
        Ok(())
    })?;
    
    crate::clipboard_history::cleanup_orphaned_images();
    
    Ok(())
}

// 批量更新剪贴板项目的时间戳（用于重新排序）
// 通过ID重新排序剪贴板项目（使用item_order字段）
pub fn reorder_clipboard_items_by_ids(ids: &[i64]) -> Result<(), String> {
    with_connection(|conn| {
        let tx = conn.unchecked_transaction()?;

        // 为手动排序的项目分配正数item_order（从0开始递增）
        // 这样它们会排在新复制内容（负数item_order）的后面
        for (index, &id) in ids.iter().enumerate() {
            tx.execute(
                "UPDATE clipboard SET item_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![index as i32, chrono::Local::now().timestamp(), id],
            )?;
        }

        tx.commit()?;
        Ok(())
    })
}

// =================== 收藏项目数据库操作 ===================

// 添加收藏项目
pub fn add_favorite_item(item: &FavoriteItem) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
                    "INSERT INTO favorites (id, title, content, html_content, content_type, image_id, group_name, item_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![item.id, item.title, item.content, item.html_content, item.content_type.to_string(), item.image_id, item.group_name, item.item_order, item.created_at, item.updated_at],
        )?;
        Ok(())
    })
}

// 获取所有收藏项目
pub fn get_all_favorite_items() -> Result<Vec<FavoriteItem>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT f.id, f.title, f.content, f.html_content, f.content_type, f.image_id, f.group_name, f.item_order, f.created_at, f.updated_at 
             FROM favorites f 
             LEFT JOIN groups g ON f.group_name = g.name 
             ORDER BY COALESCE(g.order_index, 999999), f.item_order, f.updated_at DESC"
        )?;

        let rows = stmt.query_map([], |row| {
            let content: String = row.get(2)?;
            let html_content: Option<String> = row.get(3)?;
            let content_type = ContentType::from_string(&row.get::<_, String>(4).unwrap_or_default());

            let (truncated_content, truncated_html) = match content_type {
                ContentType::Text | ContentType::RichText | ContentType::Link => {
                    // 截断content
                    let truncated_content = if content.len() > MAX_CONTENT_LENGTH_FOR_DISPLAY {
                        truncate_string_for_display(content, MAX_CONTENT_LENGTH_FOR_DISPLAY)
                    } else {
                        content
                    };
                    
                    // 截断html_content
                    let truncated_html = if let Some(html) = html_content {
                        if html.len() > MAX_CONTENT_LENGTH_FOR_DISPLAY {
                            Some(truncate_string_for_display(html, MAX_CONTENT_LENGTH_FOR_DISPLAY))
                        } else {
                            Some(html)
                        }
                    } else {
                        None
                    };
                    
                    (truncated_content, truncated_html)
                },
                // 图片和文件类型不截断
                ContentType::Image | ContentType::File => {
                    (content, html_content)
                }
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
        })?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }

        Ok(items)
    })
}

// 按分组获取收藏项目
pub fn get_favorite_items_by_group(group_name: &str) -> Result<Vec<FavoriteItem>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, content, html_content, content_type, image_id, group_name, item_order, created_at, updated_at FROM favorites WHERE group_name = ?1 ORDER BY item_order, updated_at DESC"
        )?;

        let rows = stmt.query_map([group_name], |row| {
            let content: String = row.get(2)?;
            let html_content: Option<String> = row.get(3)?;
            let content_type = ContentType::from_string(&row.get::<_, String>(4).unwrap_or_default());

            let (truncated_content, truncated_html) = match content_type {
                ContentType::Text | ContentType::RichText | ContentType::Link => {
                    let truncated_content = if content.len() > MAX_CONTENT_LENGTH_FOR_DISPLAY {
                        truncate_string_for_display(content, MAX_CONTENT_LENGTH_FOR_DISPLAY)
                    } else {
                        content
                    };
                    
                    let truncated_html = if let Some(html) = html_content {
                        if html.len() > MAX_CONTENT_LENGTH_FOR_DISPLAY {
                            Some(truncate_string_for_display(html, MAX_CONTENT_LENGTH_FOR_DISPLAY))
                        } else {
                            Some(html)
                        }
                    } else {
                        None
                    };
                    
                    (truncated_content, truncated_html)
                },
                ContentType::Image | ContentType::File => {
                    (content, html_content)
                }
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
        })?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }

        Ok(items)
    })
}

// 更新收藏项目
pub fn update_favorite_item(item: &FavoriteItem) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE favorites SET title = ?1, content = ?2, html_content = ?3, content_type = ?4, image_id = ?5, group_name = ?6, item_order = ?7, updated_at = ?8 WHERE id = ?9",
            params![item.title, item.content, item.html_content, item.content_type.to_string(), item.image_id, item.group_name, item.item_order, item.updated_at, item.id],
        )?;
        Ok(())
    })
}

// 删除收藏项目
pub fn delete_favorite_item(id: &str) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute("DELETE FROM favorites WHERE id = ?1", params![id])?;
        Ok(())
    })
}

// 检查收藏项目是否存在
pub fn favorite_item_exists(id: &str) -> Result<bool, String> {
    with_connection(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })
}

// 批量更新收藏项目的排序
pub fn reorder_favorite_items(items: &[FavoriteItem]) -> Result<(), String> {
    with_connection(|conn| {
        let tx = conn.unchecked_transaction()?;

        // 更新每个项目的排序信息
        for (index, item) in items.iter().enumerate() {
            tx.execute(
                "UPDATE favorites SET item_order = ?1, updated_at = ?2 WHERE id = ?3",
                params![index as i32, item.updated_at, item.id],
            )?;
        }

        tx.commit()?;
        Ok(())
    })
}

// =================== 分组信息查询操作 ===================

// 获取所有分组信息（合并groups表和favorites表的数据）
pub fn get_all_groups() -> Result<Vec<GroupInfo>, String> {
    with_connection(|conn| {
        let mut groups = Vec::new();
        
        // 首先获取所有在groups表中定义的分组
        let mut stmt = conn.prepare("SELECT name, icon, order_index FROM groups ORDER BY order_index, name")?;
        let group_rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i32>(2)?))
        })?;
        
        // 为每个定义的分组计算项目数量
        for group_row in group_rows {
            let (name, icon, order) = group_row?;
            let mut count_stmt = conn.prepare("SELECT COUNT(*) FROM favorites WHERE group_name = ?1")?;
            let item_count: i32 = count_stmt.query_row([&name], |row| row.get(0))?;
            
            groups.push(GroupInfo {
                name,
                icon,
                order,
                item_count,
            });
        }
        


        Ok(groups)
    })
}

// 更新分组信息（批量更新指定分组的所有项目）
pub fn update_group_info(old_name: &str, new_name: &str, new_icon: &str, new_order: i32) -> Result<(), String> {
    let now = chrono::Local::now().timestamp();
    
    with_connection(|conn| {
        let tx = conn.unchecked_transaction()?;
        
        // 更新groups表
        tx.execute(
            "UPDATE groups SET name = ?1, icon = ?2, order_index = ?3, updated_at = ?4 WHERE name = ?5",
            params![new_name, new_icon, new_order, now, old_name],
        )?;
        

        
        tx.commit()?;
        Ok(())
    })
}

// 删除分组（将分组下的所有项目移动到全部）
pub fn delete_group_items(group_name: &str) -> Result<(), String> {
    with_connection(|conn| {
        let tx = conn.unchecked_transaction()?;
        
        // 删除groups表中的分组
        tx.execute(
            "DELETE FROM groups WHERE name = ?1",
            params![group_name],
        )?;
        
        tx.commit()?;
        Ok(())
    })
}

// 检查分组是否存在
pub fn group_exists(group_name: &str) -> Result<bool, String> {
    with_connection(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM groups WHERE name = ?1",
            params![group_name],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })
}

// 清空所有数据
pub fn clear_all_data() -> Result<(), String> {
    let conn_arc = DB_CONNECTION.clone();
    let mut conn_guard = conn_arc
        .lock()
        .map_err(|e| format!("获取数据库锁失败: {}", e))?;

    match conn_guard.as_mut() {
        Some(conn) => {
            let tx = conn
                .transaction()
                .map_err(|e| format!("创建事务失败: {}", e))?;

            // 安全地清空所有表（如果表存在的话）
            let tables = vec!["clipboard", "favorites", "groups", "image_data"];

            for table in tables {
                // 检查表是否存在
                let table_exists: bool = tx
                    .prepare(&format!(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{}'",
                        table
                    ))
                    .and_then(|mut stmt| {
                        stmt.query_row([], |row| {
                            let count: i64 = row.get(0)?;
                            Ok(count > 0)
                        })
                    })
                    .unwrap_or(false);

                if table_exists {
                    tx.execute(&format!("DELETE FROM {}", table), [])
                        .map_err(|e| format!("清空表 {} 失败: {}", table, e))?;
                }
            }

            // 重置自增ID（如果sqlite_sequence表存在）
            let sequence_exists: bool = tx
                .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")
                .and_then(|mut stmt| {
                    stmt.query_row([], |row| {
                        let count: i64 = row.get(0)?;
                        Ok(count > 0)
                    })
                })
                .unwrap_or(false);

            if sequence_exists {
                tx.execute("DELETE FROM sqlite_sequence WHERE name IN ('clipboard', 'favorites')", [])
                    .map_err(|e| format!("重置自增ID失败: {}", e))?;
            }

            tx.commit().map_err(|e| format!("提交事务失败: {}", e))?;
            Ok(())
        }
        None => Err("数据库未初始化".to_string()),
    }
}

// =================== 分组管理操作 ===================

// 创建分组
pub fn create_group(name: &str, icon: &str) -> Result<(), String> {
    let conn_arc = DB_CONNECTION.clone();
    let mut conn_guard = conn_arc
        .lock()
        .map_err(|e| format!("获取数据库锁失败: {}", e))?;

    match conn_guard.as_mut() {
        Some(conn) => {
            // 先检查分组名称是否已存在
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM groups WHERE name = ?1",
                params![name],
                |row| row.get(0),
            ).map_err(|e| format!("检查分组名称失败: {}", e))?;
            
            if count > 0 {
                return Err(format!("分组名称 '{}' 已存在，请使用其他名称", name));
            }
            
            let now = chrono::Utc::now().timestamp();
            conn.execute(
                "INSERT INTO groups (name, icon, order_index, created_at, updated_at) VALUES (?1, ?2, 0, ?3, ?4)",
                params![name, icon, now, now],
            ).map_err(|e| format!("创建分组失败: {}", e))?;
            Ok(())
        }
        None => Err("数据库未初始化".to_string()),
    }
}

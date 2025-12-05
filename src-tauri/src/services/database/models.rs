use serde::{Deserialize, Serialize};

// 剪贴板项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html_content: Option<String>,
    pub content_type: String,  
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_id: Option<String>,
    pub item_order: i64,
    pub is_pinned: bool,
    pub paste_count: i64,
    pub created_at: i64,  
    pub updated_at: i64, 
}

// 收藏项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoriteItem {
    pub id: String,
    pub title: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html_content: Option<String>,
    pub content_type: String,  
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_id: Option<String>,
    pub group_name: String,
    pub item_order: i64,
    pub paste_count: i64,
    pub created_at: i64,  
    pub updated_at: i64, 
}

// 分组信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupInfo {
    pub name: String,
    pub icon: String,
    pub color: String,
    pub order: i32,
    pub item_count: i32,
}

// 分页查询结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResult<T> {
    // 总记录数
    pub total_count: i64,
    // 当前页数据
    pub items: Vec<T>,
    // 偏移量
    pub offset: i64,
    // 每页数量
    pub limit: i64,
    // 是否还有更多数据
    pub has_more: bool,
}

impl<T> PaginatedResult<T> {
    pub fn new(total_count: i64, items: Vec<T>, offset: i64, limit: i64) -> Self {
        let items_len = items.len() as i64;
        let has_more = offset + items_len < total_count;
        Self {
            total_count,
            items,
            offset,
            limit,
            has_more,
        }
    }
}

// 查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryParams {
    // 偏移量
    pub offset: i64,
    // 每页数量
    pub limit: i64,
    // 搜索关键词（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
    // 内容类型过滤（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

impl Default for QueryParams {
    fn default() -> Self {
        Self {
            offset: 0,
            limit: 50,
            search: None,
            content_type: None,
        }
    }
}

// 收藏查询参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoritesQueryParams {
    // 偏移量
    pub offset: i64,
    // 每页数量
    pub limit: i64,
    // 分组名称（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_name: Option<String>,
    // 搜索关键词（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
    // 内容类型过滤（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

impl Default for FavoritesQueryParams {
    fn default() -> Self {
        Self {
            offset: 0,
            limit: 50,
            group_name: None,
            search: None,
            content_type: None,
        }
    }
}


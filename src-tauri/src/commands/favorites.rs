use crate::services::database::{query_favorites, get_favorites_count, move_favorite_by_index, FavoritesQueryParams, PaginatedResult, FavoriteItem};

/// 分页查询收藏列表
#[tauri::command]
pub fn get_favorites_history(
    offset: Option<i64>,
    limit: Option<i64>,
    group_name: Option<String>,
    search: Option<String>,
    content_type: Option<String>,
) -> Result<PaginatedResult<FavoriteItem>, String> {
    let params = FavoritesQueryParams {
        offset: offset.unwrap_or(0),
        limit: limit.unwrap_or(50),
        group_name,
        search,
        content_type,
    };
    
    query_favorites(params)
}

/// 获取收藏总数
#[tauri::command]
pub fn get_favorites_total_count(group_name: Option<String>) -> Result<i64, String> {
    get_favorites_count(group_name)
}

/// 移动收藏项（拖拽排序）
#[tauri::command]
pub fn move_favorite_item(
    group_name: Option<String>,
    from_index: i64,
    to_index: i64,
) -> Result<(), String> {
    move_favorite_by_index(group_name, from_index, to_index)
}


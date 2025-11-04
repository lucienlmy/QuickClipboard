use crate::services::database::{
    query_favorites, get_favorites_count, move_favorite_by_index, 
    add_clipboard_to_favorites as db_add_clipboard_to_favorites,
    move_favorite_to_group as db_move_favorite_to_group,
    delete_favorite as db_delete_favorite,
    FavoritesQueryParams, PaginatedResult, FavoriteItem
};

// 分页查询收藏列表
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

// 获取收藏总数
#[tauri::command]
pub fn get_favorites_total_count(group_name: Option<String>) -> Result<i64, String> {
    get_favorites_count(group_name)
}

// 移动收藏项（拖拽排序）
#[tauri::command]
pub fn move_favorite_item(
    group_name: Option<String>,
    from_index: i64,
    to_index: i64,
) -> Result<(), String> {
    move_favorite_by_index(group_name, from_index, to_index)
}

// 从剪贴板历史添加到收藏
#[tauri::command]
pub fn add_clipboard_to_favorites(id: i64, group_name: Option<String>) -> Result<FavoriteItem, String> {
    db_add_clipboard_to_favorites(id, group_name)
}

// 移动收藏项到分组
#[tauri::command]
pub fn move_quick_text_to_group(id: String, group_name: String) -> Result<(), String> {
    db_move_favorite_to_group(id, group_name)
}

// 删除收藏项
#[tauri::command]
pub fn delete_quick_text(id: String) -> Result<(), String> {
    db_delete_favorite(id)
}


use crate::services::database::{
    query_favorites, get_favorites_count,move_favorite_by_id,
    add_clipboard_to_favorites as db_add_clipboard_to_favorites,
    move_favorite_to_group as db_move_favorite_to_group,
    delete_favorite as db_delete_favorite,
    get_favorite_by_id,
    add_favorite as db_add_favorite,
    update_favorite as db_update_favorite,
    FavoritesQueryParams, PaginatedResult, FavoriteItem
};
use crate::services::paste::FilesData;
use std::path::Path;

fn fill_file_exists_for_favorites(items: &mut [FavoriteItem]) {
    for item in items.iter_mut() {
        if item.content_type == "file" || item.content_type == "image" {
            check_and_fill_file_exists(item);
        }
    }
}

fn check_and_fill_file_exists(item: &mut FavoriteItem) {
    if !item.content.starts_with("files:") { return; }
    
    if let Ok(mut data) = serde_json::from_str::<FilesData>(&item.content[6..]) {
        for file in &mut data.files {
            let actual_path = resolve_stored_path(&file.path);
            file.exists = Path::new(&actual_path).exists();
            file.actual_path = Some(actual_path);
        }
        if let Ok(json) = serde_json::to_string(&data) {
            item.content = format!("files:{}", json);
        }
    }
}

fn resolve_stored_path(stored_path: &str) -> String {
    crate::services::resolve_stored_path(stored_path)
}

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
    
    let mut result = query_favorites(params)?;
    fill_file_exists_for_favorites(&mut result.items);
    Ok(result)
}

// 获取收藏总数
#[tauri::command]
pub fn get_favorites_total_count(group_name: Option<String>) -> Result<i64, String> {
    get_favorites_count(group_name)
}

// 移动收藏项（拖拽排序）
#[tauri::command]
pub fn move_favorite_item_by_id(
    group_name: Option<String>,
    from_id: String,
    to_id: String,
) -> Result<(), String> {
    move_favorite_by_id(group_name, from_id, to_id)
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

// 根据 ID 获取单个收藏项
#[tauri::command]
pub fn get_favorite_item_by_id_cmd(id: String) -> Result<FavoriteItem, String> {
    get_favorite_by_id(&id)?
        .ok_or_else(|| format!("收藏项不存在: {}", id))
}

// 添加收藏项
#[tauri::command]
pub fn add_quick_text(title: String, content: String, group_name: Option<String>) -> Result<FavoriteItem, String> {
    db_add_favorite(title, content, group_name)
}

// 更新收藏项
#[tauri::command]
pub fn update_quick_text(id: String, title: String, content: String, group_name: Option<String>) -> Result<FavoriteItem, String> {
    db_update_favorite(id, title, content, group_name)
}

// 复制收藏项内容（不记录到历史）
#[tauri::command]
pub fn copy_favorite_item(id: String) -> Result<(), String> {
    use crate::services::paste::set_clipboard_from_item;
    
    let item = get_favorite_by_id(&id)?
        .ok_or_else(|| format!("收藏项不存在: {}", id))?;
    
    set_clipboard_from_item(&item.content_type, &item.content, &item.html_content, true)
}


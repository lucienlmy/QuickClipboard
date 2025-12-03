use crate::services::database::{
    query_favorites, get_favorites_count, move_favorite_by_index, 
    add_clipboard_to_favorites as db_add_clipboard_to_favorites,
    move_favorite_to_group as db_move_favorite_to_group,
    delete_favorite as db_delete_favorite,
    get_favorite_by_id,
    add_favorite as db_add_favorite,
    update_favorite as db_update_favorite,
    FavoritesQueryParams, PaginatedResult, FavoriteItem
};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Deserialize, Serialize)]
struct FileInfo {
    path: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    is_directory: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    icon_data: Option<String>,
    #[serde(default)]
    file_type: String,
    #[serde(default)]
    exists: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    actual_path: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct FilesData {
    files: Vec<FileInfo>,
    #[serde(default)]
    operation: String,
}

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
    if stored_path.starts_with("clipboard_images/") || stored_path.starts_with("clipboard_images\\") {
        if let Ok(data_dir) = crate::services::get_data_directory() {
            return data_dir.join(stored_path).to_string_lossy().to_string();
        }
    }
    
    if let Some(relative_part) = extract_relative_path_from_absolute(stored_path) {
        if let Ok(data_dir) = crate::services::get_data_directory() {
            let new_path = data_dir.join(&relative_part);
            if new_path.exists() {
                return new_path.to_string_lossy().to_string();
            }
        }
    }
    
    stored_path.to_string()
}

fn extract_relative_path_from_absolute(path: &str) -> Option<String> {
    let normalized = path.replace("\\", "/");
    if let Some(idx) = normalized.find("clipboard_images/") {
        return Some(normalized[idx..].to_string());
    }
    None
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


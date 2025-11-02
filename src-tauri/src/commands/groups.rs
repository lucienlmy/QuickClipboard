use crate::services::database::{get_all_groups, add_group as db_add_group, update_group as db_update_group, delete_group as db_delete_group, GroupInfo};

/// 获取所有分组
#[tauri::command]
pub fn get_groups() -> Result<Vec<GroupInfo>, String> {
    get_all_groups()
}

/// 添加分组
#[tauri::command]
pub fn add_group(name: String, icon: String) -> Result<GroupInfo, String> {
    db_add_group(name, icon)
}

/// 更新分组
#[tauri::command]
pub fn update_group(old_name: String, new_name: String, new_icon: String) -> Result<GroupInfo, String> {
    db_update_group(old_name, new_name, new_icon)
}

/// 删除分组
#[tauri::command]
pub fn delete_group(name: String) -> Result<(), String> {
    db_delete_group(name)
}


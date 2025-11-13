use tauri::Manager;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct ChangePathPayload {
    #[serde(alias = "new_path", alias = "newPath")]
    new_path: String,
}

#[tauri::command]
pub fn dm_get_current_storage_path() -> Result<String, String> {
    let path = crate::services::data_management::get_current_storage_dir()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn dm_change_storage_path(app: tauri::AppHandle, payload: ChangePathPayload) -> Result<String, String> {
    let path = std::path::PathBuf::from(payload.new_path);
    let new_dir = crate::services::data_management::change_storage_dir(path)?;

    Ok(new_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn dm_reset_storage_path_to_default(app: tauri::AppHandle) -> Result<String, String> {
    let dir = crate::services::data_management::reset_storage_dir_to_default()?;

    Ok(dir.to_string_lossy().to_string())
}

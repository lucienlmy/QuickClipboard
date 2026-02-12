use serde::Deserialize;
use crate::services::image_library;
use std::time::Duration;

#[derive(Deserialize)]
pub struct SaveImagePayload {
    filename: String,
    data: Vec<u8>,
}

#[derive(Deserialize)]
pub struct GetImageListPayload {
    category: String,
    offset: usize,
    limit: usize,
}

#[derive(Deserialize)]
pub struct GetImageCountPayload {
    category: String,
}

#[derive(Deserialize)]
pub struct DeleteImagePayload {
    category: String,
    filename: String,
}

#[derive(Deserialize)]
pub struct RenameImagePayload {
    category: String,
    old_filename: String,
    new_filename: String,
}

#[tauri::command]
pub fn il_init() -> Result<(), String> {
    image_library::init_image_library()
}

#[tauri::command]
pub async fn il_save_image(payload: SaveImagePayload) -> Result<image_library::ImageInfo, String> {
    let filename = payload.filename;
    let data = payload.data;

    let handle = tokio::task::spawn_blocking(move || image_library::save_image(&filename, &data));
    match tokio::time::timeout(Duration::from_secs(15), handle).await {
        Ok(join_result) => join_result.map_err(|e| format!("任务执行失败: {}", e))?,
        Err(_) => Err("保存图片超时".to_string()),
    }
}

#[tauri::command]
pub fn il_get_image_list(payload: GetImageListPayload) -> Result<image_library::ImageListResult, String> {
    image_library::get_image_list(&payload.category, payload.offset, payload.limit)
}

#[tauri::command]
pub fn il_get_image_count(payload: GetImageCountPayload) -> Result<usize, String> {
    image_library::get_image_count(&payload.category)
}

#[tauri::command]
pub fn il_delete_image(payload: DeleteImagePayload) -> Result<(), String> {
    image_library::delete_image(&payload.category, &payload.filename)
}

#[tauri::command]
pub fn il_rename_image(payload: RenameImagePayload) -> Result<image_library::ImageInfo, String> {
    image_library::rename_image(&payload.category, &payload.old_filename, &payload.new_filename)
}

#[tauri::command]
pub fn il_get_images_dir() -> Result<String, String> {
    let path = image_library::get_images_dir()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn il_get_gifs_dir() -> Result<String, String> {
    let path = image_library::get_gifs_dir()?;
    Ok(path.to_string_lossy().to_string())
}

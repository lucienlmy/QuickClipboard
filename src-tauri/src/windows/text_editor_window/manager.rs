use tauri::AppHandle;
use super::creator::create_text_editor_window;

pub fn open_text_editor_window(
    app: &AppHandle,
    item_id: &str,
    item_type: &str,
    item_index: Option<i32>,
) -> Result<(), String> {
    create_text_editor_window(app, item_id, item_type, item_index)?;
    Ok(())
}


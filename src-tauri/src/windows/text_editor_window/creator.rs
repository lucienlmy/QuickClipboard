use tauri::AppHandle;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn create_text_editor_window(
    app: &AppHandle,
    item_id: &str,
    item_type: &str,
    item_index: Option<i32>,
    group_name: Option<String>,
) -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let window_label = format!("text-editor-{}-{}", item_type, timestamp);
    
    let mut url = format!("windows/textEditor/index.html?id={}&type={}", item_id, item_type);
    if let Some(index) = item_index {
        url = format!("{}&index={}", url, index);
    }
    if let Some(group) = group_name {
        url = format!("{}&group={}", url, group);
    }
    
    let _editor_window = tauri::WebviewWindowBuilder::new(
        app,
        &window_label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title("文本编辑器 - 快速剪贴板")
    .inner_size(900.0, 700.0)
    .min_inner_size(600.0, 400.0)
    .center()
    .resizable(true)
    .maximizable(true)
    .decorations(false)
    .transparent(false)
    .skip_taskbar(false)
    .visible(true)
    .focused(true)
    .build()
    .map_err(|e| format!("创建文本编辑器窗口失败: {}", e))?;

    Ok(window_label)
}


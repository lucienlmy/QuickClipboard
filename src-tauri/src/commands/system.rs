use serde_json::Value;
use clipboard_rs::{Clipboard, ClipboardContext};

// 启动内置截图功能
#[tauri::command]
pub fn start_builtin_screenshot() -> Result<(), String> {
    Ok(())
}

// 检查 AI 翻译配置
#[tauri::command]
pub fn check_ai_translation_config() -> Result<Value, String> {
    use crate::services::get_settings;
    
    let settings = get_settings();
    let is_configured = !settings.ai_api_key.is_empty() 
        && settings.ai_translation_enabled;
    
    Ok(serde_json::json!({
        "is_configured": is_configured,
        "enabled": settings.ai_translation_enabled,
        "api_key_set": !settings.ai_api_key.is_empty(),
    }))
}

// 启用 AI 翻译取消快捷键
#[tauri::command]
pub fn enable_ai_translation_cancel_shortcut() -> Result<(), String> {
    Ok(())
}

// 禁用 AI 翻译取消快捷键
#[tauri::command]
pub fn disable_ai_translation_cancel_shortcut() -> Result<(), String> {
    Ok(())
}

// 复制纯文本
#[tauri::command]
pub fn copy_text_to_clipboard(text: String) -> Result<(), String> {
    let ctx = ClipboardContext::new()
        .map_err(|e| format!("创建剪贴板上下文失败: {}", e))?;
    ctx.set_text(text)
        .map_err(|e| format!("设置剪贴板文本失败: {}", e))
}


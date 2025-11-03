use clipboard_rs::{Clipboard, ClipboardContext, ClipboardContent};

/// 粘贴纯文本
pub fn paste_text(ctx: &ClipboardContext, text: &str) -> Result<(), String> {
    ctx.set_text(text.to_string())
        .map_err(|e| format!("粘贴文本失败: {}", e))
}

/// 粘贴富文本（HTML）
pub fn paste_rich_text(
    ctx: &ClipboardContext,
    text: &str,
    html_content: &Option<String>,
) -> Result<(), String> {
    let settings = crate::services::get_settings();
    
    if let Some(html) = html_content {
        if !settings.paste_with_format {
            return paste_text(ctx, text);
        }
        ctx.set(vec![
            ClipboardContent::Text(text.to_string()),
            ClipboardContent::Html(html.clone()),
        ])
        .map_err(|e| format!("设置剪贴板内容失败: {}", e))
    } else {
        paste_text(ctx, text)
    }
}

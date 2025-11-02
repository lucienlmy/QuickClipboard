use clipboard_rs::{ClipboardContext, Clipboard};

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
    if let Some(html) = html_content {
        // 先设置纯文本作为 fallback
        ctx.set_text(text.to_string())
            .map_err(|e| format!("设置文本失败: {}", e))?;
        
        // 再设置 HTML
        ctx.set_html(html.clone())
            .map_err(|e| format!("设置HTML失败: {}", e))?;
        
        Ok(())
    } else {
        paste_text(ctx, text)
    }
}






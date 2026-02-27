use clipboard_rs::ClipboardContext;
use super::clipboard_content::{set_clipboard_text, set_clipboard_rich_text};

#[derive(Debug, Clone, PartialEq)]
pub enum PasteFormat {
    PlainText,
    WithFormat,
}


// 粘贴纯文本
pub fn paste_text(ctx: &ClipboardContext, text: &str) -> Result<(), String> {
    set_clipboard_text(ctx, text)
}

// 粘贴富文本（HTML）
pub fn paste_rich_text(
    ctx: &ClipboardContext,
    text: &str,
    html_content: &Option<String>,
) -> Result<(), String> {
    let settings = crate::services::get_settings();
    
    if let Some(html) = html_content {
        if !settings.paste_with_format {
            return set_clipboard_text(ctx, text);
        }
        set_clipboard_rich_text(ctx, text, html)
    } else {
        set_clipboard_text(ctx, text)
    }
}

// 粘贴富文本（指定格式）
pub fn paste_rich_text_with_format(
    ctx: &ClipboardContext,
    text: &str,
    html_content: &Option<String>,
    format: PasteFormat,
) -> Result<(), String> {
    match format {
        PasteFormat::PlainText => set_clipboard_text(ctx, text),
        PasteFormat::WithFormat => {
            if let Some(html) = html_content {
                set_clipboard_rich_text(ctx, text, html)
            } else {
                set_clipboard_text(ctx, text)
            }
        }
    }
}

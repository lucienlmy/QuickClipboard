use clipboard_rs::ClipboardContext;
use super::clipboard_content::{set_clipboard_text, set_clipboard_rich_text};

#[derive(Debug, Clone, PartialEq)]
pub enum PasteFormat {
    PlainText,
    WithFormat,
}


pub fn generate_cf_html(html: &str) -> String {
    let html_content = if !html.contains("<html") {
        format!(
            "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n</head>\n<body>\n<!--StartFragment-->{}\n<!--EndFragment-->\n</body>\n</html>",
            html
        )
    } else if !html.contains("<!--StartFragment-->") {
        html.replace("<body>", "<body>\n<!--StartFragment-->")
            .replace("</body>", "<!--EndFragment-->\n</body>")
    } else {
        html.to_string()
    };

    let header = "Version:0.9\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n";
    let start_html = header.len();
    let end_html = start_html + html_content.len();
    
    let start_fragment = start_html + html_content.find("<!--StartFragment-->").unwrap_or(0);
    let end_fragment = start_html + html_content.find("<!--EndFragment-->").unwrap_or(html_content.len());

    format!(
        "Version:0.9\r\nStartHTML:{:010}\r\nEndHTML:{:010}\r\nStartFragment:{:010}\r\nEndFragment:{:010}\r\n{}",
        start_html,
        end_html,
        start_fragment,
        end_fragment,
        html_content
    )
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

use clipboard_rs::{Clipboard, ClipboardContext, ClipboardContent};

#[derive(Debug, Clone, PartialEq)]
pub enum PasteFormat {
    PlainText,
    WithFormat,
}

// 粘贴纯文本
pub fn paste_text(ctx: &ClipboardContext, text: &str) -> Result<(), String> {
    ctx.set_text(text.to_string())
        .map_err(|e| format!("粘贴文本失败: {}", e))
}

fn generate_cf_html(html: &str) -> String {
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

// 粘贴富文本（HTML）
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
        
        let cf_html = generate_cf_html(html);
        
        ctx.set(vec![
            ClipboardContent::Text(text.to_string()),
            ClipboardContent::Html(cf_html),
        ])
        .map_err(|e| format!("设置剪贴板内容失败: {}", e))
    } else {
        paste_text(ctx, text)
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
        PasteFormat::PlainText => paste_text(ctx, text),
        PasteFormat::WithFormat => {
            if let Some(html) = html_content {
                let cf_html = generate_cf_html(html);
                
                ctx.set(vec![
                    ClipboardContent::Text(text.to_string()),
                    ClipboardContent::Html(cf_html),
                ])
                .map_err(|e| format!("设置剪贴板内容失败: {}", e))
            } else {
                paste_text(ctx, text)
            }
        }
    }
}

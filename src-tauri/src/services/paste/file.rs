use clipboard_rs::ClipboardContext;
use super::clipboard_content::{parse_files_content_existing, set_clipboard_files};

// 粘贴文件路径（只粘贴存在的文件）
pub fn paste_files(ctx: &ClipboardContext, content: &str) -> Result<(), String> {
    let file_paths = parse_files_content_existing(content)?;
    set_clipboard_files(ctx, file_paths)
}






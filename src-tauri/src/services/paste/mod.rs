pub mod paste_handler;
pub mod text;
mod file;
pub mod keyboard;
pub mod clipboard_content;
pub mod merge;

pub use text::PasteFormat;
pub use clipboard_content::{
    FileInfo, FilesData, 
    set_clipboard_from_item, set_clipboard_text, set_clipboard_rich_text, set_clipboard_files,
};
pub use merge::{copy_merged_items, paste_merged_items};









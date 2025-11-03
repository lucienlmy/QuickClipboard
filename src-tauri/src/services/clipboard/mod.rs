mod monitor;
mod capture;
mod processor;
mod storage;
mod content_type;

pub use monitor::{
    start_clipboard_monitor, 
    stop_clipboard_monitor, 
    is_monitor_running,
    set_app_handle,
    set_last_hash_text,
    set_last_hash_files,
};


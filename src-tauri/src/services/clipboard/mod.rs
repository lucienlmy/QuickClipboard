mod monitor;
mod capture;
mod processor;
mod storage;

pub use monitor::{
    start_clipboard_monitor, 
    stop_clipboard_monitor, 
    is_monitor_running,
    set_app_handle,
};


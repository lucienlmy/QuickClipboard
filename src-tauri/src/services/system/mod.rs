pub mod hotkey;
pub mod input_monitor;
pub mod focus;
pub mod app_filter;
pub mod win_v_hotkey;
pub mod elevate;

pub use focus::{focus_clipboard_window, restore_last_focus, save_current_focus};
pub use app_filter::{AppInfo, get_all_windows_info, is_current_app_allowed};
#[cfg(target_os = "windows")]
pub use app_filter::{start_clipboard_source_monitor, stop_clipboard_source_monitor};
pub use elevate::{is_running_as_admin, try_elevate_and_restart};

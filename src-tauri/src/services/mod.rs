pub mod clipboard;
pub mod database;
pub mod data_management;
pub mod notification;
pub mod settings;
pub mod system;
pub mod paste;
pub mod sound;
pub mod screenshot;
pub mod image_library;

pub use settings::{AppSettings, get_settings, update_settings, get_data_directory};
pub use notification::show_startup_notification;
pub use system::hotkey;
pub use sound::{SoundPlayer, AppSounds};

pub fn is_portable_build() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()))
        .map(|name| name.contains("portable"))
        .unwrap_or(false)
}

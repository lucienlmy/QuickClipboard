pub mod main_window;
pub mod settings_window;
pub mod text_editor_window;
pub mod quickpaste;
pub mod tray;
pub mod plugins;
pub mod pin_image_window;
pub mod updater_window;

#[cfg(feature = "gpu-image-viewer")]
pub mod native_pin_window;
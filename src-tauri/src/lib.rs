#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod windows;

// 公共 API 导出
pub use windows::main_window::{
    get_main_window,
    is_main_window_visible,
    show_main_window,
    hide_main_window,
    toggle_main_window_visibility,
};

pub use windows::tray::{
    setup_tray,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

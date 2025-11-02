#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod commands;
mod services;
mod utils;
mod windows;

// ========== 工具 API ==========
pub use utils::mouse;
pub use utils::screen;

// ========== 服务 API ==========
pub use services::{
    AppSettings,
    get_settings,
    update_settings,
    get_data_directory,
    hotkey,
};

pub use services::system::input_monitor;

// ========== 窗口 API ==========
pub use windows::main_window::{
    get_main_window,
    is_main_window_visible,
    show_main_window,
    hide_main_window,
    toggle_main_window_visibility,
    position_at_cursor,
    center_window,
    get_window_bounds,
    start_drag,
    stop_drag,
    is_dragging,
    check_snap,
    snap_to_edge,
    restore_from_snap,
    is_window_snapped,
    hide_snapped_window,
    show_snapped_window,
    init_edge_monitor,
    WindowState,
    SnapEdge,
    get_window_state,
    set_window_state,
};

pub use windows::tray::setup_tray;

// ========== 应用启动 ==========
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
            .invoke_handler(tauri::generate_handler![
                commands::start_custom_drag,
                commands::stop_custom_drag,
                commands::toggle_main_window,
                commands::hide_main_window,
                commands::show_main_window,
                commands::check_window_snap,
                commands::position_window_at_cursor,
                commands::center_main_window,
                commands::get_clipboard_history,
                commands::get_clipboard_total_count,
                commands::move_clipboard_item,
                commands::apply_history_limit,
                commands::get_image_file_path,
                commands::get_favorites_history,
                commands::get_favorites_total_count,
                commands::move_favorite_item,
                commands::get_groups,
                commands::add_group,
                commands::update_group,
                commands::delete_group,
            ])
        .setup(|app| {
                let window = app.get_webview_window("main")
                    .ok_or("无法获取主窗口")?;
                window.set_focusable(false)
                    .map_err(|e| format!("设置窗口无焦点失败: {}", e))?;
                
                // 打开开发者工具
                window.open_devtools();
                // 初始化数据库
                let data_dir = get_data_directory()?;
                let db_path = data_dir.join("quickclipboard.db");
                services::database::init_database(db_path.to_str()
                    .ok_or("数据库路径无效")?)?;
                
                // 应用历史记录数量限制
                let settings = get_settings();
                if let Err(e) = services::database::limit_clipboard_history(settings.history_limit) {
                    eprintln!("应用历史记录限制失败: {}", e);
                    }
                
                utils::init_screen_utils(app.handle().clone());

                hotkey::init_hotkey_manager(app.handle().clone(), window.clone());
                input_monitor::init_input_monitor(window.clone());
                init_edge_monitor(window);
                setup_tray(app.handle())?;
                hotkey::reload_from_settings()?;
                input_monitor::start_monitoring();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

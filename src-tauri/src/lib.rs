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
pub use services::clipboard::{
    start_clipboard_monitor,
    stop_clipboard_monitor,
    is_monitor_running as is_clipboard_monitor_running,
    set_app_handle as set_clipboard_app_handle,
};

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
pub use windows::settings_window::open_settings_window;

// ========== 插件 API ==========
pub use windows::plugins::context_menu::is_context_menu_visible;

// ========== 应用启动 ==========
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
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
                commands::get_data_directory,
                commands::focus_clipboard_window,
                commands::restore_last_focus,
                commands::hide_main_window_if_auto_shown,
                commands::set_window_pinned,
                commands::toggle_window_visibility,
                commands::open_settings_window,
                commands::get_clipboard_history,
                commands::get_clipboard_total_count,
                commands::move_clipboard_item,
                commands::apply_history_limit,
                commands::paste_content,
                commands::delete_clipboard_item,
                commands::clear_clipboard_history,
                commands::save_image_from_clipboard,
                commands::get_favorites_history,
                commands::get_favorites_total_count,
                commands::move_favorite_item,
                commands::add_clipboard_to_favorites,
                commands::move_quick_text_to_group,
                commands::delete_quick_text,
                commands::get_groups,
                commands::add_group,
                commands::update_group,
                commands::delete_group,
                commands::reload_settings,
                commands::save_settings,
                commands::get_settings_cmd,
                commands::set_edge_hide_enabled,
                commands::get_all_windows_info_cmd,
                commands::is_portable_mode,
                commands::get_app_version,
                commands::get_data_directory_cmd,
                commands::set_auto_start,
                commands::get_auto_start_status,
                commands::reload_hotkeys,
                commands::enable_hotkeys,
                commands::disable_hotkeys,
                commands::is_hotkeys_enabled,
                commands::get_shortcut_statuses,
                commands::get_shortcut_status,
                commands::save_window_position,
                commands::save_window_size,
                commands::start_builtin_screenshot,
                commands::check_ai_translation_config,
                commands::enable_ai_translation_cancel_shortcut,
                commands::disable_ai_translation_cancel_shortcut,
                // 右键菜单命令
                windows::plugins::context_menu::commands::show_context_menu,
                windows::plugins::context_menu::commands::get_context_menu_options,
                windows::plugins::context_menu::commands::submit_context_menu,
                windows::plugins::context_menu::commands::close_all_context_menus,
            ])
        .setup(|app| {
                // 初始化开机自启
                #[cfg(desktop)]
                {
                    use tauri_plugin_autostart::MacosLauncher;
                    app.handle().plugin(tauri_plugin_autostart::init(
                        MacosLauncher::LaunchAgent,
                        Some(vec![]),
                    )).expect("无法初始化autostart插件");
                }
                
                let window = app.get_webview_window("main")
                    .ok_or("无法获取主窗口")?;
                window.set_focusable(false)
                    .map_err(|e| format!("设置窗口无焦点失败: {}", e))?;
                
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
                init_edge_monitor(window.clone());
                setup_tray(app.handle())?;
                hotkey::reload_from_settings()?;
                input_monitor::start_monitoring();
                
                // 初始化右键菜单模块
                windows::plugins::context_menu::init();
                
                // 设置剪贴板监听的App Handle
                set_clipboard_app_handle(app.handle().clone());
                
                // 初始化剪贴板监听（根据设置决定是否启动）
                if settings.clipboard_monitor {
                    if let Err(e) = start_clipboard_monitor() {
                        eprintln!("启动剪贴板监听失败: {}", e);
                    }
                }
                
                // 恢复贴边隐藏状态
                if let Err(e) = windows::main_window::restore_edge_snap_on_startup(&window) {
                    eprintln!("恢复贴边隐藏状态失败: {}", e);
                }

                // 显示启动通知
                if settings.show_startup_notification {
                    if let Err(e) = services::show_startup_notification(app.handle()) {
                        eprintln!("显示启动通知失败: {}", e);
                    }
                }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

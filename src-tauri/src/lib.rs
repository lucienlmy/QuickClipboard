#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod commands;
mod services;
mod utils;
mod windows;

pub use utils::{mouse, screen};
pub use services::{AppSettings, get_settings, update_settings, get_data_directory, hotkey, SoundPlayer, AppSounds};
pub use services::system::input_monitor;
pub use services::clipboard::{
    start_clipboard_monitor, stop_clipboard_monitor,
    is_monitor_running as is_clipboard_monitor_running,
    set_app_handle as set_clipboard_app_handle,
};
pub use windows::main_window::{
    get_main_window, is_main_window_visible, show_main_window, hide_main_window,
    toggle_main_window_visibility, start_drag, stop_drag, is_dragging, check_snap, 
    snap_to_edge, restore_from_snap, is_window_snapped, hide_snapped_window, 
    show_snapped_window, init_edge_monitor, WindowState, SnapEdge, get_window_state, 
    set_window_state,
};
pub use utils::positioning::{position_at_cursor, center_window, get_window_bounds};
pub use windows::tray::setup_tray;
pub use windows::settings_window::open_settings_window;
pub use windows::quickpaste;
pub use windows::plugins::context_menu::is_context_menu_visible;

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
                commands::open_text_editor_window,
                commands::emit_clipboard_updated,
                commands::emit_quick_texts_updated,
                commands::get_clipboard_history,
                commands::get_clipboard_total_count,
                commands::get_clipboard_item_by_id_cmd,
                commands::update_clipboard_item_cmd,
                commands::move_clipboard_item,
                commands::apply_history_limit,
                commands::paste_content,
                commands::delete_clipboard_item,
                commands::clear_clipboard_history,
                commands::save_image_from_path,
                commands::get_favorites_history,
                commands::get_favorites_total_count,
                commands::get_favorite_item_by_id_cmd,
                commands::add_quick_text,
                commands::update_quick_text,
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
                commands::save_quickpaste_window_size,
                commands::start_builtin_screenshot,
                commands::copy_text_to_clipboard,
                commands::check_ai_translation_config,
                commands::enable_ai_translation_cancel_shortcut,
                commands::disable_ai_translation_cancel_shortcut,
                commands::play_sound,
                commands::play_beep,
                commands::play_copy_sound,
                commands::play_paste_sound,
                commands::play_scroll_sound,
                windows::plugins::context_menu::commands::show_context_menu,
                windows::plugins::context_menu::commands::get_context_menu_options,
                windows::plugins::context_menu::commands::submit_context_menu,
                windows::plugins::context_menu::commands::close_all_context_menus,
                windows::plugins::input_dialog::commands::show_input,
                windows::plugins::input_dialog::commands::get_input_dialog_options,
                windows::plugins::input_dialog::commands::submit_input_dialog,
                windows::pin_image_window::pin_image_from_file,
                windows::pin_image_window::get_pin_image_data,
                windows::pin_image_window::animate_window_resize,
                windows::pin_image_window::close_pin_image_window_by_self,
            ])
        .setup(|app| {
                #[cfg(desktop)]
                {
                    use tauri_plugin_autostart::MacosLauncher;
                    app.handle().plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))?;
                }
                
                let window = app.get_webview_window("main").ok_or("无法获取主窗口")?;
                let _ = window.set_focusable(false);
                // 打开开发者工具
                #[cfg(debug_assertions)] // 仅在调试模式下打开
                let _ = window.open_devtools();
                
                services::database::init_database(
                    get_data_directory()?.join("quickclipboard.db").to_str().ok_or("数据库路径无效")?
                )?;
                
                let settings = get_settings();
                
                if let Some((w, h)) = settings.saved_window_size.filter(|_| settings.remember_window_size) {
                    let _ = window.set_size(tauri::PhysicalSize::new(w, h));
                }
                let _ = services::database::limit_clipboard_history(settings.history_limit);
                
                utils::init_screen_utils(app.handle().clone());
                hotkey::init_hotkey_manager(app.handle().clone(), window.clone());
                input_monitor::init_input_monitor(window.clone());
                init_edge_monitor(window.clone());
                setup_tray(app.handle())?;
                hotkey::reload_from_settings()?;
                input_monitor::start_monitoring();
                windows::plugins::context_menu::init();
                windows::plugins::input_dialog::init();
                quickpaste::init_quickpaste_state();
                let _ = quickpaste::init_quickpaste_window(&app.handle());
                set_clipboard_app_handle(app.handle().clone());
                
                windows::pin_image_window::init_pin_image_window();
                
                if settings.clipboard_monitor {
                    let _ = start_clipboard_monitor();
                }
                
                let _ = windows::main_window::restore_edge_snap_on_startup(&window);
                
                if settings.show_startup_notification {
                    let _ = services::show_startup_notification(app.handle());
                }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use std::{fs};

mod commands;
mod services;
mod utils;
mod windows;

pub use utils::{mouse, screen};
pub use services::{AppSettings, get_settings, update_settings, get_data_directory, hotkey, SoundPlayer, AppSounds};
pub use services::system::input_monitor;
pub use services::system::focus;
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
pub use services::low_memory::{is_low_memory_mode, enter_low_memory_mode, exit_low_memory_mode};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if services::low_memory::is_low_memory_mode() {
                if let Err(e) = services::low_memory::exit_low_memory_mode(app) {
                    eprintln!("退出低占用模式失败: {}", e);
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                show_main_window(&window);
            }
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_drag::init())
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
                commands::save_current_focus,
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
                commands::toggle_pin_clipboard_item,
                commands::paste_text_direct,
                commands::paste_image_file,
                commands::move_clipboard_item,
                commands::move_clipboard_item_by_id,
                commands::apply_history_limit,
                commands::paste_content,
                commands::delete_clipboard_item,
                commands::clear_clipboard_history,
                commands::save_image_from_path,
                commands::copy_image_to_clipboard,
                commands::resolve_image_path,
                commands::get_favorites_history,
                commands::get_favorites_total_count,
                commands::get_favorite_item_by_id_cmd,
                commands::add_quick_text,
                commands::update_quick_text,
                commands::move_favorite_item_by_id,
                commands::add_clipboard_to_favorites,
                commands::move_quick_text_to_group,
                commands::delete_quick_text,
                commands::get_groups,
                commands::add_group,
                commands::update_group,
                commands::delete_group,
                commands::reload_settings,
                commands::save_settings,
                commands::reset_settings_to_default,
                commands::get_settings_cmd,
                commands::set_edge_hide_enabled,
                commands::get_all_windows_info_cmd,
                commands::is_portable_mode,
                commands::get_app_version,
                commands::get_data_directory_cmd,
                commands::set_auto_start,
                commands::get_auto_start_status,
                commands::set_run_as_admin,
                commands::get_run_as_admin_status,
                commands::is_running_as_admin,
                commands::restart_as_admin,
                commands::reload_hotkeys,
                commands::enable_hotkeys,
                commands::disable_hotkeys,
                commands::is_hotkeys_enabled,
                commands::get_shortcut_statuses,
                commands::get_shortcut_status,
                commands::save_window_position,
                commands::save_window_size,
                commands::save_quickpaste_window_size,
                commands::dm_get_current_storage_path,
                commands::dm_get_default_storage_path,
                commands::dm_check_target_has_data,
                commands::dm_change_storage_path,
                commands::dm_reset_storage_path_to_default,
                commands::dm_export_data_zip,
                commands::dm_import_data_zip,
                commands::dm_reset_all_data,
                commands::dm_list_backups,
                commands::set_mouse_position,
                commands::start_builtin_screenshot,
                commands::capture_all_screenshots,
                commands::get_last_screenshot_captures,
                commands::cancel_screenshot_session,
                commands::enable_long_screenshot_passthrough,
                commands::disable_long_screenshot_passthrough,
                commands::start_long_screenshot_capture,
                commands::stop_long_screenshot_capture,
                commands::save_long_screenshot,
                commands::copy_long_screenshot_to_clipboard,
                commands::recognize_image_ocr,
                commands::recognize_file_ocr,
                windows::screenshot_window::auto_selection::start_auto_selection,
                windows::screenshot_window::auto_selection::stop_auto_selection,
                windows::screenshot_window::auto_selection::is_auto_selection_active,
                windows::screenshot_window::auto_selection::request_auto_selection_emit,
                windows::screenshot_window::auto_selection::clear_auto_selection_cache,
                commands::copy_text_to_clipboard,
                commands::check_ai_translation_config,
                commands::enable_ai_translation_cancel_shortcut,
                commands::disable_ai_translation_cancel_shortcut,
                commands::check_win_v_hotkey_disabled,
                commands::disable_win_v_hotkey_and_restart,
                commands::enable_win_v_hotkey_and_restart,
                commands::prompt_disable_win_v_hotkey_if_needed,
                commands::prompt_enable_win_v_hotkey,
                commands::enter_low_memory_mode,
                commands::exit_low_memory_mode,
                commands::is_low_memory_mode,
                commands::play_sound,
                commands::play_beep,
                commands::play_copy_sound,
                commands::play_paste_sound,
                commands::play_scroll_sound,
                commands::reload_all_windows,
                commands::check_updates_and_open_window,
                windows::plugins::context_menu::commands::show_context_menu,
                windows::plugins::context_menu::commands::get_context_menu_options,
                windows::plugins::context_menu::commands::submit_context_menu,
                windows::plugins::context_menu::commands::close_all_context_menus,
                windows::plugins::context_menu::commands::update_context_menu_regions,
                windows::plugins::context_menu::commands::resize_context_menu,
                windows::plugins::input_dialog::commands::show_input,
                windows::plugins::input_dialog::commands::get_input_dialog_options,
                windows::plugins::input_dialog::commands::submit_input_dialog,
                windows::pin_image_window::pin_image_from_file,
                windows::pin_image_window::get_pin_image_data,
                windows::pin_image_window::animate_window_resize,
                windows::pin_image_window::close_pin_image_window_by_self,
                windows::pin_image_window::close_image_preview,
                windows::pin_image_window::save_pin_image_as,
                windows::pin_image_window::start_pin_edit_mode,
                windows::screenshot_window::get_pin_edit_mode_data,
                windows::screenshot_window::clear_pin_edit_mode,
                windows::screenshot_window::confirm_pin_edit,
                windows::screenshot_window::cancel_pin_edit,
                windows::screenshot_window::enable_pin_edit_passthrough,
                windows::screenshot_window::disable_pin_edit_passthrough,
                windows::screenshot_window::update_pin_edit_passthrough_rects,
                windows::screenshot_window::get_screenshot_quick_mode,
                windows::screenshot_window::reset_screenshot_quick_mode,
                utils::screen::get_all_screens,
                utils::system::get_system_text_scale,
                commands::il_init,
                commands::il_save_image,
                commands::il_get_image_list,
                commands::il_get_image_count,
                commands::il_delete_image,
                commands::il_rename_image,
                commands::il_get_images_dir,
                commands::il_get_gifs_dir,
            ])
        .setup(|app| {
                #[cfg(windows)]
                {
                    let settings = get_settings();
                    if settings.run_as_admin && !commands::is_running_as_admin() {
                        if services::system::elevate::try_elevate_and_restart() {
                            std::process::exit(0);
                        }
                    }
                }

                #[cfg(desktop)]
                {
                    use tauri_plugin_autostart::MacosLauncher;
                    app.handle().plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))?;
                }
                
                let window = app.get_webview_window("main").ok_or("无法获取主窗口")?;
                let _ = window.set_focusable(false);
                #[cfg(debug_assertions)]
                let _ = window.open_devtools();
                
                if services::is_portable_build() {
                    if let Ok(exe) = std::env::current_exe() {
                        if let Some(dir) = exe.parent() {
                            let marker = dir.join("portable.flag");
                            if !marker.exists() {
                                let _ = std::fs::write(&marker, b"portable\n");
                            }
                        }
                    }
                }

                let db_path_buf = get_data_directory()?.join("quickclipboard.db");
                let db_path_str = db_path_buf.to_str().ok_or("数据库路径无效")?;
                if let Err(e1) = services::database::init_database(db_path_str) {
                    if let Some(dir) = db_path_buf.parent() {
                        for name in ["quickclipboard.db-wal", "quickclipboard.db-shm"] {
                            let p = dir.join(name);
                            if p.exists() { let _ = fs::remove_file(&p); }
                        }
                    }
                    services::database::init_database(db_path_str)
                        .map_err(|e2| format!("数据库初始化失败(已尝试清理 wal/shm): {} -> {}", e1, e2))?;
                }
                let _ = services::database::connection::with_connection(|conn| {
                    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                });
                
                let mut settings = get_settings();
                
                if let Some((w, h)) = settings.saved_window_size.filter(|_| settings.remember_window_size) {
                    let _ = window.set_size(tauri::PhysicalSize::new(w, h));
                }
                let settings_exists = services::settings::storage::SettingsStorage::exists().unwrap_or(true);
                if !settings_exists {
                    if let Ok(count) = services::database::get_clipboard_count() {
                        if count as u64 > settings.history_limit {
                            settings.history_limit = count as u64;
                            let _ = update_settings(settings.clone());
                        }
                    }
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
                focus::start_focus_listener(app.handle().clone());

                if settings.clipboard_monitor {
                    let _ = start_clipboard_monitor();
                }
                
                let _ = windows::main_window::restore_edge_snap_on_startup(&window);

                if settings.show_startup_notification {
                    let _ = services::show_startup_notification(app.handle());
                }

                windows::updater_window::start_update_checker(app.handle().clone());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match event {
                tauri::RunEvent::ExitRequested { api, .. } => {
                    if services::low_memory::is_low_memory_mode() 
                        && !services::low_memory::is_user_requested_exit() 
                    {
                        api.prevent_exit();
                    }
                }
                tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::Destroyed, .. } => {
                    if label == "main" && !services::low_memory::is_low_memory_mode() {
                        app.exit(0);
                    }
                }
                _ => {}
            }
        });
}

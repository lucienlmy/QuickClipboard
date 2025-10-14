#![recursion_limit = "256"]
// =================== 模块引入 ===================
mod admin_privileges;
mod ai_config;
mod ai_translator;
mod app_filter;
mod audio_scanner;
mod clipboard_content;
mod clipboard_history;
mod clipboard_monitor;
mod commands;
mod data_migration;
mod data_manager;
mod database;
mod database_image_utils;
mod file_handler;
mod global_state;
mod groups;
mod image_manager;
mod key_state_monitor;
mod mouse_hook;
mod paste_utils;
mod preview_window;
mod pin_image_window;
mod plugins;
mod quick_texts;

// 截屏功能模块
mod screenshot;

mod memory_manager;
mod services;
mod settings;
mod shortcut_interceptor;
mod sound_manager;
mod text_input_simulator;
mod tray;
mod utils;
mod window_effects;
mod window_management;
mod edge_snap;
mod state_manager;
mod window_drag;

use std::sync::atomic::{AtomicBool, Ordering};

pub use commands::*;
pub use window_effects::*;
pub use database::{ContentType, ClipboardItem, FavoriteItem};

use tauri::Manager;

// 全局初始化状态
static BACKEND_INITIALIZED: AtomicBool = AtomicBool::new(false);

// =================== 启动横幅 ===================
fn print_startup_banner() {
    println!();
    println!("███╗   ███╗ ██████╗ ███████╗██╗  ██╗███████╗███╗   ██╗ ██████╗ ");
    println!("████╗ ████║██╔═══██╗██╔════╝██║  ██║██╔════╝████╗  ██║██╔════╝ ");
    println!("██╔████╔██║██║   ██║███████╗███████║█████╗  ██╔██╗ ██║██║  ███╗");
    println!("██║╚██╔╝██║██║   ██║╚════██║██╔══██║██╔══╝  ██║╚██╗██║██║   ██║");
    println!("██║ ╚═╝ ██║╚██████╔╝███████║██║  ██║███████╗██║ ╚████║╚██████╔╝");
    println!("╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝ ╚═════╝ ");
    println!();
    println!("QuickClipboard v1.0.0 - 快速剪贴板管理工具");
    println!("Author: MoSheng | Built with Tauri + Rust");
    println!("Starting application...");
    println!();
}

// =================== 内部函数 ===================

// 发送启动通知的内部函数
fn send_startup_notification_internal(app_handle: &tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    // 检查设置是否启用了启动通知
    let app_settings = settings::get_global_settings();
    if !app_settings.show_startup_notification {
        println!("启动通知已禁用，跳过发送");
        return Ok(());
    }

    let admin_status = admin_privileges::get_admin_status();
    let status_text = if admin_status.is_admin {
        "（管理员模式）"
    } else {
        ""
    };

    // 获取当前设置的快捷键
    let app_settings = settings::get_global_settings();
    let shortcut_key = if app_settings.toggle_shortcut.is_empty() {
        "Win+V".to_string()
    } else {
        app_settings.toggle_shortcut.clone()
    };

    let notification_body = format!(
        "QuickClipboard 已启动{}\n按 {} 打开剪贴板",
        status_text, shortcut_key
    );

    match app_handle
        .notification()
        .builder()
        .title("QuickClipboard")
        .body(&notification_body)
        .show()
    {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("发送通知失败: {}", e)),
    }
}

// =================== Tauri 应用入口 ===================
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 输出启动横幅
    print_startup_banner();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                crate::window_management::show_webview_window(window);
            }
        }))
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => {
                let _ = commands::toggle_window_visibility(app.app_handle().clone());
            }
            "screenshot" => {
                let app_handle = app.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_millis(280)).await;
                    if let Err(e) = crate::commands::start_builtin_screenshot(app_handle) {
                        eprintln!("启动截屏失败: {}", e);
                    }
                });
            }
            "settings" => {
                let app_handle = app.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = commands::open_settings_window(app_handle).await;
                });
            }
            "toggle-hotkeys" => {
                #[cfg(windows)]
                {
                    let hook_enabled = crate::shortcut_interceptor::is_interception_enabled();
                    let poll_enabled = crate::key_state_monitor::is_polling_active();

                    if hook_enabled || poll_enabled {
                        crate::shortcut_interceptor::disable_shortcut_interception();
                        crate::key_state_monitor::stop_keyboard_polling_system();
                        if let Some(item) = crate::tray::TOGGLE_HOTKEYS_ITEM.get() {
                            let _ = item.set_text("启用快捷键");
                        }
                    } else {
                        crate::shortcut_interceptor::enable_shortcut_interception();
                        crate::key_state_monitor::start_keyboard_polling_system();
                        if let Some(item) = crate::tray::TOGGLE_HOTKEYS_ITEM.get() {
                            let _ = item.set_text("禁用快捷键");
                        }
                    }
                }
            }
            "toggle-clipboard-monitor" => {
                let new_enabled = !crate::clipboard_history::is_monitoring_enabled();
                crate::clipboard_history::set_monitoring_enabled(new_enabled);
                // 持久化到设置
                let mut app_settings = crate::settings::get_global_settings();
                app_settings.clipboard_monitor = new_enabled;
                let _ = crate::settings::update_global_settings(app_settings);
                // 广播设置变更，确保主窗口与设置窗口同步
                if let Some(main_window) = app.get_webview_window("main") {
                    use tauri::Emitter;
                    let _ = main_window.emit(
                        "settings-changed",
                        crate::settings::get_global_settings().to_json(),
                    );
                }
                if let Some(settings_window) = app.get_webview_window("settings") {
                    use tauri::Emitter;
                    let _ = settings_window.emit(
                        "settings-changed",
                        crate::settings::get_global_settings().to_json(),
                    );
                }
                if let Some(item) = crate::tray::TOGGLE_MONITOR_ITEM.get() {
                    let _ = item.set_text(if new_enabled { "禁用剪贴板监听" } else { "启用剪贴板监听" });
                }
            }
            "restart" => {
                let app_handle = app.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = commands::restart_app(app_handle).await;
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .setup(|app| {
            // 初始化数据库
            if let Err(e) = database::initialize_database() {
                println!("数据库初始化失败: {}", e);
            }

            // 首先尝试加载历史记录
            clipboard_history::load_history();
            // 加载常用文本
            quick_texts::load_quick_texts();
            // 初始化分组系统
            if let Err(e) = groups::init_groups() {
                println!("分组系统初始化失败: {}", e);
            }

            // 获取主窗口
            let main_window = app.get_webview_window("main").unwrap();
            
            let _ = main_window.set_focusable(false);
            
            #[cfg(windows)]
            {
                mouse_hook::MAIN_WINDOW_HANDLE.set(main_window.clone()).ok();

                // 初始化快捷键拦截器
                shortcut_interceptor::initialize_shortcut_interceptor(main_window.clone());
            }

            // 开发模式下自动打开开发者工具
            #[cfg(debug_assertions)]
            {
                main_window.open_devtools();
            }

            // 初始化时获取剪贴板内容并初始化监听器状态
            clipboard_monitor::initialize_clipboard_state();

            // 初始化分组系统
            match groups::init_groups() {
                Ok(_) => {}
                Err(_e) => {
                }
            }

            // 启动内存收缩调度器，暂停使用避免程序崩溃
            // #[cfg(windows)]
            // memory_manager::start_memory_trim_scheduler();

            // 初始化内置音效文件
            if let Err(e) = services::sound_service::SoundService::initialize_builtin_sounds() {
                eprintln!("初始化内置音效文件失败: {}", e);
            }

            // 初始化音效管理器
            if let Err(_e) = sound_manager::initialize_sound_manager() {
                // 静默处理错误
            }

            // 初始化预览窗口
            preview_window::init_preview_window();

            if let Some(preview_window) = app.get_webview_window("preview") {
                let _ = preview_window.set_focusable(false);
            }
            
            // 初始化贴图窗口
            pin_image_window::init_pin_image_window();

            // 初始化截屏窗口
            if let Err(e) = crate::screenshot::ScreenshotWindowManager::init_screenshot_window(app.handle()) {
                println!("截屏窗口初始化失败: {}", e);
            }

            // 加载并应用设置
            let app_settings = settings::get_global_settings();

            // 检查管理员运行设置
            if app_settings.run_as_admin && !admin_privileges::is_running_as_admin() {
                println!("设置要求以管理员权限运行，但当前不是管理员权限，正在重启...");
                if let Err(e) = admin_privileges::restart_as_admin() {
                    println!("以管理员权限重启失败: {}", e);
                } else {
                    return Ok(());
                }
            }

            // 应用历史记录数量限制
            clipboard_history::set_history_limit(app_settings.history_limit as usize);

            // 应用剪贴板监听设置
            clipboard_history::set_monitoring_enabled(app_settings.clipboard_monitor);

            // 应用忽略重复内容设置
            clipboard_history::set_ignore_duplicates(app_settings.ignore_duplicates);

            // 应用保存图片设置
            clipboard_history::set_save_images(app_settings.save_images);

            // 应用数字快捷键设置
            #[cfg(windows)]
            global_state::set_number_shortcuts_enabled(app_settings.number_shortcuts);
            #[cfg(windows)]
            global_state::update_number_shortcuts_modifier(&app_settings.number_shortcuts_modifier);

            // 应用预览窗口快捷键设置
            #[cfg(windows)]
            global_state::update_preview_shortcut_config(&app_settings.preview_shortcut);

            // 配置快捷键拦截器并启用
            #[cfg(windows)]
            {
                let toggle_shortcut = if app_settings.toggle_shortcut.is_empty() {
                    "Win+V".to_string()
                } else {
                    app_settings.toggle_shortcut.clone()
                };
                shortcut_interceptor::update_shortcut_to_intercept(&toggle_shortcut);

                // 配置预览快捷键拦截器
                let preview_shortcut = if app_settings.preview_shortcut.is_empty() {
                    "Ctrl+`".to_string()
                } else {
                    app_settings.preview_shortcut.clone()
                };
                shortcut_interceptor::update_preview_shortcut_to_intercept(&preview_shortcut);

                shortcut_interceptor::enable_shortcut_interception();
            }

            // 应用音效设置
            let sound_settings = sound_manager::SoundSettings {
                enabled: app_settings.sound_enabled,
                volume: (app_settings.sound_volume / 100.0) as f32,
                copy_sound_path: app_settings.copy_sound_path,
                paste_sound_path: app_settings.paste_sound_path,
                preset: "default".to_string(),
            };
            sound_manager::update_sound_settings(sound_settings);

            // 启动剪贴板监听器
            clipboard_monitor::start_clipboard_monitor(app.handle().clone());

            // 注册托盘图标和事件
            tray::setup_tray(&app.app_handle())?;

            // 初始化状态管理器
            state_manager::init_state_manager();

            // 设置窗口关闭事件处理 - 隐藏到托盘而不是退出
            let main_window_clone = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // 阻止默认的关闭行为
                    api.prevent_close();
                    // 隐藏窗口到托盘
                    let _ = main_window_clone.hide();
                }
            });

            // 注册全局快捷键
            #[cfg(desktop)]
            {
                // 启动按键监控系统（仅 Windows）
                #[cfg(windows)]
                {
                    // 按键状态监控系统
                    key_state_monitor::start_keyboard_polling_system();
                    // 安装鼠标钩子（用于全局鼠标中键监听）
                    mouse_hook::install_mouse_hook();

                    // 安装快捷键拦截钩子
                    shortcut_interceptor::install_shortcut_hook();
                }
            }

            // 发送启动通知
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                // 等待一小段时间确保应用完全启动
                std::thread::sleep(std::time::Duration::from_millis(1000));

                // 发送启动通知
                let _ = send_startup_notification_internal(&app_handle);
            });


            // 初始化边缘吸附功能
            let _ = crate::edge_snap::init_edge_snap();

            // 初始化输入对话框插件
            crate::plugins::input_dialog::init();
            
            // 初始化右键菜单插件
            crate::plugins::context_menu::init();
            crate::plugins::context_menu::set_app_handle(app.app_handle().clone());

            // 标记后端初始化完成
            BACKEND_INITIALIZED.store(true, Ordering::Relaxed);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_clipboard_text,
            set_clipboard_text,
            set_clipboard_text_with_html,
            get_clipboard_history,
            refresh_clipboard,
            set_window_pinned,
            get_window_pinned,
            toggle_window_visibility,
            set_clipboard_image,
            focus_clipboard_window,
            restore_last_focus,
            get_quick_texts,
            add_quick_text,
            update_quick_text,
            delete_quick_text,
            add_clipboard_to_favorites,
            enable_mouse_monitoring_command,
            disable_mouse_monitoring_command,
            set_startup_launch,
            set_history_limit,
            get_groups,
            add_group,
            update_group,
            hide_main_window_if_auto_shown,
            delete_group,
            get_quick_texts_by_group,
            move_quick_text_to_group,
            move_quick_text_item,
            add_clipboard_to_group,
            open_settings_window,
            get_settings,
            reload_settings,
            save_settings,
            browse_sound_file,
            browse_image_file,
            test_sound,
            play_paste_sound,
            play_scroll_sound,
            set_super_topmost,
            get_sound_status,
            clear_sound_cache,
            get_active_sound_count,
            log_debug,
            save_image_to_file,
            set_preview_index,
            cancel_preview,
            delete_clipboard_item,
            update_clipboard_item,
            emit_clipboard_updated,
            emit_quick_texts_updated,
            clear_clipboard_history,
            cleanup_unused_images,
            open_text_editor_window,
            notify_preview_tab_change,
            get_main_window_state,
            update_theme_setting,
            get_app_version,
            get_admin_status,
            restart_as_admin,
            is_backend_initialized,
            send_system_notification,
            send_startup_notification,

            commands::test_ai_translation,
            commands::translate_and_input_text,
            commands::translate_and_paste_text,
            commands::translate_and_input_on_copy,
            commands::translate_text_smart,
            commands::is_currently_pasting,
            commands::check_ai_translation_config,
            commands::get_available_ai_models,
            commands::test_ai_config,
            commands::cancel_translation,
            commands::enable_ai_translation_cancel_shortcut,
            commands::disable_ai_translation_cancel_shortcut,
            commands::copy_files_to_directory,
            commands::get_file_info,
            commands::get_clipboard_files,
            commands::set_clipboard_files,
            commands::move_clipboard_item_to_front,
            commands::move_clipboard_item,
            commands::paste_content,
            commands::open_file_location,
            commands::open_file_with_default_program,
            
            // 音频扫描
            audio_scanner::scan_folder_for_audio,
            audio_scanner::get_audio_metadata,

            app_filter::get_all_windows_info_cmd,
            commands::read_image_file,
            commands::export_data,
            commands::import_data,
            commands::restart_app,
            commands::clear_clipboard_history_dm,
            commands::reset_all_data,
            commands::reset_settings_to_default,
            commands::get_app_data_dir,
            commands::is_portable_mode,
            commands::get_storage_info,
            commands::set_custom_storage_location,
            commands::reset_to_default_storage_location,
            commands::open_storage_folder,
            commands::save_window_position,
            commands::save_window_size,
            commands::get_saved_window_position,
            commands::get_saved_window_size,
            commands::init_edge_snap,
            commands::check_window_edge_snap,
            commands::restore_window_from_snap,
            commands::set_edge_hide_enabled,
            commands::is_edge_hide_enabled,
            commands::restore_edge_snap_on_startup,
            commands::refresh_all_windows,
            commands::get_screen_size,
            commands::set_shortcut_recording,
            commands::start_custom_drag,
            commands::stop_custom_drag,
            commands::get_image_file_path,
            commands::file_exists,
            commands::create_pin_image_window,
            commands::pin_image_from_file,
            
            // 截屏窗口相关命令
            crate::screenshot::show_screenshot_window,
            crate::screenshot::hide_screenshot_window,
            crate::screenshot::toggle_screenshot_window,
            crate::screenshot::is_screenshot_window_visible,
            crate::screenshot::get_all_monitors,
            crate::screenshot::get_css_monitors,
            crate::screenshot::constrain_selection_bounds,
            commands::start_builtin_screenshot,
            
            crate::screenshot::init_scrolling_screenshot,
            crate::screenshot::start_scrolling_screenshot,
            crate::screenshot::pause_scrolling_screenshot,
            crate::screenshot::resume_scrolling_screenshot,
            crate::screenshot::stop_scrolling_screenshot,
            crate::screenshot::cancel_scrolling_screenshot,
            crate::screenshot::update_scrolling_panel_rect,
            
            // 自动选区相关命令
            crate::screenshot::start_auto_selection,
            crate::screenshot::stop_auto_selection,
            crate::screenshot::is_auto_selection_active,
            
            // 贴图窗口相关命令
            crate::pin_image_window::get_pin_image_data,
            crate::pin_image_window::close_pin_image_window_by_self,
            crate::pin_image_window::copy_pin_image_to_clipboard,
            crate::pin_image_window::save_pin_image_as,
            
            // 输入对话框插件命令
            crate::plugins::input_dialog::commands::show_input,
            crate::plugins::input_dialog::commands::get_input_dialog_options,
            crate::plugins::input_dialog::commands::submit_input_dialog,
            
            // 右键菜单插件命令
            crate::plugins::context_menu::commands::show_context_menu,
            crate::plugins::context_menu::commands::get_context_menu_options,
            crate::plugins::context_menu::commands::submit_context_menu,
            crate::plugins::context_menu::commands::close_all_context_menus
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

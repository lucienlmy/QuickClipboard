use tauri::{AppHandle, Manager};

#[cfg(not(debug_assertions))]
use auto_launch::AutoLaunch;

/// 设置服务 - 处理应用设置相关的业务逻辑
pub struct SettingsService;

impl SettingsService {
    /// 获取当前设置
    pub fn get_settings() -> Result<serde_json::Value, String> {
        let settings = crate::settings::get_global_settings();
        Ok(settings.to_json())
    }

    /// 重新加载设置
    pub fn reload_settings() -> Result<serde_json::Value, String> {
        // 强制从文件重新加载设置
        let fresh_settings = crate::settings::AppSettings::load();

        // 更新全局设置
        if let Err(e) = crate::settings::update_global_settings(fresh_settings.clone()) {
            println!("更新全局设置失败: {}", e);
        }

        Ok(fresh_settings.to_json())
    }

    /// 保存设置
    pub fn save_settings(app_handle: AppHandle, settings: serde_json::Value) -> Result<(), String> {
        // 由于设置窗口可能持有过期的窗口尺寸/位置，
        // 这里过滤掉 savedWindowSize 与 savedWindowPosition，避免覆盖最新值
        let mut settings_filtered = settings.clone();
        if let Some(obj) = settings_filtered.as_object_mut() {
            obj.remove("savedWindowSize");
            obj.remove("savedWindowPosition");
        }

        // 更新全局设置（使用过滤后的对象）
        crate::settings::update_global_settings_from_json(&settings_filtered)?;

        // 获取更新后的设置
        let app_settings = crate::settings::get_global_settings();

        // 应用各种设置
        Self::apply_settings(&app_settings)?;

        // 处理特殊逻辑
        Self::handle_special_settings(&app_handle, &settings_filtered, &app_settings)?;

        Ok(())
    }

    /// 设置开机自启动
    pub fn set_startup_launch(enabled: bool) -> Result<(), String> {
        // 在开发模式下跳过开机自启动设置
        #[cfg(debug_assertions)]
        {
            println!("开发模式下跳过开机自启动设置: enabled = {}", enabled);
            return Ok(());
        }

        #[cfg(not(debug_assertions))]
        {
            let app_name = "QuickClipboard";
            let app_path = std::env::current_exe().map_err(|e| format!("获取程序路径失败: {}", e))?;

            let auto_launch = AutoLaunch::new(app_name, &app_path.to_string_lossy(), &[] as &[&str]);

            if enabled {
                auto_launch
                    .enable()
                    .map_err(|e| format!("启用开机自启动失败: {}", e))?;
            } else {
                auto_launch
                    .disable()
                    .map_err(|e| format!("禁用开机自启动失败: {}", e))?;
            }

            Ok(())
        }
    }

    /// 设置历史记录数量限制
    pub fn set_history_limit(limit: usize) -> Result<(), String> {
        crate::clipboard_history::set_history_limit(limit);
        Ok(())
    }

    /// 应用所有设置
    fn apply_settings(app_settings: &crate::settings::AppSettings) -> Result<(), String> {
        // 1. 历史记录数量限制
        crate::clipboard_history::set_history_limit(app_settings.history_limit as usize);

        // 2. 开机自启动
        if let Err(e) = Self::set_startup_launch(app_settings.auto_start) {
            println!("设置开机自启动失败: {}", e);
        }

        // 3. 剪贴板监听设置
        crate::clipboard_history::set_monitoring_enabled(app_settings.clipboard_monitor);

        // 4. 忽略重复内容设置
        crate::clipboard_history::set_ignore_duplicates(app_settings.ignore_duplicates);

        // 5. 保存图片设置
        crate::clipboard_history::set_save_images(app_settings.save_images);

        // 6. 数字快捷键设置
        #[cfg(windows)]
        crate::global_state::set_number_shortcuts_enabled(app_settings.number_shortcuts);
        #[cfg(windows)]
        crate::global_state::update_number_shortcuts_modifier(&app_settings.number_shortcuts_modifier);

        // 7. 预览窗口快捷键设置
        #[cfg(windows)]
        crate::global_state::update_preview_shortcut_config(&app_settings.preview_shortcut);

        // 8. 更新音效设置
        let sound_settings = crate::sound_manager::SoundSettings {
            enabled: app_settings.sound_enabled,
            volume: (app_settings.sound_volume / 100.0) as f32, // 转换为0.0-1.0范围
            copy_sound_path: app_settings.copy_sound_path.clone(),
            paste_sound_path: app_settings.paste_sound_path.clone(),
            preset: "default".to_string(),
        };
        crate::sound_manager::update_sound_settings(sound_settings);

        // 9. 截屏设置应用
        let updated_settings = crate::settings::get_global_settings();
        println!(
            "截屏设置已更新: 启用={}, 快捷键={}, 质量={}",
            updated_settings.screenshot_enabled,
            updated_settings.screenshot_shortcut,
            updated_settings.screenshot_quality
        );

        Ok(())
    }

    /// 处理特殊设置逻辑
    fn handle_special_settings(
        app_handle: &AppHandle,
        settings_filtered: &serde_json::Value,
        app_settings: &crate::settings::AppSettings,
    ) -> Result<(), String> {
        // 1. 更新快捷键拦截器配置
        #[cfg(windows)]
        {
            // 更新主窗口快捷键
            let toggle_shortcut = if app_settings.toggle_shortcut.is_empty() {
                "Win+V".to_string()
            } else {
                app_settings.toggle_shortcut.clone()
            };
            crate::shortcut_interceptor::update_shortcut_to_intercept(&toggle_shortcut);

            // 更新预览窗口快捷键
            let preview_shortcut = if app_settings.preview_shortcut.is_empty() {
                "Ctrl+`".to_string()
            } else {
                app_settings.preview_shortcut.clone()
            };
            crate::shortcut_interceptor::update_preview_shortcut_to_intercept(&preview_shortcut);
        }

        // 2. 检查是否需要刷新文件图标
        if settings_filtered.get("showImagePreview").is_some() {
            // 异步刷新文件图标，不阻塞设置保存
            let app_handle_clone = app_handle.clone();
            std::thread::spawn(move || {
                if let Err(e) = crate::commands::refresh_file_icons(app_handle_clone) {
                    println!("刷新文件图标失败: {}", e);
                }
            });
        }

        // 3. 通知前端设置已更改
        use tauri::Emitter;
        if let Some(main_window) = app_handle.get_webview_window("main") {
            let _ = main_window.emit("settings-changed", app_settings.to_json());
        }
        if let Some(settings_window) = app_handle.get_webview_window("settings") {
            let _ = settings_window.emit("settings-changed", app_settings.to_json());
        }
        // 同步托盘“剪贴板监听”菜单文案
        if let Some(item) = crate::tray::TOGGLE_MONITOR_ITEM.get() {
            let _ = item.set_text(if app_settings.clipboard_monitor { "禁用剪贴板监听" } else { "启用剪贴板监听" });
        }

        Ok(())
    }
}

use crate::services::{AppSettings, get_settings, update_settings, get_data_directory};
use crate::services::settings::storage::SettingsStorage;
use tauri::Manager;
use serde_json::Value;

fn handle_disable_edge_hide(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let state = crate::windows::main_window::get_window_state();
        
        if state.is_snapped {
            if state.is_hidden {
                let _ = crate::windows::main_window::show_snapped_window(&window);
            }
            
            let _ = crate::windows::main_window::restore_from_snap(&window);
            
            crate::windows::main_window::stop_edge_monitoring();
        }
    }
}

// 重新加载设置
#[tauri::command]
pub fn reload_settings() -> Result<AppSettings, String> {
    let settings = SettingsStorage::load()?;
    update_settings(settings.clone())?;
    Ok(settings)
}

#[tauri::command]
pub fn save_settings(mut settings: AppSettings, app: tauri::AppHandle) -> Result<(), String> {
    let old_settings = get_settings();
    let clipboard_monitor_changed = old_settings.clipboard_monitor != settings.clipboard_monitor;
    let edge_hide_changed = old_settings.edge_hide_enabled != settings.edge_hide_enabled;
    let quickpaste_enabled_changed = old_settings.quickpaste_enabled != settings.quickpaste_enabled;
    
    if edge_hide_changed && !settings.edge_hide_enabled {
        settings.edge_snap_position = None;
        handle_disable_edge_hide(&app);
    }
    
    update_settings(settings.clone())?;
    
    if let Err(e) = crate::hotkey::reload_from_settings() {
        eprintln!("重新加载快捷键失败: {}", e);
    }
    
    if clipboard_monitor_changed {
        if settings.clipboard_monitor {
            crate::start_clipboard_monitor()?;
        } else {
            crate::stop_clipboard_monitor()?;
        }
        
        update_tray_monitor_label(settings.clipboard_monitor);
        
        use tauri::Emitter;
        let _ = app.emit("settings-changed", serde_json::json!({
            "clipboardMonitor": settings.clipboard_monitor
        }));
    }
    
    if quickpaste_enabled_changed {
        if settings.quickpaste_enabled {
            let app_clone = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(100));
                let _ = crate::quickpaste::init_quickpaste_window(&app_clone);
            });
        } else if let Some(window) = app.get_webview_window("quickpaste") {
            let _ = window.close();
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn get_settings_cmd() -> AppSettings {
    get_settings()
}

#[tauri::command]
pub fn set_edge_hide_enabled(enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    let mut settings = get_settings();
    settings.edge_hide_enabled = enabled;
    
    if !enabled {
        settings.edge_snap_position = None;
        handle_disable_edge_hide(&app);
    }
    
    update_settings(settings)?;
    Ok(())
}

#[tauri::command]
pub fn get_all_windows_info_cmd() -> Result<Vec<crate::services::system::AppInfo>, String> {
    Ok(crate::services::system::get_all_windows_info())
}

#[tauri::command]
pub fn is_portable_mode() -> bool {
    use std::env;
    env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.join("portable.txt").exists()))
        .unwrap_or(false)
}

// 获取应用版本信息
#[tauri::command]
pub fn get_app_version() -> Result<Value, String> {
    let version = env!("CARGO_PKG_VERSION");
    Ok(serde_json::json!({
        "version": version,
        "name": env!("CARGO_PKG_NAME"),
    }))
}

// 获取数据目录路径
#[tauri::command]
pub fn get_data_directory_cmd() -> Result<String, String> {
    let path = get_data_directory()?;
    Ok(path.to_string_lossy().to_string())
}

// 设置开机自启动
#[tauri::command]
pub fn set_auto_start(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        
        let autostart_manager = app.autolaunch();
        
        if enabled {
            autostart_manager.enable().map_err(|e| format!("启用开机自启动失败: {}", e))?;
        } else {
            autostart_manager.disable().map_err(|e| format!("禁用开机自启动失败: {}", e))?;
        }
    }

    let mut settings = get_settings();
    settings.auto_start = enabled;
    update_settings(settings)?;

    Ok(())
}

// 检查开机自启动状态
#[tauri::command]
pub fn get_auto_start_status(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        
        let autostart_manager = app.autolaunch();
        return autostart_manager.is_enabled().map_err(|e| e.to_string());
    }
    
    #[cfg(not(desktop))]
    {
        Ok(false)
    }
}

// 重新加载快捷键
#[tauri::command]
pub fn reload_hotkeys() -> Result<(), String> {
    crate::hotkey::reload_from_settings()
}

// 启用快捷键
#[tauri::command]
pub fn enable_hotkeys() -> Result<(), String> {
    crate::hotkey::enable_hotkeys()
}

// 禁用快捷键
#[tauri::command]
pub fn disable_hotkeys() -> Result<(), String> {
    crate::hotkey::disable_hotkeys();
    Ok(())
}

// 检查快捷键是否启用
#[tauri::command]
pub fn is_hotkeys_enabled() -> bool {
    crate::hotkey::is_hotkeys_enabled()
}

// 获取所有快捷键状态
#[tauri::command]
pub fn get_shortcut_statuses() -> Vec<crate::hotkey::ShortcutStatus> {
    crate::hotkey::get_shortcut_statuses()
}

// 获取单个快捷键状态
#[tauri::command]
pub fn get_shortcut_status(id: String) -> Option<crate::hotkey::ShortcutStatus> {
    crate::hotkey::get_shortcut_status(&id)
}

fn update_tray_monitor_label(enabled: bool) {
    use crate::windows::tray::TOGGLE_MONITOR_ITEM;
    
    if let Some(item) = TOGGLE_MONITOR_ITEM.get() {
        let label = if enabled {
            "禁用剪贴板监听"
        } else {
            "启用剪贴板监听"
        };
        let _ = item.set_text(label);
    }
}

// 保存窗口位置
#[tauri::command]
pub fn save_window_position(x: i32, y: i32) -> Result<(), String> {
    let mut settings = get_settings();
    settings.saved_window_position = Some((x, y));
    update_settings(settings)?;
    Ok(())
}

// 保存窗口大小
#[tauri::command]
pub fn save_window_size(width: u32, height: u32) -> Result<(), String> {
    let mut settings = get_settings();
    settings.saved_window_size = Some((width, height));
    update_settings(settings)?;
    Ok(())
}

#[tauri::command]
pub fn save_quickpaste_window_size(width: u32, height: u32) -> Result<(), String> {
    let mut settings = get_settings();
    settings.quickpaste_window_width = width;
    settings.quickpaste_window_height = height;
    update_settings(settings)?;
    Ok(())
}


use crate::services::{AppSettings, get_settings, update_settings, get_data_directory};
use crate::services::settings::storage::SettingsStorage;
use serde_json::Value;

// 重新加载设置
#[tauri::command]
pub fn reload_settings() -> Result<AppSettings, String> {
    let settings = SettingsStorage::load()?;
    update_settings(settings.clone())?;
    Ok(settings)
}

// 保存设置
#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    update_settings(settings)?;
    
    // 重新加载快捷键配置
    if let Err(e) = crate::hotkey::reload_from_settings() {
        eprintln!("重新加载快捷键失败: {}", e);
    }
    
    Ok(())
}

// 获取当前设置
#[tauri::command]
pub fn get_settings_cmd() -> AppSettings {
    get_settings()
}

// 设置贴边隐藏
#[tauri::command]
pub fn set_edge_hide_enabled(enabled: bool) -> Result<(), String> {
    let mut settings = get_settings();
    settings.edge_hide_enabled = enabled;
    update_settings(settings)?;
    Ok(())
}

// 获取所有窗口信息
#[tauri::command]
pub fn get_all_windows_info_cmd() -> Result<Vec<Value>, String> {
    Ok(vec![])
}

// 检查是否为便携版模式
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

// 检查管理员状态
#[tauri::command]
pub fn get_admin_status() -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
        use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
        use std::mem;
        
        unsafe {
            let mut token = Default::default();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_ok() {
                let mut elevation = TOKEN_ELEVATION::default();
                let mut return_length = 0;
                
                if GetTokenInformation(
                    token,
                    TokenElevation,
                    Some(&mut elevation as *mut _ as *mut _),
                    mem::size_of::<TOKEN_ELEVATION>() as u32,
                    &mut return_length,
                ).is_ok() {
                    return Ok(serde_json::json!({
                        "is_admin": elevation.TokenIsElevated != 0
                    }));
                }
            }
        }
    }

    Ok(serde_json::json!({
        "is_admin": false
    }))
}

// 以管理员权限重启
#[tauri::command]
pub fn restart_as_admin() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;
        use std::process::Command;
        
        let exe_path = env::current_exe().map_err(|e| e.to_string())?;

        Command::new("powershell")
            .args(&[
                "-Command",
                &format!("Start-Process -FilePath '{}' -Verb RunAs", exe_path.display())
            ])
            .spawn()
            .map_err(|e| e.to_string())?;

        std::process::exit(0);
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("仅支持Windows平台".to_string())
    }
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


use once_cell::sync::{OnceCell, Lazy};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use serde::{Serialize, Deserialize};

static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();
static MAIN_WINDOW: OnceCell<WebviewWindow> = OnceCell::new();
static REGISTERED_SHORTCUTS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());
static HOTKEYS_ENABLED: AtomicBool = AtomicBool::new(true);

// 快捷键注册状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutStatus {
    pub id: String,
    pub shortcut: String,
    pub success: bool,
    pub error: Option<String>,
}

static SHORTCUT_STATUS: Lazy<Mutex<HashMap<String, ShortcutStatus>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn init_hotkey_manager(app: AppHandle, window: WebviewWindow) {
    let _ = APP_HANDLE.set(app);
    let _ = MAIN_WINDOW.set(window);
}

fn get_app() -> Result<&'static AppHandle, String> {
    APP_HANDLE.get().ok_or("热键管理器未初始化".to_string())
}

fn get_main_window() -> Option<&'static WebviewWindow> {
    MAIN_WINDOW.get()
}

fn parse_shortcut(shortcut_str: &str) -> Result<Shortcut, String> {
    let normalized = shortcut_str
        .replace("Win+", "Super+")
        .replace("Ctrl+", "Control+");
    
    normalized.parse::<Shortcut>()
        .map_err(|e| format!("解析快捷键失败: {}", e))
}

pub fn register_shortcut<F>(id: &str, shortcut_str: &str, handler: F) -> Result<(), String>
where
    F: Fn(&AppHandle) + Send + Sync + 'static,
{
    let app = get_app()?;
    
    unregister_shortcut(id);
    
    let shortcut = match parse_shortcut(shortcut_str) {
        Ok(s) => s,
        Err(_e) => {
            update_shortcut_status(id, shortcut_str, false, Some("REGISTRATION_FAILED".to_string()));
            return Err("REGISTRATION_FAILED".to_string());
        }
    };
    
    match app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                handler(app);
            }
        }) {
        Ok(_) => {
            REGISTERED_SHORTCUTS.lock().push((id.to_string(), shortcut_str.to_string()));
            update_shortcut_status(id, shortcut_str, true, None);
            println!("已注册快捷键 [{}]: {}", id, shortcut_str);
            Ok(())
        }
        Err(e) => {
            let error_msg = if e.to_string().contains("already registered") {
                "CONFLICT".to_string()
            } else {
                "REGISTRATION_FAILED".to_string()
            };
            update_shortcut_status(id, shortcut_str, false, Some(error_msg.clone()));
            Err(format!("注册快捷键失败: {}", e))
        }
    }
}

pub fn unregister_shortcut(id: &str) {
    let app = match get_app() {
        Ok(app) => app,
        Err(_) => return,
    };
    
    let mut shortcuts = REGISTERED_SHORTCUTS.lock();
    if let Some(pos) = shortcuts.iter().position(|(registered_id, _)| registered_id == id) {
        let (_, shortcut_str) = shortcuts.remove(pos);
        if let Ok(shortcut) = parse_shortcut(&shortcut_str) {
            let _ = app.global_shortcut().unregister(shortcut);
            println!("已注销快捷键 [{}]: {}", id, shortcut_str);
        }
    }
    
    clear_shortcut_status(id);
}

pub fn register_toggle_hotkey(shortcut_str: &str) -> Result<(), String> {
    register_shortcut("toggle", shortcut_str, |app| {
        let _ = crate::toggle_main_window_visibility(app);
    })
}

pub fn register_quickpaste_hotkey(shortcut_str: &str) -> Result<(), String> {
    let app = get_app()?;
    
    unregister_shortcut("quickpaste");
    
    let shortcut = parse_shortcut(shortcut_str)?;
    
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Err(e) = crate::windows::quickpaste::show_quickpaste_window(&app) {
                    eprintln!("显示便捷粘贴窗口失败: {}", e);
                }
            } else if event.state == ShortcutState::Released {
                if let Some(window) = app.get_webview_window("quickpaste") {
                    let _ = window.emit("quickpaste-hide", ());
                }
                
                let app_clone = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if let Err(e) = crate::windows::quickpaste::hide_quickpaste_window(&app_clone) {
                        eprintln!("隐藏便捷粘贴窗口失败: {}", e);
                    }
                });
            }
        })
        .map_err(|e| format!("注册便捷粘贴快捷键失败: {}", e))?;
    
    REGISTERED_SHORTCUTS.lock().push(("quickpaste".to_string(), shortcut_str.to_string()));
    
    println!("已注册便捷粘贴快捷键: {}", shortcut_str);
    Ok(())
}

pub fn register_screenshot_hotkey(shortcut_str: &str) -> Result<(), String> {
    register_shortcut("screenshot", shortcut_str, |app| {
        if let Err(e) = crate::windows::screenshot_window::start_screenshot(app) {
            eprintln!("启动截图窗口失败: {}", e);
        }
    })
}

pub fn register_toggle_clipboard_monitor_hotkey(shortcut_str: &str) -> Result<(), String> {
    register_shortcut("toggle_clipboard_monitor", shortcut_str, |app| {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = crate::commands::settings::toggle_clipboard_monitor(&app_clone) {
                eprintln!("切换剪贴板监听状态失败: {}", e);
            }
        });
    })
}

pub fn register_toggle_paste_with_format_hotkey(shortcut_str: &str) -> Result<(), String> {
    register_shortcut("toggle_paste_with_format", shortcut_str, |app| {
        let app_clone = app.clone();
        std::thread::spawn(move || {
            if let Err(e) = crate::commands::settings::toggle_paste_with_format(&app_clone) {
                eprintln!("切换格式粘贴状态失败: {}", e);
            }
        });
    })
}

pub fn register_number_shortcuts(modifier: &str) -> Result<(), String> {
    let app = get_app()?;
    
    unregister_number_shortcuts();
    
    for num in 1..=9 {
        let id = format!("number_{}", num);
        let shortcut_str = format!("{}+{}", modifier, num);
        
        if let Ok(shortcut) = parse_shortcut(&shortcut_str) {
            let index = (num - 1) as usize;
            
            app.global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Err(e) = handle_number_shortcut(index) {
                            eprintln!("执行数字快捷键 {} 失败: {}", index + 1, e);
                        }
                    }
                })
                .map_err(|e| format!("注册数字快捷键 {} 失败: {}", shortcut_str, e))?;
            
            REGISTERED_SHORTCUTS.lock().push((id, shortcut_str.clone()));
            println!("已注册数字快捷键: {}", shortcut_str);
        }
    }
    
    Ok(())
}

pub fn unregister_number_shortcuts() {
    let mut shortcuts = REGISTERED_SHORTCUTS.lock();
    let number_shortcuts: Vec<_> = shortcuts
        .iter()
        .filter(|(id, _)| id.starts_with("number_"))
        .cloned()
        .collect();
    
    for (id, shortcut_str) in number_shortcuts {
        if let Ok(shortcut) = parse_shortcut(&shortcut_str) {
            if let Ok(app) = get_app() {
                let _ = app.global_shortcut().unregister(shortcut);
                println!("已注销数字快捷键: {}", shortcut_str);
            }
        }
        shortcuts.retain(|(sid, _)| sid != &id);
    }
}

fn handle_number_shortcut(index: usize) -> Result<(), String> {
    use crate::services::database::{query_clipboard_items, QueryParams};
    use crate::services::paste::paste_handler::paste_clipboard_item_with_update;
    
    let items = query_clipboard_items(QueryParams {
        offset: 0,
        limit: 9,
        search: None,
        content_type: None,
    })?.items;
    
    let item = items.get(index)
        .ok_or_else(|| format!("剪贴板项索引 {} 超出范围（共 {} 项）", index + 1, items.len()))?;
    
    paste_clipboard_item_with_update(item)
}

pub fn unregister_all() {
    let shortcuts = REGISTERED_SHORTCUTS.lock().clone();
    for (id, _) in shortcuts {
        unregister_shortcut(&id);
    }
}

pub fn enable_hotkeys() -> Result<(), String> {
    if HOTKEYS_ENABLED.load(Ordering::Relaxed) {
        return Ok(());
    }
    
    reload_from_settings()?;
    HOTKEYS_ENABLED.store(true, Ordering::Relaxed);
    println!("已启用全局热键");
    Ok(())
}

pub fn disable_hotkeys() {
    if !HOTKEYS_ENABLED.load(Ordering::Relaxed) {
        return;
    }
    
    unregister_all();
    HOTKEYS_ENABLED.store(false, Ordering::Relaxed);
    println!("已禁用全局热键");
}

pub fn is_hotkeys_enabled() -> bool {
    HOTKEYS_ENABLED.load(Ordering::Relaxed)
}

// 更新快捷键状态
fn update_shortcut_status(id: &str, shortcut: &str, success: bool, error: Option<String>) {
    let mut status_map = SHORTCUT_STATUS.lock();
    status_map.insert(
        id.to_string(),
        ShortcutStatus {
            id: id.to_string(),
            shortcut: shortcut.to_string(),
            success,
            error,
        },
    );
}

// 获取所有快捷键状态
pub fn get_shortcut_statuses() -> Vec<ShortcutStatus> {
    let status_map = SHORTCUT_STATUS.lock();
    status_map.values().cloned().collect()
}

// 获取单个快捷键状态
pub fn get_shortcut_status(id: &str) -> Option<ShortcutStatus> {
    let status_map = SHORTCUT_STATUS.lock();
    status_map.get(id).cloned()
}

// 清除快捷键状态
fn clear_shortcut_status(id: &str) {
    let mut status_map = SHORTCUT_STATUS.lock();
    status_map.remove(id);
}

pub fn reload_from_settings() -> Result<(), String> {
    let settings = crate::get_settings();
    
    unregister_all();
    
    if settings.hotkeys_enabled {
        if !settings.toggle_shortcut.is_empty() {
            if let Err(e) = register_toggle_hotkey(&settings.toggle_shortcut) {
                eprintln!("注册主窗口切换快捷键失败: {}", e);
            }
        }
        
        if settings.quickpaste_enabled && !settings.quickpaste_shortcut.is_empty() {
            if let Err(e) = register_quickpaste_hotkey(&settings.quickpaste_shortcut) {
                eprintln!("注册预览窗口快捷键失败: {}", e);
            }
        }
        
        if settings.screenshot_enabled && !settings.screenshot_shortcut.is_empty() {
            if let Err(e) = register_screenshot_hotkey(&settings.screenshot_shortcut) {
                eprintln!("注册截图快捷键失败: {}", e);
            }
        }
        
        if !settings.toggle_clipboard_monitor_shortcut.is_empty() {
            if let Err(e) = register_toggle_clipboard_monitor_hotkey(&settings.toggle_clipboard_monitor_shortcut) {
                eprintln!("注册切换剪贴板监听快捷键失败: {}", e);
            }
        }
        
        if !settings.toggle_paste_with_format_shortcut.is_empty() {
            if let Err(e) = register_toggle_paste_with_format_hotkey(&settings.toggle_paste_with_format_shortcut) {
                eprintln!("注册切换格式粘贴快捷键失败: {}", e);
            }
        }
        
        if settings.number_shortcuts && !settings.number_shortcuts_modifier.is_empty() {
            if let Err(e) = register_number_shortcuts(&settings.number_shortcuts_modifier) {
                eprintln!("注册数字快捷键失败: {}", e);
            }
        }
    }
    
    Ok(())
}


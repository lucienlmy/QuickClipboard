use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();
static MAIN_WINDOW: OnceCell<WebviewWindow> = OnceCell::new();
static REGISTERED_SHORTCUTS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());
static HOTKEYS_ENABLED: AtomicBool = AtomicBool::new(true);

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
    
    let shortcut = parse_shortcut(shortcut_str)?;
    
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                handler(app);
            }
        })
        .map_err(|e| format!("注册快捷键失败: {}", e))?;
    
    REGISTERED_SHORTCUTS.lock().push((id.to_string(), shortcut_str.to_string()));
    
    println!("已注册快捷键 [{}]: {}", id, shortcut_str);
    Ok(())
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
}

pub fn register_toggle_hotkey(shortcut_str: &str) -> Result<(), String> {
    register_shortcut("toggle", shortcut_str, |app| {
        let _ = crate::toggle_main_window_visibility(app);
    })
}

pub fn register_preview_hotkey(shortcut_str: &str) -> Result<(), String> {
    let app = get_app()?;
    
    unregister_shortcut("preview");
    
    let shortcut = parse_shortcut(shortcut_str)?;
    
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                println!("预览窗口快捷键按下");
            } else if event.state == ShortcutState::Released {
                println!("预览窗口快捷键释放");
            }
        })
        .map_err(|e| format!("注册预览快捷键失败: {}", e))?;
    
    REGISTERED_SHORTCUTS.lock().push(("preview".to_string(), shortcut_str.to_string()));
    
    println!("已注册预览窗口快捷键: {}", shortcut_str);
    Ok(())
}

pub fn register_screenshot_hotkey(shortcut_str: &str) -> Result<(), String> {
    register_shortcut("screenshot", shortcut_str, |_app| {
        println!("截图快捷键触发");
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
                        handle_number_shortcut(index);
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

fn handle_number_shortcut(index: usize) {
    println!("数字快捷键 {} 触发", index + 1);
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

pub fn reload_from_settings() -> Result<(), String> {
    let settings = crate::get_settings();
    
    if settings.hotkeys_enabled {
        if !settings.toggle_shortcut.is_empty() {
            if let Err(e) = register_toggle_hotkey(&settings.toggle_shortcut) {
                eprintln!("注册主窗口切换快捷键失败: {}", e);
            }
        }
        
        if settings.preview_enabled && !settings.preview_shortcut.is_empty() {
            if let Err(e) = register_preview_hotkey(&settings.preview_shortcut) {
                eprintln!("注册预览窗口快捷键失败: {}", e);
            }
        }
        
        if settings.screenshot_enabled && !settings.screenshot_shortcut.is_empty() {
            if let Err(e) = register_screenshot_hotkey(&settings.screenshot_shortcut) {
                eprintln!("注册截图快捷键失败: {}", e);
            }
        }
        
        if settings.number_shortcuts && !settings.number_shortcuts_modifier.is_empty() {
            if let Err(e) = register_number_shortcuts(&settings.number_shortcuts_modifier) {
                eprintln!("注册数字快捷键失败: {}", e);
            }
        }
    } else {
        unregister_all();
    }
    
    Ok(())
}


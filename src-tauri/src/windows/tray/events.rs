use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, menu::MenuEvent};
use crate::windows::settings_window::open_settings_window;

pub fn handle_tray_click(app: &AppHandle) {
    crate::toggle_main_window_visibility(app);
}

pub fn create_click_handler(app_handle: AppHandle) -> impl Fn() + Send + 'static {
    let last_click_time = Arc::new(Mutex::new(Instant::now() - Duration::from_millis(1000)));
    
    move || {
        let now = Instant::now();
        let mut last_time = last_click_time.lock().unwrap();
        
        if now.duration_since(*last_time) < Duration::from_millis(50) {
            return;
        }
        
        *last_time = now;
        drop(last_time);
        
        handle_tray_click(&app_handle);
    }
}

pub fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id.as_ref() {
        "toggle" => {
            crate::toggle_main_window_visibility(app);
        }
        "toggle-hotkeys" => {
            toggle_hotkeys(app);
        }
        "toggle-clipboard-monitor" => {
            toggle_clipboard_monitor(app);
        }
        "restart" => {
            restart_app(app);
        }
        "quit" => {
            quit_app(app);
        }
        "settings" => {
            open_settings_window(app);
        }
        "screenshot" => {
            if let Err(e) = crate::windows::screenshot_window::start_screenshot(app) {
                eprintln!("启动截图窗口失败: {}", e);
            }
        }
        _ => {}
    }
}

fn toggle_hotkeys(_app: &AppHandle) {
    let mut settings = crate::get_settings();
    settings.hotkeys_enabled = !settings.hotkeys_enabled;
    
    if let Err(e) = crate::update_settings(settings.clone()) {
        eprintln!("更新快捷键设置失败: {}", e);
        return;
    }
    
    // 更新快捷键状态
    if settings.hotkeys_enabled {
        if let Err(e) = crate::hotkey::reload_from_settings() {
            eprintln!("重新加载快捷键失败: {}", e);
        }
    } else {
        crate::hotkey::unregister_all();
    }
    
    // 更新菜单项文本
    if let Some(item) = super::menu::TOGGLE_HOTKEYS_ITEM.get() {
        let label = if settings.hotkeys_enabled {
            "禁用快捷键"
        } else {
            "启用快捷键"
        };
        let _ = item.set_text(label);
    }
}

fn toggle_clipboard_monitor(app: &AppHandle) {
    let mut settings = crate::get_settings();
    settings.clipboard_monitor = !settings.clipboard_monitor;
    
    if let Err(e) = crate::commands::settings::save_settings(settings, app.clone()) {
        eprintln!("保存剪贴板监听设置失败: {}", e);
    }
}

fn restart_app(app: &AppHandle) {
    app.restart();
}

fn quit_app(app: &AppHandle) {
    app.exit(0);
}

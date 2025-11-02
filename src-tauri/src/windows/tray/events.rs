use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, menu::MenuEvent};

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
        "settings" | "screenshot" => {
            eprintln!("功能 {} 还未重构", event.id.as_ref());
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

fn toggle_clipboard_monitor(_app: &AppHandle) {
    let mut settings = crate::get_settings();
    settings.clipboard_monitor = !settings.clipboard_monitor;
    
    if let Err(e) = crate::update_settings(settings.clone()) {
        eprintln!("更新剪贴板监听设置失败: {}", e);
        return;
    }
    
    // 启动或停止剪贴板监听
    if settings.clipboard_monitor {
        if let Err(e) = crate::start_clipboard_monitor() {
            eprintln!("启动剪贴板监听失败: {}", e);
        }
    } else {
        if let Err(e) = crate::stop_clipboard_monitor() {
            eprintln!("停止剪贴板监听失败: {}", e);
        }
    }

    // 更新菜单项文本
    if let Some(item) = super::menu::TOGGLE_MONITOR_ITEM.get() {
        let label = if settings.clipboard_monitor {
            "禁用剪贴板监听"
        } else {
            "启用剪贴板监听"
        };
        let _ = item.set_text(label);
    }
}

fn restart_app(app: &AppHandle) {
    app.restart();
}

fn quit_app(app: &AppHandle) {
    app.exit(0);
}

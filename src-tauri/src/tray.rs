use image::GenericImageView;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

use once_cell::sync::OnceCell;

// 暴露需要动态更新文本的菜单项引用
pub static TOGGLE_HOTKEYS_ITEM: OnceCell<tauri::menu::MenuItem<tauri::Wry>> = OnceCell::new();
pub static TOGGLE_MONITOR_ITEM: OnceCell<tauri::menu::MenuItem<tauri::Wry>> = OnceCell::new();

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // 创建托盘菜单
    let toggle_item = MenuItem::with_id(app, "toggle", "显示/隐藏", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let screenshot_item = MenuItem::with_id(app, "screenshot", "截屏", true, None::<&str>)?;
    // 根据当前状态设置切换项的初始文本
    let any_hotkeys_enabled = {
        let hook = crate::shortcut_interceptor::is_interception_enabled();
        let poll = crate::key_state_monitor::is_polling_active();
        hook || poll
    };
    let hotkeys_label = if any_hotkeys_enabled {
        "禁用快捷键"
    } else {
        "启用快捷键"
    };
    let monitor_label = if crate::clipboard_history::is_monitoring_enabled() {
        "禁用剪贴板监听"
    } else {
        "启用剪贴板监听"
    };

    let toggle_hotkeys_item =
        MenuItem::with_id(app, "toggle-hotkeys", hotkeys_label, true, None::<&str>)?;
    let toggle_monitor_item = MenuItem::with_id(
        app,
        "toggle-clipboard-monitor",
        monitor_label,
        true,
        None::<&str>,
    )?;

    // 存储可变更文本的菜单项以便后续更新
    let _ = TOGGLE_HOTKEYS_ITEM.set(toggle_hotkeys_item.clone());
    let _ = TOGGLE_MONITOR_ITEM.set(toggle_monitor_item.clone());

    let separator2 = PredefinedMenuItem::separator(app)?;
    let separator3 = PredefinedMenuItem::separator(app)?;
    let restart_item = MenuItem::with_id(app, "restart", "重启程序", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &toggle_item,
            &separator,
            &settings_item,
            &screenshot_item,
            &separator2,
            &toggle_hotkeys_item,
            &toggle_monitor_item,
            &separator3,
            &restart_item,
            &quit_item,
        ],
    )?;

    // 创建托盘图标
    let icon = {
        // 优先用 64x64 图标
        let icon_data = include_bytes!("../icons/icon64.png");
        let img = image::load_from_memory(icon_data)?;
        let rgba = img.to_rgba8();
        let (width, height) = img.dimensions();
        tauri::image::Image::new_owned(rgba.into_raw(), width, height)
    };

    let app_handle = app.clone();
    let last_click_time = Arc::new(Mutex::new(Instant::now() - Duration::from_millis(1000)));
    
    let _tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("快速剪贴板")
        .icon(icon)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::Click { button, .. } = event {
                if button == tauri::tray::MouseButton::Left {
                    // 防抖检查：如果距离上次点击时间少于200ms，则忽略
                    let now = Instant::now();
                    let mut last_time = last_click_time.lock().unwrap();
                    
                    if now.duration_since(*last_time) < Duration::from_millis(50) {
                        return;
                    }
                    
                    *last_time = now;
                    drop(last_time); // 释放锁
                    
                    if let Some(window) = app_handle.get_webview_window("main") {
                        crate::window_management::toggle_webview_window_visibility(window);
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

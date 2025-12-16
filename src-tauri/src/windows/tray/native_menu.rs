use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem, MenuEvent},
    tray::TrayIconId,
};

// 创建原生系统托盘菜单
pub fn create_native_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let settings = crate::get_settings();
    let is_force_update = crate::windows::updater_window::is_force_update_mode();
    
    let toggle = MenuItem::with_id(app, "toggle", "显示主窗口", !is_force_update, None::<&str>)
        .map_err(|e| e.to_string())?;
    
    let sep1 = PredefinedMenuItem::separator(app)
        .map_err(|e| e.to_string())?;
    
    let hotkeys_label = if settings.hotkeys_enabled { "禁用快捷键" } else { "启用快捷键" };
    let toggle_hotkeys = MenuItem::with_id(app, "toggle-hotkeys", hotkeys_label, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    
    let monitor_label = if settings.clipboard_monitor { "禁用剪贴板监听" } else { "启用剪贴板监听" };
    let toggle_monitor = MenuItem::with_id(app, "toggle-clipboard-monitor", monitor_label, true, None::<&str>)
        .map_err(|e| e.to_string())?;
    
    let sep2 = PredefinedMenuItem::separator(app)
        .map_err(|e| e.to_string())?;
    
    let exit_low_memory = MenuItem::with_id(app, "exit-low-memory", "退出低占用模式", !is_force_update, None::<&str>)
        .map_err(|e| e.to_string())?;
    
    let sep3 = PredefinedMenuItem::separator(app)
        .map_err(|e| e.to_string())?;
    
    let restart = MenuItem::with_id(app, "restart", "重启程序", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    Menu::with_items(app, &[
        &toggle,
        &sep1,
        &toggle_hotkeys,
        &toggle_monitor,
        &sep2,
        &exit_low_memory,
        &sep3,
        &restart,
        &quit,
    ]).map_err(|e| e.to_string())
}

// 处理原生菜单事件
pub fn handle_native_menu_event(app: &AppHandle, event: &MenuEvent) {
    let id = event.id().as_ref();
    
    match id {
        "toggle" | "exit-low-memory" => {
            if let Err(e) = crate::services::low_memory::exit_low_memory_mode(app) {
                eprintln!("退出低占用模式失败: {}", e);
                return;
            }
            if let Some(window) = app.get_webview_window("main") {
                crate::show_main_window(&window);
            }
        }
        "toggle-hotkeys" => {
            toggle_hotkeys(app);
        }
        "toggle-clipboard-monitor" => {
            if let Err(e) = crate::commands::settings::toggle_clipboard_monitor(app) {
                eprintln!("切换剪贴板监听状态失败: {}", e);
            }
            // 更新菜单
            let _ = update_native_menu(app);
        }
        "restart" => {
            app.restart();
        }
        "quit" => {
            crate::services::low_memory::set_user_requested_exit(true);
            app.exit(0);
        }
        _ => {}
    }
}

// 切换快捷键状态
fn toggle_hotkeys(app: &AppHandle) {
    let mut settings = crate::get_settings();
    settings.hotkeys_enabled = !settings.hotkeys_enabled;
    
    if let Err(e) = crate::update_settings(settings.clone()) {
        eprintln!("更新快捷键设置失败: {}", e);
        return;
    }
    
    if settings.hotkeys_enabled {
        if let Err(e) = crate::hotkey::reload_from_settings() {
            eprintln!("重新加载快捷键失败: {}", e);
        }
    } else {
        crate::hotkey::unregister_all();
    }

    let _ = update_native_menu(app);
}

// 更新原生菜单
pub fn update_native_menu(app: &AppHandle) -> Result<(), String> {
    let tray_id = TrayIconId::new("main-tray");
    if let Some(tray) = app.tray_by_id(&tray_id) {
        let menu = create_native_menu(app)?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

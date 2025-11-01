use once_cell::sync::OnceCell;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    AppHandle,
};

pub static TOGGLE_HOTKEYS_ITEM: OnceCell<MenuItem<tauri::Wry>> = OnceCell::new();
pub static TOGGLE_MONITOR_ITEM: OnceCell<MenuItem<tauri::Wry>> = OnceCell::new();

pub fn create_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let toggle_item = MenuItem::with_id(app, "toggle", "显示/隐藏", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let screenshot_item = MenuItem::with_id(app, "screenshot", "截屏", true, None::<&str>)?;
    
    // TODO: 从配置读取状态
    let hotkeys_label = "启用快捷键";
    let monitor_label = "启用剪贴板监听";

    let toggle_hotkeys_item = MenuItem::with_id(app, "toggle-hotkeys", hotkeys_label, true, None::<&str>)?;
    let toggle_monitor_item = MenuItem::with_id(app, "toggle-clipboard-monitor", monitor_label, true, None::<&str>)?;

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

    Ok(menu)
}


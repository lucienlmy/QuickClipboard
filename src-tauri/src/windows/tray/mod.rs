mod setup;
mod menu;
mod events;
mod native_menu;

pub use setup::*;
pub use menu::*;
pub use events::*;
pub use native_menu::handle_native_menu_event;

use tauri::{AppHandle, Manager, tray::TrayIconId};

// 切换到原生系统菜单
pub fn switch_to_native_menu(app: &AppHandle) -> Result<(), String> {
    let tray_id = TrayIconId::new("main-tray");
    if let Some(tray) = app.tray_by_id(&tray_id) {
        let menu = native_menu::create_native_menu(app)?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        tray.set_show_menu_on_left_click(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 切换回 WebView 菜单
pub fn switch_to_webview_menu(app: &AppHandle) -> Result<(), String> {
    let tray_id = TrayIconId::new("main-tray");
    if let Some(tray) = app.tray_by_id(&tray_id) {
        tray.set_menu(None::<tauri::menu::Menu<tauri::Wry>>).map_err(|e| e.to_string())?;
        tray.set_show_menu_on_left_click(false).map_err(|e| e.to_string())?;
    }
    Ok(())
}


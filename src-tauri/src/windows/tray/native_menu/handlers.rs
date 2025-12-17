//菜单事件处理

use tauri::{AppHandle, Manager, menu::MenuEvent};
use super::state;
use super::builder::update_native_menu;

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
            let _ = update_native_menu(app);
        }
        "toggle-paste-format" => {
            if let Err(e) = crate::commands::settings::toggle_paste_with_format(app) {
                eprintln!("切换格式粘贴状态失败: {}", e);
            }
            let _ = update_native_menu(app);
        }
        "restart" => {
            app.restart();
        }
        "quit" => {
            crate::services::low_memory::set_user_requested_exit(true);
            app.exit(0);
        }
        id if id.starts_with("clipboard-slot-") => {
            if let Some(slot_str) = id.strip_prefix("clipboard-slot-") {
                if let Ok(slot_idx) = slot_str.parse::<usize>() {
                    if let Some(item_id) = state::get_item_id_at(slot_idx) {
                        if item_id > 0 {
                            handle_clipboard_item_click(item_id);
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

// 处理剪贴板项点击
fn handle_clipboard_item_click(item_id: i64) {
    use crate::services::database::get_clipboard_item_by_id;
    use crate::services::paste::paste_handler::paste_clipboard_item_with_update;
    use crate::services::system::restore_last_focus;

    let _ = restore_last_focus();

    std::thread::sleep(std::time::Duration::from_millis(100));
    
    if let Ok(Some(item)) = get_clipboard_item_by_id(item_id) {
        let _ = paste_clipboard_item_with_update(&item);
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

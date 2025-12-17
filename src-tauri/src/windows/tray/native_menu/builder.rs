// 菜单构建

use crate::services::database::{get_clipboard_count, query_clipboard_items, QueryParams};
use super::state::{self, PAGE_SIZE};
use super::utils::format_item_label;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconId,
    AppHandle,
};

fn parse_accelerator(shortcut: &str) -> Option<String> {
    if shortcut.is_empty() {
        return None;
    }
    let accelerator = shortcut
        .replace("Ctrl+", "CmdOrCtrl+")
        .replace("Win+", "Super+");
    Some(accelerator)
}

// 构建剪贴板菜单项
fn build_clipboard_items(app: &AppHandle) -> Result<Vec<MenuItem<tauri::Wry>>, String> {
    let total_count = get_clipboard_count().unwrap_or(0) as i64;
    let total_pages = ((total_count as f64) / (PAGE_SIZE as f64)).ceil() as i64;
    let current_page = state::get_current_page();

    let current_page = if total_pages > 0 {
        current_page.min(total_pages - 1).max(0)
    } else {
        0
    };
    state::set_current_page(current_page);

    let mut menu_items_ref = state::get_menu_items();
    let mut item_ids = state::get_item_ids();
    menu_items_ref.clear();
    item_ids.clear();

    let mut result = Vec::new();

    if total_count == 0 {
        let empty_item =
            MenuItem::with_id(app, "clipboard-empty", "(暂无记录)", false, None::<&str>)
                .map_err(|e| e.to_string())?;
        result.push(empty_item);
        return Ok(result);
    }

    let items = query_clipboard_items(QueryParams {
        offset: current_page * PAGE_SIZE as i64,
        limit: PAGE_SIZE as i64,
        search: None,
        content_type: None,
    })?
    .items;

    for idx in 0..PAGE_SIZE {
        let (label, item_id, enabled) = if idx < items.len() {
            let item = &items[idx];
            let label = format_item_label(item);
            let display_idx = current_page * PAGE_SIZE as i64 + idx as i64 + 1;
            (format!("{}. {}", display_idx, label), item.id, true)
        } else {
            ("-".to_string(), 0, false)
        };

        let menu_item = MenuItem::with_id(
            app,
            format!("clipboard-slot-{}", idx),
            &label,
            enabled,
            None::<&str>,
        )
        .map_err(|e| e.to_string())?;

        if enabled {
            result.push(menu_item.clone());
        }

        menu_items_ref.push(menu_item);
        item_ids.push(item_id);
    }

    Ok(result)
}

// 创建分页信息菜单项
fn create_page_info_item(app: &AppHandle) -> Result<MenuItem<tauri::Wry>, String> {
    let total_count = get_clipboard_count().unwrap_or(0) as i64;
    let total_pages = ((total_count as f64) / (PAGE_SIZE as f64)).ceil() as i64;
    let current_page = state::get_current_page();

    let label = if total_pages > 1 {
        format!("第 {}/{} 页 (↕滚轮翻页)", current_page + 1, total_pages)
    } else {
        "剪贴板历史".to_string()
    };

    let item = MenuItem::with_id(app, "page-info", &label, false, None::<&str>)
        .map_err(|e| e.to_string())?;

    state::set_page_info_item(Some(item.clone()));

    Ok(item)
}

// 创建完整托盘菜单
fn create_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, String> {
    let clipboard_items = build_clipboard_items(app)?;
    let page_info = create_page_info_item(app)?;

    let menu = Menu::new(app).map_err(|e| e.to_string())?;

    // 剪贴板列表
    for item in &clipboard_items {
        menu.append(item).map_err(|e| e.to_string())?;
    }

    menu.append(&page_info).map_err(|e| e.to_string())?;

    let settings = crate::get_settings();
    let is_force_update = crate::windows::updater_window::is_force_update_mode();

    let sep1 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    menu.append(&sep1).map_err(|e| e.to_string())?;

    let toggle = MenuItem::with_id(
        app,
        "toggle",
        "显示主窗口",
        !is_force_update,
        parse_accelerator(&settings.toggle_shortcut).as_deref(),
    )
    .map_err(|e| e.to_string())?;
    menu.append(&toggle).map_err(|e| e.to_string())?;

    let sep2 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    menu.append(&sep2).map_err(|e| e.to_string())?;

    let hotkeys_label = if settings.hotkeys_enabled {
        "禁用快捷键"
    } else {
        "启用快捷键"
    };
    let toggle_hotkeys =
        MenuItem::with_id(app, "toggle-hotkeys", hotkeys_label, true, None::<&str>)
            .map_err(|e| e.to_string())?;
    menu.append(&toggle_hotkeys).map_err(|e| e.to_string())?;

    let monitor_label = if settings.clipboard_monitor {
        "禁用剪贴板监听"
    } else {
        "启用剪贴板监听"
    };
    let toggle_monitor = MenuItem::with_id(
        app,
        "toggle-clipboard-monitor",
        monitor_label,
        true,
        parse_accelerator(&settings.toggle_clipboard_monitor_shortcut).as_deref(),
    )
    .map_err(|e| e.to_string())?;
    menu.append(&toggle_monitor).map_err(|e| e.to_string())?;

    let format_label = if settings.paste_with_format {
        "禁用格式粘贴"
    } else {
        "启用格式粘贴"
    };
    let toggle_format = MenuItem::with_id(
        app,
        "toggle-paste-format",
        format_label,
        true,
        parse_accelerator(&settings.toggle_paste_with_format_shortcut).as_deref(),
    )
    .map_err(|e| e.to_string())?;
    menu.append(&toggle_format).map_err(|e| e.to_string())?;

    let sep3 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    menu.append(&sep3).map_err(|e| e.to_string())?;

    let exit_low_memory = MenuItem::with_id(
        app,
        "exit-low-memory",
        "退出低占用模式",
        !is_force_update,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    menu.append(&exit_low_memory).map_err(|e| e.to_string())?;

    let sep4 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    menu.append(&sep4).map_err(|e| e.to_string())?;

    let restart = MenuItem::with_id(app, "restart", "重启程序", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&restart).map_err(|e| e.to_string())?;

    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&quit).map_err(|e| e.to_string())?;

    Ok(menu)
}

pub fn create_native_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, String> {
    create_menu(app)
}

// 更新托盘菜单
pub fn update_native_menu(app: &AppHandle) -> Result<(), String> {
    let tray_id = TrayIconId::new("main-tray");
    if let Some(tray) = app.tray_by_id(&tray_id) {
        let menu = create_native_menu(app)?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

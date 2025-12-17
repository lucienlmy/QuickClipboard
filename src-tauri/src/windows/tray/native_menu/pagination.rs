// 分页逻辑

use crate::services::database::{query_clipboard_items, get_clipboard_count, QueryParams};
use super::state::{self, PAGE_SIZE};
use super::utils::format_item_label;

// 获取总页数
pub fn get_total_pages() -> i64 {
    let total_count = get_clipboard_count().unwrap_or(0) as i64;
    ((total_count as f64) / (PAGE_SIZE as f64)).ceil() as i64
}

// 设置菜单可见状态
pub fn set_menu_visible(visible: bool) {
    state::set_menu_visible_flag(visible);
    if visible {
        state::set_current_page(0);
        let _ = update_clipboard_items_text();
    }
}

// 检查菜单是否可见
pub fn is_menu_visible() -> bool {
    if !state::get_menu_visible() {
        return false;
    }
    
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, IsWindowVisible};
        use windows::core::w;
        
        unsafe {
            if let Ok(hwnd) = FindWindowW(w!("#32768"), None) {
                if hwnd.0.is_null() {
                    state::set_menu_visible_flag(false);
                    return false;
                }
                return IsWindowVisible(hwnd).as_bool();
            }
            state::set_menu_visible_flag(false);
            false
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

// 滚轮翻页
pub fn scroll_page(delta: i32) -> bool {
    if !is_menu_visible() {
        return false;
    }
    
    let total_pages = get_total_pages();
    if total_pages <= 1 {
        return false;
    }
    
    let current = state::get_current_page();
    let new_page = if delta > 0 {
        if current >= total_pages - 1 { 0 } else { current + 1 }
    } else {
        if current <= 0 { total_pages - 1 } else { current - 1 }
    };
    
    state::set_current_page(new_page);
    let _ = update_clipboard_items_text();
    
    crate::AppSounds::play_scroll();
    
    true
}

// 更新剪贴板菜单项文本
pub fn update_clipboard_items_text() -> Result<(), String> {
    let total_count = get_clipboard_count().unwrap_or(0) as i64;
    let total_pages = ((total_count as f64) / (PAGE_SIZE as f64)).ceil() as i64;
    let current_page = state::get_current_page();

    let items = query_clipboard_items(QueryParams {
        offset: current_page * PAGE_SIZE as i64,
        limit: PAGE_SIZE as i64,
        search: None,
        content_type: None,
    })?.items;

    let menu_items = state::get_menu_items();
    let mut item_ids = state::get_item_ids();

    if let Some(page_info) = state::get_page_info_item().as_ref() {
        let label = if total_pages > 1 {
            format!("第 {}/{} 页 (↕滚轮翻页)", current_page + 1, total_pages)
        } else {
            "剪贴板历史".to_string()
        };
        let _ = page_info.set_text(&label);
    }

    for (idx, menu_item) in menu_items.iter().enumerate() {
        if idx < items.len() {
            let item = &items[idx];
            let label = format_item_label(item);
            let display_idx = current_page * PAGE_SIZE as i64 + idx as i64 + 1;
            let _ = menu_item.set_text(format!("{}. {}", display_idx, label));
            let _ = menu_item.set_enabled(true);
            if idx < item_ids.len() {
                item_ids[idx] = item.id;
            }
        } else {
            let _ = menu_item.set_text("-");
            let _ = menu_item.set_enabled(false);
            if idx < item_ids.len() {
                item_ids[idx] = 0;
            }
        }
    }

    Ok(())
}

//菜单状态管理

use std::sync::atomic::{AtomicI64, AtomicBool, Ordering};
use parking_lot::Mutex;
use tauri::menu::MenuItem;

// 每页显示的条目数
pub const PAGE_SIZE: usize = 15;
// 标签最大显示宽度
pub const MAX_LABEL_LENGTH: usize = 40;

// 当前页码
static CURRENT_PAGE: AtomicI64 = AtomicI64::new(0);
// 菜单是否正在显示
static MENU_VISIBLE: AtomicBool = AtomicBool::new(false);

// 存储剪贴板菜单项引用，用于动态更新文本
static CLIPBOARD_MENU_ITEMS: Mutex<Vec<MenuItem<tauri::Wry>>> = Mutex::new(Vec::new());
// 存储当前页的剪贴板数据 ID
static CURRENT_ITEM_IDS: Mutex<Vec<i64>> = Mutex::new(Vec::new());
// 存储分页信息菜单项引用
static PAGE_INFO_ITEM: Mutex<Option<MenuItem<tauri::Wry>>> = Mutex::new(None);

pub fn get_current_page() -> i64 {
    CURRENT_PAGE.load(Ordering::SeqCst)
}

pub fn set_current_page(page: i64) {
    CURRENT_PAGE.store(page, Ordering::SeqCst);
}

pub fn get_menu_visible() -> bool {
    MENU_VISIBLE.load(Ordering::SeqCst)
}

pub fn set_menu_visible_flag(visible: bool) {
    MENU_VISIBLE.store(visible, Ordering::SeqCst);
}

pub fn get_menu_items() -> parking_lot::MutexGuard<'static, Vec<MenuItem<tauri::Wry>>> {
    CLIPBOARD_MENU_ITEMS.lock()
}

pub fn get_page_info_item() -> parking_lot::MutexGuard<'static, Option<MenuItem<tauri::Wry>>> {
    PAGE_INFO_ITEM.lock()
}

pub fn set_page_info_item(item: Option<MenuItem<tauri::Wry>>) {
    *PAGE_INFO_ITEM.lock() = item;
}

pub fn get_item_ids() -> parking_lot::MutexGuard<'static, Vec<i64>> {
    CURRENT_ITEM_IDS.lock()
}

pub fn get_item_id_at(index: usize) -> Option<i64> {
    let ids = CURRENT_ITEM_IDS.lock();
    ids.get(index).copied()
}

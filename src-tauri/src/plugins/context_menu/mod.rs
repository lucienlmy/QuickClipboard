/// 通用右键菜单插件

pub mod commands;
pub mod window;

use once_cell::sync::OnceCell;
use std::sync::{Mutex, atomic::{AtomicBool, AtomicU64, Ordering}};
use tauri::{AppHandle, Manager};

/// 存储菜单选择结果
static MENU_RESULT: OnceCell<Mutex<Option<String>>> = OnceCell::new();

/// 存储菜单配置
static MENU_OPTIONS: OnceCell<Mutex<Option<window::ContextMenuOptions>>> = OnceCell::new();

/// 存储应用句柄
static APP_HANDLE: OnceCell<Mutex<Option<AppHandle>>> = OnceCell::new();

/// 菜单可见状态标志
static MENU_VISIBLE: AtomicBool = AtomicBool::new(false);

/// 当前活动的菜单会话 ID
static ACTIVE_MENU_SESSION: AtomicU64 = AtomicU64::new(0);
/// 递增生成的菜单会话 ID
static MENU_SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);

/// 初始化右键菜单插件
#[allow(dead_code)]
pub fn init() {
    MENU_RESULT.get_or_init(|| Mutex::new(None));
    MENU_OPTIONS.get_or_init(|| Mutex::new(None));
}

/// 获取菜单选择结果
pub(crate) fn get_result() -> Option<String> {
    MENU_RESULT.get()
        .and_then(|r| r.lock().ok())
        .and_then(|r| r.clone())
}

/// 设置菜单选择结果
pub(crate) fn set_result(value: Option<String>) {
    if let Some(result_mutex) = MENU_RESULT.get() {
        if let Ok(mut result) = result_mutex.lock() {
            *result = value;
        }
    }
}

/// 清空菜单选择结果
pub(crate) fn clear_result() {
    set_result(None);
}

/// 设置菜单配置
pub(crate) fn set_options(options: window::ContextMenuOptions) {
    if let Some(options_mutex) = MENU_OPTIONS.get() {
        if let Ok(mut opts) = options_mutex.lock() {
            *opts = Some(options);
        }
    }
}

/// 获取菜单配置
pub(crate) fn get_options() -> Option<window::ContextMenuOptions> {
    MENU_OPTIONS.get()
        .and_then(|o| o.lock().ok())
        .and_then(|o| o.clone())
}

/// 清空菜单配置
pub(crate) fn clear_options() {
    if let Some(options_mutex) = MENU_OPTIONS.get() {
        if let Ok(mut opts) = options_mutex.lock() {
            *opts = None;
        }
    }
}

/// 按会话 ID 清空菜单配置
pub fn clear_options_for_session(session_id: u64) {
    if let Some(options_mutex) = MENU_OPTIONS.get() {
        if let Ok(mut opts) = options_mutex.lock() {
            if let Some(current) = opts.as_ref() {
                if current.session_id == session_id {
                    *opts = None;
                }
            }
        }
    }
}

/// 保存应用句柄
pub fn set_app_handle(app: AppHandle) {
    let handle_mutex = APP_HANDLE.get_or_init(|| Mutex::new(None));
    if let Ok(mut handle) = handle_mutex.lock() {
        *handle = Some(app);
    }
}

/// 设置当前活动菜单会话
pub fn set_active_menu_session(session_id: u64) {
    ACTIVE_MENU_SESSION.store(session_id, Ordering::Relaxed);
    MENU_VISIBLE.store(true, Ordering::Relaxed);
}

/// 清除当前活动菜单会话
pub fn clear_active_menu_session(session_id: u64) {
    let current = ACTIVE_MENU_SESSION.load(Ordering::Relaxed);
    if current == session_id {
        ACTIVE_MENU_SESSION.store(0, Ordering::Relaxed);
        MENU_VISIBLE.store(false, Ordering::Relaxed);
    }
}

/// 获取当前活动菜单会话 ID
pub fn get_active_menu_session() -> u64 {
    ACTIVE_MENU_SESSION.load(Ordering::Relaxed)
}

/// 生成新的菜单会话 ID
pub fn next_menu_session_id() -> u64 {
    MENU_SESSION_COUNTER.fetch_add(1, Ordering::Relaxed)
}

/// 检查右键菜单是否显示
pub fn is_menu_visible() -> bool {
    MENU_VISIBLE.load(Ordering::Relaxed)
}


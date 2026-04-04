use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static LOW_MEMORY_MODE: AtomicBool = AtomicBool::new(false);
static USER_REQUESTED_EXIT: AtomicBool = AtomicBool::new(false);
static AUTO_MANAGER_STARTED: AtomicBool = AtomicBool::new(false);
static LAST_WINDOW_ACTIVITY_AT_MS: AtomicU64 = AtomicU64::new(0);

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn is_low_memory_mode() -> bool {
    LOW_MEMORY_MODE.load(Ordering::SeqCst)
}

pub fn set_low_memory_mode(active: bool) {
    LOW_MEMORY_MODE.store(active, Ordering::SeqCst);
}

pub fn mark_window_activity() {
    LAST_WINDOW_ACTIVITY_AT_MS.store(now_unix_ms(), Ordering::SeqCst);
}

pub fn last_window_activity_at_ms() -> u64 {
    LAST_WINDOW_ACTIVITY_AT_MS.load(Ordering::SeqCst)
}

pub fn init_window_activity_timestamp() {
    mark_window_activity();
}

pub fn try_mark_auto_manager_started() -> bool {
    !AUTO_MANAGER_STARTED.swap(true, Ordering::SeqCst)
}

// 标记用户主动请求退出
pub fn set_user_requested_exit(requested: bool) {
    USER_REQUESTED_EXIT.store(requested, Ordering::SeqCst);
}

// 检查是否是用户主动请求退出
pub fn is_user_requested_exit() -> bool {
    USER_REQUESTED_EXIT.load(Ordering::SeqCst)
}

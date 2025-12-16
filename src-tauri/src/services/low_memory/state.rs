use std::sync::atomic::{AtomicBool, Ordering};

static LOW_MEMORY_MODE: AtomicBool = AtomicBool::new(false);
static USER_REQUESTED_EXIT: AtomicBool = AtomicBool::new(false);

pub fn is_low_memory_mode() -> bool {
    LOW_MEMORY_MODE.load(Ordering::SeqCst)
}

pub fn set_low_memory_mode(active: bool) {
    LOW_MEMORY_MODE.store(active, Ordering::SeqCst);
}

// 标记用户主动请求退出
pub fn set_user_requested_exit(requested: bool) {
    USER_REQUESTED_EXIT.store(requested, Ordering::SeqCst);
}

// 检查是否是用户主动请求退出
pub fn is_user_requested_exit() -> bool {
    USER_REQUESTED_EXIT.load(Ordering::SeqCst)
}

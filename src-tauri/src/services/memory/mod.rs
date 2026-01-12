// 内存清理模块

#[cfg(windows)]
use windows::Win32::System::{
    Memory::{
        HeapCompact, GetProcessHeap,
        SetProcessWorkingSetSizeEx,
        QUOTA_LIMITS_HARDWS_MIN_DISABLE, QUOTA_LIMITS_HARDWS_MAX_DISABLE,
    },
    Threading::GetCurrentProcess,
};

// 内存清理
#[cfg(windows)]
pub fn cleanup_memory() {
    unsafe {
        if let Ok(heap) = GetProcessHeap() {
            let _ = HeapCompact(heap, windows::Win32::System::Memory::HEAP_FLAGS(0));
        }
        
        let process = GetCurrentProcess();
        let _ = SetProcessWorkingSetSizeEx(
            process,
            usize::MAX,
            usize::MAX,
            QUOTA_LIMITS_HARDWS_MIN_DISABLE | QUOTA_LIMITS_HARDWS_MAX_DISABLE,
        );
    }
}

#[cfg(not(windows))]
pub fn cleanup_memory() {}

pub fn init() {
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_secs(3));
        cleanup_memory();
    });
}

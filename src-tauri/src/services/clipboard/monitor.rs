use super::capture::ClipboardContent;
use super::processor::process_content;
use super::storage::store_clipboard_item;
use clipboard_rs::{
    ClipboardHandler, ClipboardWatcher, ClipboardWatcherContext,
};
use std::sync::Arc;
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use std::thread;

/// 监听器状态
struct MonitorState {
    is_running: bool,
    watcher_handle: Option<thread::JoinHandle<()>>,
}

static MONITOR_STATE: Lazy<Arc<Mutex<MonitorState>>> = Lazy::new(|| {
    Arc::new(Mutex::new(MonitorState {
        is_running: false,
        watcher_handle: None,
    }))
});

/// 上一次捕获的内容哈希（用于去重）
static LAST_CONTENT_HASH: Lazy<Arc<Mutex<Option<String>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(None))
});

/// 剪贴板监听管理器
struct ClipboardMonitorManager;

impl ClipboardMonitorManager {
    pub fn new() -> Result<Self, String> {
        Ok(ClipboardMonitorManager)
    }
}

impl ClipboardHandler for ClipboardMonitorManager {
    fn on_clipboard_change(&mut self) {
        if !is_monitor_running() {
            return;
        }
        
        if let Err(e) = handle_clipboard_change() {
            if !e.contains("重复内容") {
                eprintln!("处理剪贴板内容失败: {}", e);
            }
        }
    }
}

/// 启动剪贴板监听
pub fn start_clipboard_monitor() -> Result<(), String> {
    let mut state = MONITOR_STATE.lock();
    
    if state.is_running {
        return Ok(());
    }
    
    let handle = thread::spawn(|| {
        if let Err(e) = run_clipboard_monitor() {
            eprintln!("剪贴板监听错误: {}", e);
        }
    });
    
    state.is_running = true;
    state.watcher_handle = Some(handle);
    
    Ok(())
}

/// 停止剪贴板监听
pub fn stop_clipboard_monitor() -> Result<(), String> {
    let mut state = MONITOR_STATE.lock();
    
    if !state.is_running {
        return Ok(());
    }
    
    state.is_running = false;
    
    // 等待监听线程结束
    if let Some(handle) = state.watcher_handle.take() {
        // 由于clipboard-rs的监听是阻塞的，我们需要给它一点时间自然退出
        drop(state); // 释放锁
        use std::time::Duration;
        thread::sleep(Duration::from_millis(100));
        
        // 尝试等待线程结束（超时后放弃）
        let _ = handle.join();
    }
    
    Ok(())
}

/// 检查监听器是否正在运行
pub fn is_monitor_running() -> bool {
    MONITOR_STATE.lock().is_running
}

/// 运行剪贴板监听循环（使用 clipboard-rs 的监听机制）
fn run_clipboard_monitor() -> Result<(), String> {
    // 创建监听管理器
    let manager = ClipboardMonitorManager::new()?;
    
    // 创建监听器
    let mut watcher = ClipboardWatcherContext::new()
        .map_err(|e| format!("创建剪贴板监听器失败: {}", e))?;
    
    // 添加处理器并开始监听（这是一个阻塞调用）
    let _ = watcher.add_handler(manager).start_watch();
    
    Ok(())
}

/// 处理剪贴板内容变化
fn handle_clipboard_change() -> Result<(), String> {
    let content = match ClipboardContent::capture()? {
        Some(content) => content,
        None => return Ok(()),
    };
    
    let content_hash = content.calculate_hash();
    
    // 检查是否与上次内容相同（去重）
    {
        let mut last_hash = LAST_CONTENT_HASH.lock();
        if let Some(ref last) = *last_hash {
            if last == &content_hash {
                return Ok(());
            }
        }
        *last_hash = Some(content_hash);
    }
    
    let processed = process_content(content)?;
    
    match store_clipboard_item(processed) {
        Ok(_id) => {
            if let Err(e) = emit_clipboard_updated() {
                eprintln!("发送剪贴板更新事件失败: {}", e);
            }
        }
        Err(e) if e.contains("重复内容") => {
            // 重复内容，忽略
        }
        Err(e) => {
            return Err(format!("存储剪贴板内容失败: {}", e));
        }
    }
    
    Ok(())
}

// 全局App Handle存储
static APP_HANDLE: Lazy<Arc<Mutex<Option<tauri::AppHandle>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(None))
});

/// 设置App Handle（在应用启动时调用）
pub fn set_app_handle(handle: tauri::AppHandle) {
    let mut app_handle = APP_HANDLE.lock();
    *app_handle = Some(handle);
}

/// 发送剪贴板更新事件到前端
fn emit_clipboard_updated() -> Result<(), String> {
    let app_handle = APP_HANDLE.lock();
    let handle = app_handle.as_ref()
        .ok_or("应用未初始化")?;
    
    use tauri::Emitter;
    handle.emit("clipboard-updated", ())
        .map_err(|e| format!("发送事件失败: {}", e))?;
    
    Ok(())
}

/// 预设哈希缓存
pub fn set_last_hash(text: &str) {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    
    let mut last_hash = LAST_CONTENT_HASH.lock();
    *last_hash = Some(hash);
}


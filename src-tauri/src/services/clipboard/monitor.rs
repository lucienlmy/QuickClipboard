use super::capture::ClipboardContent;
use super::processor::process_content;
use super::storage::store_clipboard_item;
use clipboard_rs::{
    ClipboardHandler, ClipboardWatcher, ClipboardWatcherContext,
};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use parking_lot::Mutex;
use once_cell::sync::Lazy;
use std::thread;

static IS_RUNNING: AtomicBool = AtomicBool::new(false);

static GENERATION: AtomicU64 = AtomicU64::new(0);

// 监听器状态
struct MonitorState {
    watcher_handle: Option<thread::JoinHandle<()>>,
    current_generation: u64,
}

static MONITOR_STATE: Lazy<Arc<Mutex<MonitorState>>> = Lazy::new(|| {
    Arc::new(Mutex::new(MonitorState {
        watcher_handle: None,
        current_generation: 0,
    }))
});

// 上一次捕获的内容哈希集合（用于去重）
static LAST_CONTENT_HASHES: Lazy<Arc<Mutex<Vec<String>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(Vec::new()))
});

// 清除上一次内容缓存（用于删除剪贴板项后允许重新添加相同内容）
pub fn clear_last_content_cache() {
    let mut last_hashes = LAST_CONTENT_HASHES.lock();
    last_hashes.clear();
}

// 剪贴板监听管理器
struct ClipboardMonitorManager {
    generation: u64,
}

impl ClipboardMonitorManager {
    pub fn new(generation: u64) -> Result<Self, String> {
        Ok(ClipboardMonitorManager { generation })
    }
}

impl ClipboardHandler for ClipboardMonitorManager {
    fn on_clipboard_change(&mut self) {
        if !IS_RUNNING.load(Ordering::Relaxed) {
            return;
        }
        
        if self.generation != GENERATION.load(Ordering::Relaxed) {
            return;
        }
        
        if let Err(e) = handle_clipboard_change() {
            if !e.contains("重复内容") {
                eprintln!("处理剪贴板内容失败: {}", e);
            }
        }
    }
}

pub fn start_clipboard_monitor() -> Result<(), String> {
    if IS_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Ok(());
    }
    
    // 启动剪贴板来源监控
    #[cfg(target_os = "windows")]
    crate::services::system::start_clipboard_source_monitor();
    
    let new_generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    
    let mut state = MONITOR_STATE.lock();
    state.current_generation = new_generation;
    state.watcher_handle = None;
    
    let handle = thread::spawn(move || {
        if let Err(e) = run_clipboard_monitor(new_generation) {
            eprintln!("剪贴板监听错误: {}", e);
        }
        IS_RUNNING.store(false, Ordering::SeqCst);
    });
    
    state.watcher_handle = Some(handle);
    Ok(())
}

pub fn stop_clipboard_monitor() -> Result<(), String> {
    if IS_RUNNING.swap(false, Ordering::SeqCst) {
        // 停止剪贴板来源监控
        #[cfg(target_os = "windows")]
        crate::services::system::stop_clipboard_source_monitor();
        
        let mut state = MONITOR_STATE.lock();
        state.watcher_handle = None;
    }
    Ok(())
}

pub fn is_monitor_running() -> bool {
    IS_RUNNING.load(Ordering::Relaxed)
}

fn run_clipboard_monitor(generation: u64) -> Result<(), String> {
    let manager = ClipboardMonitorManager::new(generation)?;
    let mut watcher = ClipboardWatcherContext::new()
        .map_err(|e| format!("创建剪贴板监听器失败: {}", e))?;
    let _ = watcher.add_handler(manager).start_watch();
    Ok(())
}

fn handle_clipboard_change() -> Result<(), String> {
    // 检查应用过滤
    let settings = crate::services::get_settings();
    if !crate::services::system::is_current_app_allowed(
        settings.app_filter_enabled,
        &settings.app_filter_mode,
        &settings.app_filter_list,
    ) {
        return Ok(());
    }
    
    let contents = ClipboardContent::capture()?;
    if contents.is_empty() {
        return Ok(());
    }
    
    // 计算所有内容的哈希
    let current_hashes: Vec<String> = contents.iter().map(|c| c.calculate_hash()).collect();
    
    // 检查是否与上次完全相同
    {
        let last_hashes = LAST_CONTENT_HASHES.lock();
        if *last_hashes == current_hashes {
            return Ok(());
        }
    }
    
    // 过滤出新内容
    let new_contents: Vec<_> = contents.into_iter()
        .filter(|c| {
            let hash = c.calculate_hash();
            let last_hashes = LAST_CONTENT_HASHES.lock();
            !last_hashes.contains(&hash)
        })
        .collect();
    
    {
        let mut last_hashes = LAST_CONTENT_HASHES.lock();
        *last_hashes = current_hashes;
    }
    
    if new_contents.is_empty() {
        return Ok(());
    }
    crate::AppSounds::play_copy_immediate();
    
    thread::spawn(move || {
        let mut any_stored = false;
        for content in new_contents {
            match process_content(content) {
                Ok(processed) => {
                    match store_clipboard_item(processed) {
                        Ok(_) => any_stored = true,
                        Err(e) if e.contains("重复内容") || e.contains("已禁止保存图片") => {}
                        Err(e) => eprintln!("存储剪贴板内容失败: {}", e),
                    }
                }
                Err(e) => eprintln!("处理剪贴板内容失败: {}", e),
            }
        }
        
        if any_stored {
            let _ = emit_clipboard_updated();
            crate::AppSounds::play_copy_on_success();
        }
    });
    
    Ok(())
}

static APP_HANDLE: Lazy<Arc<Mutex<Option<tauri::AppHandle>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(None))
});

pub fn set_app_handle(handle: tauri::AppHandle) {
    *APP_HANDLE.lock() = Some(handle);
}

pub fn get_app_handle() -> Option<tauri::AppHandle> {
    APP_HANDLE.lock().clone()
}

fn emit_clipboard_updated() -> Result<(), String> {
    let app_handle = APP_HANDLE.lock();
    let handle = app_handle.as_ref().ok_or("应用未初始化")?;
    
    if crate::services::low_memory::is_low_memory_mode() {
        let _ = crate::windows::tray::native_menu::update_native_menu(handle);
    }
    
    use tauri::Emitter;
    handle.emit("clipboard-updated", ()).map_err(|e| e.to_string())
}

// 预设哈希缓存（文本类型）
pub fn set_last_hash_text(text: &str) {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    
    let mut last_hashes = LAST_CONTENT_HASHES.lock();
    *last_hashes = vec![hash];
}

// 预设哈希缓存（文件类型）
pub fn set_last_hash_files(content: &str) {
    use sha2::{Sha256, Digest};
    
    if let Some(json_str) = content.strip_prefix("files:") {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
            let mut hasher = Sha256::new();
            
            if let Some(files) = json["files"].as_array() {
                for file in files {
                    if let Some(path) = file["path"].as_str() {
                        let normalized = crate::services::normalize_path_for_hash(path);
                        hasher.update(normalized.as_bytes());
                    }
                }
            }
            
            let hash = format!("{:x}", hasher.finalize());
            let mut last_hashes = LAST_CONTENT_HASHES.lock();
            *last_hashes = vec![hash];
        }
    }
}

// 预设哈希缓存（单文件路径）
pub fn set_last_hash_file(file_path: &str) {
    use sha2::{Sha256, Digest};
    
    let mut hasher = Sha256::new();
    let normalized = crate::services::normalize_path_for_hash(file_path);
    hasher.update(normalized.as_bytes());
    
    let hash = format!("{:x}", hasher.finalize());
    let mut last_hashes = LAST_CONTENT_HASHES.lock();
    *last_hashes = vec![hash];
}


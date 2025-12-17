use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WebviewWindow};

static LAST_FOCUS_HWND: Mutex<Option<isize>> = Mutex::new(None);
static LISTENER_RUNNING: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
static EXCLUDED_HWNDS: Mutex<Vec<isize>> = Mutex::new(Vec::new());

// 启动焦点变化监听器
pub fn start_focus_listener(app_handle: tauri::AppHandle) {
    #[cfg(windows)]
    {
        if LISTENER_RUNNING.swap(true, Ordering::SeqCst) {
            return;
        }
        
        let mut excluded = Vec::new();
        for label in ["main", "context-menu", "settings", "preview"] {
            if let Some(win) = app_handle.get_webview_window(label) {
                if let Ok(hwnd) = win.hwnd() {
                    excluded.push(hwnd.0 as isize);
                }
            }
        }
        *EXCLUDED_HWNDS.lock() = excluded;
        
        std::thread::spawn(|| {
            start_win_event_hook();
        });
    }
    
    #[cfg(not(windows))]
    {
        let _ = app_handle;
    }
}

// 停止焦点变化监听器
pub fn stop_focus_listener() {
    LISTENER_RUNNING.store(false, Ordering::SeqCst);
}

#[cfg(windows)]
pub fn add_excluded_hwnd(hwnd: isize) {
    let mut excluded = EXCLUDED_HWNDS.lock();
    if !excluded.contains(&hwnd) {
        excluded.push(hwnd);
    }
}

// 聚焦剪贴板窗口
pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
    window.set_focus().map_err(|e| format!("设置窗口焦点失败: {}", e))
}

// 仅保存当前焦点（手动）
pub fn save_current_focus(_app_handle: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

// 恢复上次焦点窗口
pub fn restore_last_focus() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
        use std::ffi::c_void;
        
        if let Some(hwnd_val) = *LAST_FOCUS_HWND.lock() {
            unsafe {
                let _ = SetForegroundWindow(HWND(hwnd_val as *mut c_void));
            }
        }
        Ok(())
    }
    
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

// 获取当前记录的焦点窗口句柄
pub fn get_last_focus_hwnd() -> Option<isize> {
    *LAST_FOCUS_HWND.lock()
}

#[cfg(windows)]
fn start_win_event_hook() {
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetMessageW, TranslateMessage, DispatchMessageW, MSG,
        EVENT_SYSTEM_FOREGROUND, WINEVENT_OUTOFCONTEXT,
    };
    
    unsafe {
        let hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(focus_callback),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        );
        
        if hook.0.is_null() {
            LISTENER_RUNNING.store(false, Ordering::SeqCst);
            return;
        }
        
        let mut msg = MSG::default();
        while LISTENER_RUNNING.load(Ordering::SeqCst) {
            if GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        
        let _ = UnhookWinEvent(hook);
    }
}

#[cfg(windows)]
unsafe extern "system" fn focus_callback(
    _hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK,
    _event: u32,
    _hwnd: windows::Win32::Foundation::HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetClassNameW, GetWindowTextW};

    let hwnd = GetForegroundWindow();
    if hwnd.0.is_null() {
        return;
    }
    
    let hwnd_val = hwnd.0 as isize;

    if EXCLUDED_HWNDS.lock().contains(&hwnd_val) {
        return;
    }
 
    let mut class_buf = [0u16; 256];
    let mut name_buf = [0u16; 256];
    let class_len = GetClassNameW(hwnd, &mut class_buf);
    let name_len = GetWindowTextW(hwnd, &mut name_buf);
    let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
    let name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
    
    // 过滤窗口
    if class_name == "Shell_TrayWnd" 
        || class_name == "Shell_SecondaryTrayWnd"
        || class_name == "NotifyIconOverflowWindow"
        || class_name == "TopLevelWindowForOverflowXamlIsland"
        || class_name == "tray_icon_app"
        || class_name.starts_with("Windows.UI.")
        || class_name == "#32768"
        || class_name == "DropDown"
        || class_name == "Xaml_WindowedPopupClass"
        || name == "快速剪贴板"
        || name == "菜单" {
        return;
    }
    
    *LAST_FOCUS_HWND.lock() = Some(hwnd_val);
}

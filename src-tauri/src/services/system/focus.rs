use parking_lot::Mutex;
use tauri::{Manager, WebviewWindow};

static LAST_FOCUS_HWND: Mutex<Option<usize>> = Mutex::new(None);

// 聚焦剪贴板窗口（保存当前焦点）
pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    save_current_focus_with_window(&window);
    
    // 设置窗口焦点
    window.set_focus()
        .map_err(|e| format!("设置窗口焦点失败: {}", e))
}

// 仅保存当前焦点（不切换焦点）
pub fn save_current_focus(app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Some(main_window) = app_handle.get_webview_window("main") {
            save_current_focus_with_window(&main_window);
        }
        Ok(())
    }
    
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

// 恢复上次焦点窗口
pub fn restore_last_focus() -> Result<(), String> {
    #[cfg(windows)]
    {
        restore_windows_focus();
        Ok(())
    }
    
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

#[cfg(windows)]
fn save_current_focus_with_window(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    use std::ffi::c_void;
    
    unsafe {
        let current_hwnd = GetForegroundWindow();
        
        // 获取剪贴板窗口句柄
        if let Ok(hwnd_raw) = window.hwnd() {
            let clipboard_hwnd = HWND(hwnd_raw.0 as *mut c_void);
            
            // 只有当前台窗口不是剪贴板窗口时，才记录
            if !current_hwnd.0.is_null() && current_hwnd.0 != clipboard_hwnd.0 {
                *LAST_FOCUS_HWND.lock() = Some(current_hwnd.0 as usize);
            }
        }
    }
}

#[cfg(windows)]
fn restore_windows_focus() {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    use std::ffi::c_void;
    
    let last_hwnd = LAST_FOCUS_HWND.lock();
    unsafe {
        if let Some(hwnd_val) = *last_hwnd {
            let hwnd = HWND(hwnd_val as *mut c_void);
            let _ = SetForegroundWindow(hwnd);
        }
    }
}


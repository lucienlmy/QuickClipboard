use parking_lot::Mutex;
use tauri::WebviewWindow;

static LAST_FOCUS_HWND: Mutex<Option<isize>> = Mutex::new(None);

/// 聚焦剪贴板窗口（保存当前焦点）
pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    save_current_focus(&window);
    
    // 设置窗口焦点
    window.set_focus()
        .map_err(|e| format!("设置窗口焦点失败: {}", e))
}

/// 恢复上次焦点窗口
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
fn save_current_focus(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    
    unsafe {
        let current_hwnd = GetForegroundWindow();
        
        // 获取剪贴板窗口句柄
        if let Ok(hwnd_raw) = window.hwnd() {
            let clipboard_hwnd = HWND(hwnd_raw.0 as usize as isize);
            
            // 只有当前台窗口不是剪贴板窗口时，才记录
            if current_hwnd.0 != 0 && current_hwnd.0 != clipboard_hwnd.0 {
                *LAST_FOCUS_HWND.lock() = Some(current_hwnd.0);
            }
        }
    }
}

#[cfg(windows)]
fn restore_windows_focus() {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    
    let mut last_hwnd = LAST_FOCUS_HWND.lock();
    unsafe {
        if let Some(hwnd_val) = *last_hwnd {
            let hwnd = HWND(hwnd_val);
            let _ = SetForegroundWindow(hwnd);
            *last_hwnd = None;
        }
    }
}


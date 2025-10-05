// 窗口相关工具函数

/// 检测当前活动窗口是否为文件管理器
#[cfg(windows)]
pub fn is_target_file_manager() -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == HWND(0) {
            return false;
        }

        // 获取窗口标题
        let mut window_title = [0u16; 256];
        let title_len = GetWindowTextW(hwnd, &mut window_title);
        if title_len > 0 {
            let title = String::from_utf16_lossy(&window_title[..title_len as usize]);

            // 通过窗口标题判断是否为文件管理器
            let title_lower = title.to_lowercase();
            let is_file_manager_by_title = title_lower.contains("文件资源管理器")
                || title_lower.contains("file explorer")
                || title_lower.contains("total commander")
                || title_lower.contains("freecommander")
                || title_lower.contains("directory opus")
                || title_lower.contains("q-dir")
                || title_lower.ends_with(" - 文件夹")
                || title_lower.ends_with(" - folder");

            return is_file_manager_by_title;
        }
    }

    false
}

/// 获取当前活动窗口的进程可执行名（小写）
#[cfg(windows)]
pub fn get_active_window_process_name() -> Option<String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == HWND(0) {
            return None;
        }

        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        if process_id == 0 {
            return None;
        }

        if let Ok(process_handle) = OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            false,
            process_id,
        ) {
            let mut buffer = [0u16; 260];
            let len = GetModuleFileNameExW(process_handle, None, &mut buffer);
            if len > 0 {
                if let Some(name) = String::from_utf16_lossy(&buffer[..len as usize])
                    .rsplit('\\')
                    .next()
                {
                    return Some(name.to_lowercase());
                }
            }
        }
    }

    None
}

#[cfg(not(windows))]
pub fn get_active_window_process_name() -> Option<String> {
    None
}

#[cfg(not(windows))]
pub fn is_target_file_manager() -> bool {
    // 非Windows系统暂时返回false，不延迟
    false
}

use serde::{Deserialize, Serialize};
use active_win_pos_rs::get_active_window;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub process: String,
    pub path: String,
    pub icon: Option<String>,
}

// 获取所有可见窗口的信息
#[cfg(target_os = "windows")]
pub fn get_all_windows_info() -> Vec<AppInfo> {
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
    use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
    use windows::core::BOOL;

    let mut windows: Vec<AppInfo> = Vec::new();

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let windows_ptr = lparam.0 as *mut Vec<AppInfo>;
        let windows = &mut *windows_ptr;

        if IsWindowVisible(hwnd).as_bool() {
            let mut process_id: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));

            if process_id > 0 {
                let mut title_buffer = [0u16; 512];
                let title_len = GetWindowTextW(hwnd, &mut title_buffer);
                let window_title = if title_len > 0 {
                    String::from_utf16_lossy(&title_buffer[..title_len as usize])
                } else {
                    return BOOL(1);
                };

                if window_title.trim().is_empty() || window_title == "Program Manager" {
                    return BOOL(1);
                }

                if let Ok(process_handle) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, process_id) {
                    let mut buffer = [0u16; 260];
                    let len = GetModuleFileNameExW(Some(process_handle), None, &mut buffer);
                    let full_path = if len > 0 {
                        String::from_utf16_lossy(&buffer[..len as usize])
                    } else {
                        String::from("unknown")
                    };

                    let process_filename = full_path.split('\\').last().unwrap_or(&full_path).to_string();

                    windows.push(AppInfo {
                        name: window_title,
                        process: process_filename,
                        path: full_path.clone(),
                        icon: crate::utils::icon::get_file_icon_base64(&full_path),
                    });
                }
            }
        }
        BOOL(1)
    }

    unsafe {
        let _ = EnumWindows(Some(enum_windows_proc), LPARAM(&mut windows as *mut _ as isize));
    }

    windows.sort_by(|a: &AppInfo, b: &AppInfo| a.process.cmp(&b.process));
    windows.dedup_by(|a: &mut AppInfo, b: &mut AppInfo| a.process == b.process && a.name == b.name);
    windows
}

#[cfg(not(target_os = "windows"))]
pub fn get_all_windows_info() -> Vec<AppInfo> {
    Vec::new()
}

// 检查当前应用是否在允许列表中
pub fn is_current_app_allowed(
    app_filter_enabled: bool,
    app_filter_mode: &str,
    app_filter_list: &[String],
) -> bool {
    if !app_filter_enabled {
        return true;
    }

    match get_active_window() {
        Ok(active_window) => {
            let window_title = active_window.title;
            let process_path_str = active_window.process_path.to_string_lossy().to_string();
            let process_name = active_window.process_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let matches_filter = app_filter_list.iter().any(|filter| {
                let filter_lower = filter.to_lowercase();
                process_name.to_lowercase().contains(&filter_lower)
                    || window_title.to_lowercase().contains(&filter_lower)
                    || process_path_str.to_lowercase().contains(&filter_lower)
            });

            match app_filter_mode {
                "whitelist" => matches_filter,
                "blacklist" => !matches_filter,
                _ => true,
            }
        }
        Err(_) => true,
    }
}

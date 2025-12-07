// 检查当前是否以管理员权限运行
#[cfg(windows)]
pub fn is_running_as_admin() -> bool {
    use ::windows::Win32::Foundation::HANDLE;
    use ::windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use ::windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token_handle: HANDLE = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token_handle).is_err() {
            return false;
        }

        let mut elevation = TOKEN_ELEVATION::default();
        let mut return_length: u32 = 0;

        let result = GetTokenInformation(
            token_handle,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut return_length,
        );

        let _ = ::windows::Win32::Foundation::CloseHandle(token_handle);

        if result.is_ok() {
            return elevation.TokenIsElevated != 0;
        }
    }
    false
}

#[cfg(not(windows))]
pub fn is_running_as_admin() -> bool {
    false
}

// 尝试以管理员权限重启程序
#[cfg(windows)]
pub fn try_elevate_and_restart() -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use ::windows::Win32::UI::Shell::ShellExecuteW;
    use ::windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use ::windows::core::PCWSTR;

    if let Ok(exe_path) = std::env::current_exe() {
        let operation: Vec<u16> = OsStr::new("runas")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let file: Vec<u16> = exe_path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let result = ShellExecuteW(
                None,
                PCWSTR(operation.as_ptr()),
                PCWSTR(file.as_ptr()),
                PCWSTR(std::ptr::null()),
                PCWSTR(std::ptr::null()),
                SW_SHOWNORMAL,
            );

            return result.0 as usize > 32;
        }
    }
    false
}

#[cfg(not(windows))]
pub fn try_elevate_and_restart() -> bool {
    false
}

const TASK_NAME: &str = "QuickClipboardAdmin";

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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


// 检查计划任务是否存在
#[cfg(windows)]
pub fn is_scheduled_task_exists() -> bool {
    use std::process::Command;
    
    let output = Command::new("schtasks")
        .args(["/Query", "/TN", TASK_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    matches!(output, Ok(o) if o.status.success())
}

#[cfg(not(windows))]
pub fn is_scheduled_task_exists() -> bool {
    false
}

// 检查计划任务的路径是否与当前程序路径匹配
#[cfg(windows)]
pub fn is_scheduled_task_path_valid() -> bool {
    use std::process::Command;
    
    let current_exe = match std::env::current_exe() {
        Ok(p) => p.to_string_lossy().to_lowercase(),
        Err(_) => return false,
    };

    let output = Command::new("schtasks")
        .args(["/Query", "/TN", TASK_NAME, "/FO", "LIST", "/V"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    if let Ok(o) = output {
        if o.status.success() {
            let stdout = String::from_utf8_lossy(&o.stdout).to_lowercase();
            return stdout.contains(&current_exe);
        }
    }
    false
}

#[cfg(not(windows))]
pub fn is_scheduled_task_path_valid() -> bool {
    false
}

// 创建计划任务
#[cfg(windows)]
pub fn create_scheduled_task() -> Result<(), String> {
    use std::process::Command;
    
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("获取程序路径失败: {}", e))?;
    
    let exe_path_str = exe_path.to_string_lossy();
    
    // 先删除可能存在的旧任务
    let _ = Command::new("schtasks")
        .args(["/Delete", "/TN", TASK_NAME, "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    // 创建新任务，使用最高权限运行
    let output = Command::new("schtasks")
        .args([
            "/Create",
            "/TN", TASK_NAME,
            "/TR", &format!("\"{}\"", exe_path_str),
            "/SC", "ONCE",
            "/ST", "00:00",
            "/RL", "HIGHEST",
            "/F",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("执行 schtasks 失败: {}", e))?;
    
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("创建计划任务失败: {}", stderr))
    }
}

#[cfg(not(windows))]
pub fn create_scheduled_task() -> Result<(), String> {
    Err("仅支持 Windows".to_string())
}


// 删除计划任务
#[cfg(windows)]
pub fn delete_scheduled_task() -> Result<(), String> {
    use std::process::Command;
    
    let _ = Command::new("schtasks")
        .args(["/Delete", "/TN", TASK_NAME, "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    Ok(())
}

#[cfg(not(windows))]
pub fn delete_scheduled_task() -> Result<(), String> {
    Ok(())
}

// 通过计划任务启动程序
#[cfg(windows)]
pub fn run_via_scheduled_task() -> bool {
    use std::process::Command;
    
    let output = Command::new("schtasks")
        .args(["/Run", "/TN", TASK_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    matches!(output, Ok(o) if o.status.success())
}

#[cfg(not(windows))]
pub fn run_via_scheduled_task() -> bool {
    false
}

// 尝试以管理员权限重启程序（优先使用计划任务）
#[cfg(windows)]
pub fn try_elevate_and_restart() -> bool {
    if is_scheduled_task_exists() && is_scheduled_task_path_valid() && run_via_scheduled_task() {
        return true;
    }
    
    try_elevate_with_uac()
}

#[cfg(not(windows))]
pub fn try_elevate_and_restart() -> bool {
    false
}

// 使用 UAC 提权重启
#[cfg(windows)]
pub fn try_elevate_with_uac() -> bool {
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
pub fn try_elevate_with_uac() -> bool {
    false
}

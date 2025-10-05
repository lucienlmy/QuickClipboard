#[cfg(windows)]
use windows::{
    core::PWSTR,
    Win32::{
        Foundation::HANDLE,
        Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY},
        System::Threading::{GetCurrentProcess, OpenProcessToken},
        UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    },
};

/// 检查当前进程是否以管理员权限运行
#[cfg(windows)]
pub fn is_running_as_admin() -> bool {
    unsafe {
        let mut token: HANDLE = HANDLE::default();
        let process = GetCurrentProcess();

        // 获取进程令牌
        if OpenProcessToken(process, TOKEN_QUERY, &mut token).is_err() {
            return false;
        }

        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut return_length = 0u32;

        // 查询令牌提升信息
        let result = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut return_length,
        );

        if result.is_ok() {
            elevation.TokenIsElevated != 0
        } else {
            false
        }
    }
}

/// 非Windows平台总是返回false
#[cfg(not(windows))]
pub fn is_running_as_admin() -> bool {
    false
}

/// 以管理员权限重启应用程序
#[cfg(windows)]
pub fn restart_as_admin() -> Result<(), String> {
    let current_exe =
        std::env::current_exe().map_err(|e| format!("获取当前程序路径失败: {}", e))?;

    let exe_path = current_exe.to_string_lossy();
    let exe_path_wide: Vec<u16> = exe_path.encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        let result = ShellExecuteW(
            None,
            PWSTR::from_raw(
                "runas\0"
                    .encode_utf16()
                    .chain(std::iter::once(0))
                    .collect::<Vec<u16>>()
                    .as_mut_ptr(),
            ),
            PWSTR::from_raw(exe_path_wide.as_ptr() as *mut u16),
            None,
            None,
            SW_SHOWNORMAL,
        );

        // ShellExecuteW 返回值大于32表示成功
        if result.0 > 32 {
            // 成功启动管理员进程，退出当前进程
            std::process::exit(0);
        } else {
            Err(format!("启动管理员进程失败，错误代码: {}", result.0))
        }
    }
}

/// 非Windows平台的占位实现
#[cfg(not(windows))]
pub fn restart_as_admin() -> Result<(), String> {
    Err("管理员权限功能仅在Windows平台可用".to_string())
}

/// 用来检测是否有管理员权限的应用程序在运行
#[cfg(windows)]
pub fn check_admin_required_for_hooks() -> bool {
    true
}

/// 非Windows平台总是返回false
#[cfg(not(windows))]
pub fn check_admin_required_for_hooks() -> bool {
    false
}

/// 获取管理员权限状态信息
pub fn get_admin_status() -> AdminStatus {
    AdminStatus {
        is_admin: is_running_as_admin(),
        can_elevate: cfg!(windows),
        admin_required_for_hooks: check_admin_required_for_hooks(),
    }
}

/// 管理员权限状态结构
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AdminStatus {
    /// 当前是否以管理员权限运行
    pub is_admin: bool,
    /// 是否可以提升权限（仅Windows支持）
    pub can_elevate: bool,
    /// 是否需要管理员权限来使用全局快捷键
    pub admin_required_for_hooks: bool,
}

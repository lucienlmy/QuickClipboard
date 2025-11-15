// Windows 注册表管理，用于禁用/启用系统 Win+V 快捷键

#[cfg(windows)]
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
    HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ,
};

#[cfg(windows)]
const EXPLORER_ADVANCED_PATH: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced";
#[cfg(windows)]
const DISABLED_HOTKEYS_VALUE: &str = "DisabledHotkeys";

#[cfg(windows)]
pub fn disable_win_v_hotkey() -> Result<(), String> {
    add_disabled_hotkey('V', true)
}

#[cfg(windows)]
pub fn disable_win_v_hotkey_silent() -> Result<(), String> {
    add_disabled_hotkey('V', false)
}

#[cfg(windows)]
pub fn enable_win_v_hotkey() -> Result<(), String> {
    remove_disabled_hotkey('V', true)
}

#[cfg(windows)]
pub fn enable_win_v_hotkey_silent() -> Result<(), String> {
    remove_disabled_hotkey('V', false)
}

#[cfg(windows)]
fn add_disabled_hotkey(key: char, restart_explorer: bool) -> Result<(), String> {
    unsafe {
        let path: Vec<u16> = EXPLORER_ADVANCED_PATH
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let value_name: Vec<u16> = DISABLED_HOTKEYS_VALUE
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let mut hkey: HKEY = HKEY::default();

        let result = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(path.as_ptr()),
            None,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_READ | KEY_WRITE,
            None,
            &mut hkey,
            None,
        );

        if result.is_err() {
            return Err(format!("无法打开注册表项: {:?}", result));
        }

        let current_value = read_disabled_hotkeys_value(hkey);

        let key_upper = key.to_uppercase().to_string();
        let new_value = if current_value.contains(&key_upper) {
            current_value
        } else {
            format!("{}{}", current_value, key_upper)
        };

        let data: Vec<u16> = new_value
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let set_result = RegSetValueExW(
            hkey,
            windows::core::PCWSTR(value_name.as_ptr()),
            None,
            REG_SZ,
            Some(std::slice::from_raw_parts(
                data.as_ptr() as *const u8,
                data.len() * 2,
            )),
        );

        let _ = RegCloseKey(hkey);

        if set_result.is_err() {
            return Err(format!("无法设置注册表值: {:?}", set_result));
        }

        if restart_explorer {
            restart_explorer_process()?;
        }

        Ok(())
    }
}

#[cfg(windows)]
fn remove_disabled_hotkey(key: char, restart_explorer: bool) -> Result<(), String> {
    unsafe {
        let path: Vec<u16> = EXPLORER_ADVANCED_PATH
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let value_name: Vec<u16> = DISABLED_HOTKEYS_VALUE
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let mut hkey: HKEY = HKEY::default();

        let result = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(path.as_ptr()),
            None,
            KEY_READ | KEY_WRITE,
            &mut hkey,
        );

        if result.is_err() {
            return Ok(());
        }

        let current_value = read_disabled_hotkeys_value(hkey);

        let key_upper = key.to_uppercase().to_string();
        let new_value = current_value.replace(&key_upper, "");

        if new_value.is_empty() {
            let delete_result = RegDeleteValueW(
                hkey,
                windows::core::PCWSTR(value_name.as_ptr()),
            );
            let _ = RegCloseKey(hkey);

            if delete_result.is_err() {
                return Err(format!("无法删除注册表值: {:?}", delete_result));
            }
        } else {
            let data: Vec<u16> = new_value
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();

            let set_result = RegSetValueExW(
                hkey,
                windows::core::PCWSTR(value_name.as_ptr()),
                None,
                REG_SZ,
                Some(std::slice::from_raw_parts(
                    data.as_ptr() as *const u8,
                    data.len() * 2,
                )),
            );

            let _ = RegCloseKey(hkey);

            if set_result.is_err() {
                return Err(format!("无法更新注册表值: {:?}", set_result));
            }
        }

        if restart_explorer {
            restart_explorer_process()?;
        }

        Ok(())
    }
}

#[cfg(windows)]
unsafe fn read_disabled_hotkeys_value(hkey: HKEY) -> String {
    let value_name: Vec<u16> = DISABLED_HOTKEYS_VALUE
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    let mut buffer: Vec<u16> = vec![0; 256];
    let mut buffer_size: u32 = (buffer.len() * 2) as u32;

    let result = RegQueryValueExW(
        hkey,
        windows::core::PCWSTR(value_name.as_ptr()),
        None,
        None,
        Some(buffer.as_mut_ptr() as *mut u8),
        Some(&mut buffer_size),
    );

    if result.is_ok() && buffer_size > 0 {
        let len = (buffer_size as usize / 2).saturating_sub(1);
        String::from_utf16_lossy(&buffer[..len])
    } else {
        String::new()
    }
}

#[cfg(windows)]
fn restart_explorer_process() -> Result<(), String> {
    use std::process::Command;

    let kill_result = Command::new("taskkill")
        .args(&["/F", "/IM", "explorer.exe"])
        .output();

    if let Err(e) = kill_result {
        return Err(format!("无法结束Explorer进程: {}", e));
    }

    std::thread::sleep(std::time::Duration::from_millis(1000));

    let start_result = Command::new("cmd")
        .args(&["/C", "start", "explorer.exe"])
        .spawn();

    if let Err(e) = start_result {
        let fallback_result = Command::new("explorer.exe").spawn();
        if let Err(e2) = fallback_result {
            return Err(format!("无法启动Explorer进程: {} / {}", e, e2));
        }
    }

    std::thread::sleep(std::time::Duration::from_millis(1000));

    Ok(())
}

#[cfg(windows)]
pub fn is_win_v_hotkey_disabled() -> bool {
    is_hotkey_disabled('V')
}

#[cfg(windows)]
fn is_hotkey_disabled(key: char) -> bool {
    unsafe {
        let path: Vec<u16> = EXPLORER_ADVANCED_PATH
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        let mut hkey: HKEY = HKEY::default();

        let result = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(path.as_ptr()),
            None,
            KEY_READ,
            &mut hkey,
        );

        if result.is_err() {
            return false;
        }

        let current_value = read_disabled_hotkeys_value(hkey);
        let _ = RegCloseKey(hkey);

        let key_upper = key.to_uppercase().to_string();
        current_value.contains(&key_upper)
    }
}

#[cfg(not(windows))]
pub fn disable_win_v_hotkey() -> Result<(), String> { Ok(()) }
#[cfg(not(windows))]
pub fn disable_win_v_hotkey_silent() -> Result<(), String> { Ok(()) }
#[cfg(not(windows))]
pub fn enable_win_v_hotkey() -> Result<(), String> { Ok(()) }
#[cfg(not(windows))]
pub fn enable_win_v_hotkey_silent() -> Result<(), String> { Ok(()) }
#[cfg(not(windows))]
pub fn is_win_v_hotkey_disabled() -> bool { false }

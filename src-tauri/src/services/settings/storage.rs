use super::model::AppSettings;
use std::{env, fs, path::PathBuf};

pub struct SettingsStorage;

impl SettingsStorage {
    fn is_portable_mode() -> bool {
        if crate::services::is_portable_build() {
            return true;
        }
        env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.join("portable.flag").exists() || p.join("portable.txt").exists()))
            .unwrap_or(false)
    }

    fn get_data_dir() -> Result<PathBuf, String> {
        if Self::is_portable_mode() {
            let exe_dir = env::current_exe()
                .map_err(|e| e.to_string())?
                .parent()
                .ok_or("无法获取执行目录")?
                .to_path_buf();
            return Ok(exe_dir.join("data"));
        }

        Ok(dirs::data_local_dir()
            .ok_or("无法获取数据目录")?
            .join("quickclipboard"))
    }

    pub fn get_settings_path() -> Result<PathBuf, String> {
        let dir = Self::get_data_dir()?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir.join("settings.json"))
    }

    pub fn load() -> Result<AppSettings, String> {
        let path = Self::get_settings_path()?;
        
        if !path.exists() {
            return Ok(AppSettings::default());
        }

        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    }

    pub fn exists() -> Result<bool, String> {
        let path = Self::get_settings_path()?;
        Ok(path.exists())
    }

    pub fn save(settings: &AppSettings) -> Result<(), String> {
        let path = Self::get_settings_path()?;
        let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())
    }

    pub fn get_data_directory(settings: &AppSettings) -> Result<PathBuf, String> {
        if settings.use_custom_storage {
            if let Some(ref path) = settings.custom_storage_path {
                let custom_dir = PathBuf::from(path);
                fs::create_dir_all(&custom_dir).map_err(|e| e.to_string())?;
                return Ok(custom_dir);
            }
        }
        
        let dir = Self::get_data_dir()?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }
}

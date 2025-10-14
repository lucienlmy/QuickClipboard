use super::model::AppSettings;
use dirs;
use std::fs;
use std::path::PathBuf;
use std::env;

/// 设置文件存储管理
pub struct SettingsStorage;

impl SettingsStorage {
    /// 检测是否是便携版模式
    pub fn is_portable_mode() -> bool {
        if let Ok(exe_path) = env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let portable_marker = exe_dir.join("portable.txt");
                return portable_marker.exists();
            }
        }
        false
    }

    /// 获取便携版数据目录
    fn get_portable_data_directory() -> Result<PathBuf, String> {
        let exe_path = env::current_exe()
            .map_err(|e| format!("无法获取可执行文件路径: {}", e))?;
        
        let exe_dir = exe_path.parent()
            .ok_or_else(|| "无法获取可执行文件所在目录".to_string())?;
        
        let portable_data_dir = exe_dir.join("data");
        
        fs::create_dir_all(&portable_data_dir)
            .map_err(|e| format!("创建便携版数据目录失败: {}", e))?;
        
        Ok(portable_data_dir)
    }

    /// 获取默认的应用数据目录
    pub fn get_default_data_directory() -> Result<PathBuf, String> {
        // 检测便携版模式
        if Self::is_portable_mode() {
            return Self::get_portable_data_directory();
        }

        // 正常模式：使用系统数据目录
        let app_data_dir = dirs::data_local_dir()
            .ok_or_else(|| "无法获取本地数据目录".to_string())?
            .join("quickclipboard");

        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
        
        Ok(app_data_dir)
    }

    /// 获取设置文件路径（总是在默认位置）
    fn get_settings_file_path() -> Result<PathBuf, String> {
        let config_dir = Self::get_default_data_directory()?;
        Ok(config_dir.join("settings.json"))
    }

    /// 根据设置获取数据存储目录
    pub fn get_data_directory(settings: &AppSettings) -> Result<PathBuf, String> {
        if settings.use_custom_storage {
            if let Some(custom_path) = &settings.custom_storage_path {
                let path = PathBuf::from(custom_path);
                fs::create_dir_all(&path)
                    .map_err(|e| format!("创建自定义存储目录失败: {}", e))?;
                return Ok(path);
            }
        }
        Self::get_default_data_directory()
    }

    /// 从文件加载设置
    pub fn load() -> Result<AppSettings, String> {
        let settings_path = Self::get_settings_file_path()?;

        if !settings_path.exists() {
            return Err("设置文件不存在".to_string());
        }

        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("读取设置文件失败: {}", e))?;

        let settings: AppSettings = serde_json::from_str(&content)
            .map_err(|e| format!("解析设置文件失败: {}", e))?;

        Ok(settings)
    }

    /// 保存设置到文件
    pub fn save(settings: &AppSettings) -> Result<(), String> {
        let settings_path = Self::get_settings_file_path()?;

        let content = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("序列化设置失败: {}", e))?;

        fs::write(&settings_path, content)
            .map_err(|e| format!("写入设置文件失败: {}", e))?;

        Ok(())
    }

    /// 加载设置，如果失败则返回默认设置并保存
    pub fn load_or_default() -> AppSettings {
        match Self::load() {
            Ok(settings) => settings,
            Err(_) => {
                let default_settings = AppSettings::default();
                let _ = Self::save(&default_settings);
                default_settings
            }
        }
    }

    /// 打开存储文件夹
    pub fn open_folder(settings: &AppSettings) -> Result<(), String> {
        let storage_path = Self::get_data_directory(settings)?;
        
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(storage_path)
                .spawn()
                .map_err(|e| format!("打开文件夹失败: {}", e))?;
        }
        
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(storage_path)
                .spawn()
                .map_err(|e| format!("打开文件夹失败: {}", e))?;
        }
        
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(storage_path)
                .spawn()
                .map_err(|e| format!("打开文件夹失败: {}", e))?;
        }
        
        Ok(())
    }
}

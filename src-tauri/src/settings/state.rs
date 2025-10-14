use super::model::AppSettings;
use super::storage::SettingsStorage;
use once_cell::sync::Lazy;
use std::sync::{Arc, Mutex};

/// 全局设置状态管理
static GLOBAL_SETTINGS: Lazy<Arc<Mutex<AppSettings>>> =
    Lazy::new(|| Arc::new(Mutex::new(SettingsStorage::load_or_default())));

/// 获取全局设置
pub fn get_global_settings() -> AppSettings {
    GLOBAL_SETTINGS.lock().unwrap().clone()
}

/// 更新全局设置
pub fn update_global_settings(settings: AppSettings) -> Result<(), String> {
    {
        let mut global_settings = GLOBAL_SETTINGS.lock().unwrap();
        *global_settings = settings.clone();
    }

    SettingsStorage::save(&settings)?;

    Ok(())
}

/// 从JSON更新全局设置
pub(super) fn update_global_settings_from_json(json: &serde_json::Value) -> Result<(), String> {
    let mut settings = get_global_settings();
    super::converter::SettingsConverter::update_from_json(&mut settings, json);
    update_global_settings(settings)
}

/// 获取当前数据存储目录（全局函数）
pub fn get_data_directory() -> Result<std::path::PathBuf, String> {
    let settings = get_global_settings();
    SettingsStorage::get_data_directory(&settings)
}

/// 保存窗口位置
pub fn save_window_position(x: i32, y: i32) -> Result<(), String> {
    let mut settings = get_global_settings();
    settings.saved_window_position = Some((x, y));
    update_global_settings(settings)
}

/// 保存窗口大小
pub fn save_window_size(width: u32, height: u32) -> Result<(), String> {
    let mut settings = get_global_settings();
    settings.saved_window_size = Some((width, height));
    update_global_settings(settings)
}

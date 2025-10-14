use super::model::{AppSettings, StorageInfo};
use super::storage::SettingsStorage;
use std::path::PathBuf;
use std::fs;

/// 数据迁移管理
pub struct SettingsMigration;

impl SettingsMigration {
    /// 设置自定义存储路径并迁移数据
    pub async fn set_custom_storage_path(
        settings: &mut AppSettings,
        new_path: String,
        app: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        let new_dir = PathBuf::from(&new_path);

        // 验证新路径
        if !new_dir.exists() {
            fs::create_dir_all(&new_dir)
                .map_err(|e| format!("创建新存储目录失败: {}", e))?;
        }

        if !new_dir.is_dir() {
            return Err("指定的路径不是有效的目录".to_string());
        }

        // 获取当前存储目录
        let current_dir = SettingsStorage::get_data_directory(settings)?;

        if current_dir == new_dir {
            return Ok(());
        }

        // 执行数据迁移
        crate::data_migration::DataMigrationService::migrate_data(
            &current_dir,
            &new_dir,
            None,
        )
        .await?;

        // 更新设置
        settings.custom_storage_path = Some(new_path);
        settings.use_custom_storage = true;

        // 重新初始化数据库
        crate::database::reinitialize_database()
            .map_err(|e| format!("重新初始化数据库失败: {}", e))?;

        // 刷新窗口
        if let Some(app_handle) = app {
            if let Err(e) = crate::commands::refresh_all_windows(app_handle) {
                println!("刷新窗口失败: {}", e);
            }
        }

        Ok(())
    }

    /// 重置为默认存储位置
    pub async fn reset_to_default_storage(
        settings: &mut AppSettings,
        app: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        let default_dir = SettingsStorage::get_default_data_directory()?;
        let current_dir = SettingsStorage::get_data_directory(settings)?;

        if current_dir == default_dir {
            return Ok(());
        }

        // 执行数据迁移
        crate::data_migration::DataMigrationService::migrate_data(
            &current_dir,
            &default_dir,
            None,
        )
        .await?;

        // 更新设置
        settings.custom_storage_path = None;
        settings.use_custom_storage = false;

        // 重新初始化数据库
        crate::database::reinitialize_database()
            .map_err(|e| format!("重新初始化数据库失败: {}", e))?;

        // 刷新窗口
        if let Some(app_handle) = app {
            if let Err(e) = crate::commands::refresh_all_windows(app_handle) {
                println!("刷新窗口失败: {}", e);
            }
        }

        Ok(())
    }

    /// 获取存储信息
    pub fn get_storage_info(settings: &AppSettings) -> Result<StorageInfo, String> {
        let current_dir = SettingsStorage::get_data_directory(settings)?;
        let default_dir = SettingsStorage::get_default_data_directory()?;
        let is_portable = SettingsStorage::is_portable_mode();
        
        // 获取便携版路径
        let portable_path = if is_portable {
            if let Ok(exe_path) = std::env::current_exe() {
                if let Some(exe_dir) = exe_path.parent() {
                    Some(exe_dir.join("data").to_string_lossy().to_string())
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        Ok(StorageInfo {
            current_path: current_dir.to_string_lossy().to_string(),
            default_path: default_dir.to_string_lossy().to_string(),
            is_default: !settings.use_custom_storage,
            custom_path: settings.custom_storage_path.clone(),
            is_portable,
            portable_path,
        })
    }
}

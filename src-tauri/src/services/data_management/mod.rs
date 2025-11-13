use std::{fs, path::{Path, PathBuf}};

use crate::services::{get_data_directory, get_settings, update_settings};
use crate::services::settings::storage::SettingsStorage;
use crate::services::database::{init_database};
use crate::services::database::connection::close_database;

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    if !dst.exists() {
        fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    Ok(())
}

fn safe_move_item(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() {
        return Ok(());
    }
    // rename（同盘快速）
    if fs::rename(src, dst).is_err() {
        // 不同磁盘则采用复制+删除
        if src.is_dir() {
            copy_dir_all(src, dst)?;
            fs::remove_dir_all(src).map_err(|e| format!("删除源目录失败: {}", e))?;
        } else {
            // 确保父目录存在
            if let Some(parent) = dst.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
            fs::copy(src, dst).map_err(|e| format!("复制文件失败: {}", e))?;
            fs::remove_file(src).map_err(|e| format!("删除源文件失败: {}", e))?;
        }
    }
    Ok(())
}

fn get_default_data_dir() -> Result<PathBuf, String> {
    let settings_path = SettingsStorage::get_settings_path()?;
    settings_path.parent().map(|p| p.to_path_buf()).ok_or("无法获取默认数据目录".to_string())
}

pub fn get_current_storage_dir() -> Result<PathBuf, String> {
    get_data_directory()
}

pub fn change_storage_dir(new_dir: PathBuf) -> Result<PathBuf, String> {
    let new_dir = new_dir;
    if !new_dir.exists() { fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?; }

    let current_dir = get_current_storage_dir()?;
    if new_dir == current_dir {
        return Err("新位置与当前存储位置相同，无需迁移".to_string());
    }

    // 关闭数据库连接
    close_database();

    // 要迁移的目录和文件
    let src_images = current_dir.join("clipboard_images");
    let dst_images = new_dir.join("clipboard_images");
    let db_names = ["quickclipboard.db", "quickclipboard.db-shm", "quickclipboard.db-wal"]; 

    // 迁移图片目录
    if src_images.exists() {
        if dst_images.exists() {
            copy_dir_all(&src_images, &dst_images)?;
            fs::remove_dir_all(&src_images).map_err(|e| format!("删除源图片目录失败: {}", e))?;
        } else {
            safe_move_item(&src_images, &dst_images)?;
        }
    }

    for name in db_names { 
        let src = current_dir.join(name);
        let dst = new_dir.join(name);
        if src.exists() { safe_move_item(&src, &dst)?; }
    }

    let mut settings = get_settings();
    settings.use_custom_storage = true;
    settings.custom_storage_path = Some(new_dir.to_string_lossy().to_string());
    update_settings(settings.clone())?;

    let db_path = new_dir.join("quickclipboard.db");
    init_database(db_path.to_str().ok_or("数据库路径无效")?)?;

    Ok(new_dir)
}

pub fn reset_storage_dir_to_default() -> Result<PathBuf, String> {
    let default_dir = get_default_data_dir()?;
    let current_dir = get_current_storage_dir()?;

    if current_dir != default_dir {
        close_database();

        let src_images = current_dir.join("clipboard_images");
        let dst_images = default_dir.join("clipboard_images");
        let db_names = ["quickclipboard.db", "quickclipboard.db-shm", "quickclipboard.db-wal"]; 

        if src_images.exists() {
            if dst_images.exists() {
                copy_dir_all(&src_images, &dst_images)?;
                fs::remove_dir_all(&src_images).map_err(|e| format!("删除源图片目录失败: {}", e))?;
            } else {
                safe_move_item(&src_images, &dst_images)?;
            }
        }

        for name in db_names { 
            let src = current_dir.join(name);
            let dst = default_dir.join(name);
            if src.exists() { safe_move_item(&src, &dst)?; }
        }
    }

    close_database();

    let mut settings = get_settings();
    settings.use_custom_storage = false;
    settings.custom_storage_path = None;
    update_settings(settings.clone())?;

    let db_path = default_dir.join("quickclipboard.db");
    init_database(db_path.to_str().ok_or("数据库路径无效")?)?;

    Ok(default_dir)
}

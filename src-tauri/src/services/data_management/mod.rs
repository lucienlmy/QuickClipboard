use std::{fs, path::{Path, PathBuf}, time::SystemTime};
use chrono::Local;
use serde::Serialize;

use crate::services::{get_data_directory, get_settings, update_settings};
use crate::services::settings::storage::SettingsStorage;
use crate::services::database::{init_database};
use crate::services::database::connection::{close_database, with_connection};

#[derive(Debug, Clone, Serialize)]
pub struct TargetDataInfo {
    pub has_data: bool,
    pub has_database: bool,
    pub has_images: bool,
    pub database_size: u64,
    pub images_count: usize,
    pub images_size: u64,
}

pub fn check_target_has_data(target_dir: &Path) -> Result<TargetDataInfo, String> {
    let db_path = target_dir.join("quickclipboard.db");
    let images_dir = target_dir.join("clipboard_images");
    
    let has_database = db_path.exists();
    let database_size = if has_database {
        fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };
    
    let (has_images, images_count, images_size) = if images_dir.exists() {
        let mut count = 0usize;
        let mut size = 0u64;
        if let Ok(entries) = fs::read_dir(&images_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        count += 1;
                        size += meta.len();
                    }
                }
            }
        }
        (count > 0, count, size)
    } else {
        (false, 0, 0)
    };
    
    Ok(TargetDataInfo {
        has_data: has_database || has_images,
        has_database,
        has_images,
        database_size,
        images_count,
        images_size,
    })
}

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

fn backup_full_zip(dir: &Path) -> Result<Option<PathBuf>, String> {
    let db = dir.join("quickclipboard.db");
    let images_dir = dir.join("clipboard_images");
    if !db.exists() && !images_dir.exists() { return Ok(None); }
    
    let backups = dir.join("backups");
    fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let ts_str = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let name = format!("quickclipboard-backup-{}.zip", ts_str);
    let target = backups.join(&name);
    
    let file = fs::File::create(&target).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    
    if db.exists() {
        let mut f = fs::File::open(&db).map_err(|e| e.to_string())?;
        zip.start_file("quickclipboard.db", options).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
    }
    
    if images_dir.exists() {
        for entry in fs::read_dir(&images_dir).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(fname) = path.file_name().and_then(|s| s.to_str()) {
                    let zip_path = format!("clipboard_images/{}", fname);
                    let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;
                    zip.start_file(&zip_path, options).map_err(|e| e.to_string())?;
                    std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    
    if let Ok(settings_path) = SettingsStorage::get_settings_path() {
        if settings_path.exists() {
            if let Ok(mut f) = fs::File::open(&settings_path) {
                let _ = zip.start_file("settings.json", options);
                let _ = std::io::copy(&mut f, &mut zip);
            }
        }
    }
    
    zip.finish().map_err(|e| e.to_string())?;
    enforce_backup_retention(&backups, 10)?;
    Ok(Some(target))
}

// 获取备份列表
#[derive(Debug, Clone, Serialize)]
pub struct BackupInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub created_at: String,
}

pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    let current_dir = get_current_storage_dir()?;
    let backups_dir = current_dir.join("backups");
    if !backups_dir.exists() { return Ok(vec![]); }
    
    let mut items: Vec<BackupInfo> = Vec::new();
    for e in fs::read_dir(&backups_dir).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let p = e.path();
        let fname = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
        if !fname.starts_with("quickclipboard-backup-") || !fname.ends_with(".zip") { continue; }
        let md = e.metadata().map_err(|e| e.to_string())?;
        let size = md.len();
        let modified = md.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let datetime: chrono::DateTime<Local> = modified.into();
        items.push(BackupInfo {
            path: p.to_string_lossy().to_string(),
            name: fname,
            size,
            created_at: datetime.format("%Y-%m-%d %H:%M:%S").to_string(),
        });
    }
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

fn enforce_backup_retention(backups_dir: &Path, keep: usize) -> Result<(), String> {
    let mut items: Vec<(SystemTime, PathBuf)> = Vec::new();
    for e in fs::read_dir(backups_dir).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let p = e.path();
        let fname = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if !fname.starts_with("quickclipboard-backup-") || !fname.ends_with(".zip") { continue; }
        let md = e.metadata().map_err(|e| e.to_string())?;
        let t = md.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        items.push((t, p));
    }
    items.sort_by(|a, b| b.0.cmp(&a.0));
    if items.len() > keep {
        for (_, p) in items.into_iter().skip(keep) {
            let _ = fs::remove_file(p);
        }
    }
    Ok(())
}

pub fn reset_all_data() -> Result<String, String> {
    let current_dir = get_current_storage_dir()?;
    let default_dir = get_default_data_dir()?;

    let _ = crate::services::database::connection::with_connection(|conn| {
        conn.execute_batch("PRAGMA wal_checkpoint(FULL); PRAGMA wal_checkpoint(TRUNCATE);")
    });
    let _ = backup_full_zip(&current_dir);
    if current_dir != default_dir { let _ = backup_full_zip(&default_dir); }

    close_database();

    fn clean_dir(dir: &Path) -> Result<(), String> {
        let images = dir.join("clipboard_images");
        if images.exists() { let _ = fs::remove_dir_all(&images); }
        for name in ["quickclipboard.db", "quickclipboard.db-shm", "quickclipboard.db-wal"] {
            let p = dir.join(name);
            if p.exists() { let _ = fs::remove_file(&p); }
        }
        Ok(())
    }

    clean_dir(&current_dir)?;
    if current_dir != default_dir { clean_dir(&default_dir)?; }

    let mut defaults = crate::services::AppSettings::default();
    defaults.use_custom_storage = false;
    defaults.custom_storage_path = None;
    update_settings(defaults.clone())?;

    let db_path = default_dir.join("quickclipboard.db");
    init_database(db_path.to_str().ok_or("数据库路径无效")?)?;
    let _ = crate::services::database::connection::with_connection(|conn| {
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
    });

    Ok(default_dir.to_string_lossy().to_string())
}
pub fn import_data_zip(zip_path: PathBuf, mode: &str) -> Result<String, String> {
    if !zip_path.exists() {
        return Err("导入文件不存在".into());
    }

    let temp_root = std::env::temp_dir().join(format!("quickclipboard_import_{}", fastrand::u32(..)));
    fs::create_dir_all(&temp_root).map_err(|e| e.to_string())?;
    let file = fs::File::open(&zip_path).map_err(|e| format!("打开导入文件失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {}", e))?;
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();
        if name.contains("..") { continue; }
        let out_path = temp_root.join(&name);
        if f.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = out_path.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
            let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut out).map_err(|e| e.to_string())?;
        }
    }

    let imported_db = temp_root.join("quickclipboard.db");
    let imported_images = temp_root.join("clipboard_images");
    let imported_settings = temp_root.join("settings.json");

    match mode {
        "replace" => {
            let current_dir_for_backup = get_current_storage_dir()?;
            let _ = crate::services::database::connection::with_connection(|conn| {
                conn.execute_batch("PRAGMA wal_checkpoint(FULL); PRAGMA wal_checkpoint(TRUNCATE);")
            });
            let _ = backup_full_zip(&current_dir_for_backup);
            let mut new_settings = if imported_settings.exists() {
                let s = fs::read_to_string(&imported_settings).map_err(|e| e.to_string())?;
                serde_json::from_str::<crate::services::AppSettings>(&s).map_err(|e| e.to_string())?
            } else {
                get_settings()
            };
            if crate::services::is_portable_build() || std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("portable.txt").exists())).unwrap_or(false) {
                new_settings.use_custom_storage = false;
                new_settings.custom_storage_path = None;
            }

            let target_dir = if new_settings.use_custom_storage {
                if let Some(ref path) = new_settings.custom_storage_path {
                    let p = PathBuf::from(path);
                    if p.exists() { p } else {
                        new_settings.use_custom_storage = false;
                        new_settings.custom_storage_path = None;
                        get_default_data_dir()?
                    }
                } else {
                    get_default_data_dir()?
                }
            } else {
                get_default_data_dir()?
            };

            update_settings(new_settings.clone())?;

            close_database();

            let target_images = target_dir.join("clipboard_images");
            if target_images.exists() { fs::remove_dir_all(&target_images).map_err(|e| e.to_string())?; }
            if imported_images.exists() { copy_dir_all(&imported_images, &target_images)?; }

            let src_db = temp_root.join("quickclipboard.db");
            let dst_db = target_dir.join("quickclipboard.db");
            if src_db.exists() {
                if let Some(p) = dst_db.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
                fs::copy(&src_db, &dst_db).map_err(|e| e.to_string())?;
            }
            for name in ["quickclipboard.db-shm", "quickclipboard.db-wal"] {
                let p = target_dir.join(name);
                if p.exists() { let _ = fs::remove_file(&p); }
            }

            let db_path = target_dir.join("quickclipboard.db");
            init_database(db_path.to_str().ok_or("数据库路径无效")?)?;
            let _ = crate::services::database::connection::with_connection(|conn| {
                conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            });

            let _ = fs::remove_dir_all(&temp_root);
            Ok(target_dir.to_string_lossy().to_string())
        }
        "merge" => {
            let current_dir = get_current_storage_dir()?;

            let target_images = current_dir.join("clipboard_images");
            if imported_images.exists() {
                if !target_images.exists() { fs::create_dir_all(&target_images).map_err(|e| e.to_string())?; }
                merge_dir_overwrite(&imported_images, &target_images)?;
            }

            if imported_db.exists() {
                merge_database(&imported_db)?;
            }

            let _ = fs::remove_dir_all(&temp_root);
            Ok(current_dir.to_string_lossy().to_string())
        }
        _ => {
            let _ = fs::remove_dir_all(&temp_root);
            Err("不支持的导入模式".into())
        }
    }
}
fn safe_move_item(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.exists() { return Ok(()); }
    if fs::rename(src, dst).is_err() {
        if src.is_dir() {
            copy_dir_all(src, dst)?;
            fs::remove_dir_all(src).map_err(|e| format!("删除源目录失败: {}", e))?;
        } else {
            if let Some(parent) = dst.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
            fs::copy(src, dst).map_err(|e| format!("复制文件失败: {}", e))?;
            fs::remove_file(src).map_err(|e| format!("删除源文件失败: {}", e))?;
        }
    }
    Ok(())
}

pub fn get_default_data_dir() -> Result<PathBuf, String> {
    let settings_path = SettingsStorage::get_settings_path()?;
    settings_path.parent().map(|p| p.to_path_buf()).ok_or("无法获取默认数据目录".to_string())
}

pub fn get_current_storage_dir() -> Result<PathBuf, String> {
    get_data_directory()
}

// mode: "source_only" | "target_only" | "merge"
pub fn change_storage_dir(new_dir: PathBuf, mode: &str) -> Result<PathBuf, String> {
    if crate::services::is_portable_build() || std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("portable.txt").exists())).unwrap_or(false) {
        return Err("便携版不支持更改存储路径".into());
    }
    if !new_dir.exists() { fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?; }

    let current_dir = get_current_storage_dir()?;
    if new_dir == current_dir {
        return Err("新位置与当前存储位置相同，无需迁移".to_string());
    }

    change_storage_dir_internal(&current_dir, &new_dir, mode)?;

    let mut settings = get_settings();
    settings.use_custom_storage = true;
    settings.custom_storage_path = Some(new_dir.to_string_lossy().to_string());
    update_settings(settings.clone())?;

    let db_path = new_dir.join("quickclipboard.db");
    init_database(db_path.to_str().ok_or("数据库路径无效")?)?;
    let _ = crate::services::database::connection::with_connection(|conn| {
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
    });

    Ok(new_dir)
}

fn merge_dir_overwrite(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            fs::create_dir_all(&dst_path).map_err(|e| e.to_string())?;
            merge_dir_overwrite(&src_path, &dst_path)?;
        } else {
            if let Some(parent) = dst_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn merge_dir_no_overwrite(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            if !dst_path.exists() { fs::create_dir_all(&dst_path).map_err(|e| e.to_string())?; }
            merge_dir_no_overwrite(&src_path, &dst_path)?;
        } else if !dst_path.exists() {
            if let Some(parent) = dst_path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
            fs::copy(&src_path, &dst_path).map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    Ok(())
}

fn merge_database(src_db: &Path) -> Result<(), String> {
    with_connection(|conn| {
        let import_path = src_db.to_str().ok_or(rusqlite::Error::InvalidPath("bad path".into()))?;
        conn.execute("ATTACH DATABASE ?1 AS importdb", [import_path])?;
        let _ = conn.execute(
            "INSERT OR IGNORE INTO groups (name, icon, color, order_index, created_at, updated_at)
             SELECT name, icon, color, order_index, created_at, updated_at FROM importdb.groups",
            [],
        );

        let _ = conn.execute(
            "INSERT OR IGNORE INTO favorites (id, title, content, html_content, content_type, image_id, group_name, item_order, created_at, updated_at)
             SELECT id, title, content, html_content, content_type, image_id, group_name, item_order, created_at, updated_at FROM importdb.favorites",
            [],
        );
        let _ = conn.execute(
            "INSERT INTO clipboard (content, html_content, content_type, image_id, created_at, updated_at)
             SELECT content, html_content, content_type, image_id, created_at, updated_at FROM importdb.clipboard",
            [],
        );

        let _ = conn.execute("DETACH DATABASE importdb", []);
        reorder_clipboard_by_time(conn);
        
        Ok(())
    })?;
    Ok(())
}

fn reorder_clipboard_by_time(conn: &rusqlite::Connection) {
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id FROM clipboard ORDER BY is_pinned DESC, created_at DESC"
    ) {
        let ids: Vec<i64> = stmt.query_map([], |row| row.get(0))
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();
        let count = ids.len() as i64;
        for (i, id) in ids.iter().enumerate() {
            conn.execute("UPDATE clipboard SET item_order = ? WHERE id = ?",
                rusqlite::params![count - i as i64, id]).ok();
        }
    }
}

pub fn reset_storage_dir_to_default(mode: &str) -> Result<PathBuf, String> {
    if crate::services::is_portable_build() || std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.join("portable.txt").exists())).unwrap_or(false) {
        return Err("便携版不支持重置存储路径".into());
    }
    let default_dir = get_default_data_dir()?;
    let current_dir = get_current_storage_dir()?;

    if current_dir == default_dir {
        return Err("当前已在默认存储位置".to_string());
    }

    change_storage_dir_internal(&current_dir, &default_dir, mode)?;

    let mut settings = get_settings();
    settings.use_custom_storage = false;
    settings.custom_storage_path = None;
    update_settings(settings.clone())?;

    let db_path = default_dir.join("quickclipboard.db");
    init_database(db_path.to_str().ok_or("数据库路径无效")?)?;
    let _ = crate::services::database::connection::with_connection(|conn| {
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
    });

    Ok(default_dir)
}

fn change_storage_dir_internal(src_dir: &Path, dst_dir: &Path, mode: &str) -> Result<(), String> {
    let _ = crate::services::database::connection::with_connection(|conn| {
        conn.execute_batch("PRAGMA wal_checkpoint(FULL); PRAGMA wal_checkpoint(TRUNCATE);")
    });
    let _ = backup_full_zip(src_dir);
    if check_target_has_data(dst_dir)?.has_data { let _ = backup_full_zip(dst_dir); }

    close_database();

    let src_images = src_dir.join("clipboard_images");
    let dst_images = dst_dir.join("clipboard_images");
    let src_db = src_dir.join("quickclipboard.db");
    let dst_db = dst_dir.join("quickclipboard.db");

    match mode {
        "source_only" => {
            if dst_images.exists() {
                fs::remove_dir_all(&dst_images).map_err(|e| format!("删除目标图片目录失败: {}", e))?;
            }
            if dst_db.exists() {
                fs::remove_file(&dst_db).map_err(|e| format!("删除目标数据库失败: {}", e))?;
            }
            if src_images.exists() {
                safe_move_item(&src_images, &dst_images)?;
            }
            if src_db.exists() {
                safe_move_item(&src_db, &dst_db)?;
            }
        }
        "target_only" => {
            if src_images.exists() {
                fs::remove_dir_all(&src_images).map_err(|e| format!("删除源图片目录失败: {}", e))?;
            }
            if src_db.exists() {
                fs::remove_file(&src_db).map_err(|e| format!("删除源数据库失败: {}", e))?;
            }
        }
        "merge" => {
            // 源数据优先：先把目标数据合并到源，再移动源到目标
            if src_images.exists() {
                if !dst_images.exists() { fs::create_dir_all(&dst_images).map_err(|e| e.to_string())?; }
                if dst_images.exists() { merge_dir_no_overwrite(&dst_images, &src_images)?; }
                if dst_images.exists() { fs::remove_dir_all(&dst_images).map_err(|e| format!("删除目标图片目录失败: {}", e))?; }
                safe_move_item(&src_images, &dst_images)?;
            }
            if src_db.exists() {
                if dst_db.exists() {
                    init_database(src_db.to_str().ok_or("数据库路径无效")?)?;
                    merge_database(&dst_db)?;
                    close_database();
                    fs::remove_file(&dst_db).map_err(|e| format!("删除目标数据库失败: {}", e))?;
                }
                safe_move_item(&src_db, &dst_db)?;
            }
        }
        _ => {
            return Err(format!("不支持的迁移模式: {}", mode));
        }
    }

    for name in ["quickclipboard.db-shm", "quickclipboard.db-wal"] {
        let p = dst_dir.join(name);
        if p.exists() { let _ = fs::remove_file(&p); }
        let sp = src_dir.join(name);
        if sp.exists() { let _ = fs::remove_file(&sp); }
    }

    Ok(())
}

pub fn export_data_zip(target_path: PathBuf) -> Result<PathBuf, String> {
    let current_dir = get_current_storage_dir()?;
    let _ = crate::services::database::connection::with_connection(|conn| {
        conn.execute_batch("PRAGMA wal_checkpoint(FULL); PRAGMA wal_checkpoint(TRUNCATE);")
    });
    close_database();

    let images_dir = current_dir.join("clipboard_images");
    let db_files = [
        "quickclipboard.db",
    ];
    let settings_path = crate::services::settings::storage::SettingsStorage::get_settings_path()?;

    if let Some(parent) = target_path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let file = fs::File::create(&target_path).map_err(|e| format!("创建导出文件失败: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for name in &db_files {
        let src = current_dir.join(name);
        if src.exists() {
            let mut f = fs::File::open(&src).map_err(|e| format!("读取文件失败: {}", e))?;
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        }
    }

    if images_dir.exists() {
        fn add_dir_recursively(base: &Path, dir: &Path, zip: &mut zip::ZipWriter<fs::File>, options: zip::write::SimpleFileOptions) -> Result<(), String> {
            for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                let rel = path.strip_prefix(base).map_err(|e| e.to_string())?;
                if path.is_dir() {
                    add_dir_recursively(base, &path, zip, options)?;
                } else {
                    let zip_path = Path::new("clipboard_images").join(rel);
                    let mut f = fs::File::open(&path).map_err(|e| format!("读取文件失败: {}", e))?;
                    let zip_name = zip_path.to_string_lossy();
                    zip.start_file(zip_name.as_ref(), options).map_err(|e| e.to_string())?;
                    std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
                }
            }
            Ok(())
        }

        add_dir_recursively(&images_dir, &images_dir, &mut zip, options)?;
    }

    if settings_path.exists() {
        let mut f = fs::File::open(&settings_path).map_err(|e| format!("读取settings失败: {}", e))?;
        zip.start_file("settings.json", options).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;

    let db_path = current_dir.join("quickclipboard.db");
    if db_path.exists() {
        init_database(db_path.to_str().ok_or("数据库路径无效")?)?;
    }

    Ok(target_path)
}

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::{write::FileOptions, ZipArchive, ZipWriter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportOptions {
    // 导出所有数据
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportOptions {
    pub mode: ImportMode,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ImportMode {
    Replace, // 替换模式：完全覆盖现有数据
    Merge,   // 合并模式：数据库合并，设置覆盖
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportMetadata {
    pub version: String,
    pub export_time: String,
    pub app_version: String,
    pub database_file: bool,
    pub settings_file: bool,
    pub images_folder: bool,
    #[serde(default)]
    pub exclude_image_cache: bool,
}

// 获取应用数据目录
pub fn get_app_data_dir() -> Result<PathBuf, String> {
    crate::settings::get_data_directory()
}

// 导出数据到ZIP文件
pub async fn export_data(export_path: &str, _options: ExportOptions) -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;

    // 创建ZIP文件
    let file = fs::File::create(export_path).map_err(|e| format!("创建导出文件失败: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let zip_options = FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    let mut metadata = ExportMetadata {
        version: "2.0".to_string(),
        export_time: Local::now().to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        database_file: false,
        settings_file: false,
        images_folder: false,
        exclude_image_cache: true, 
    };

    // 导出数据库文件（排除 image_data 表）
    let db_path = crate::database::get_database_path().map_err(|e| format!("获取数据库路径失败: {}", e))?;
    if db_path.exists() {
        // 创建临时数据库
        let temp_db_path = app_data_dir.join("temp_export.db");
        export_database_without_image_data(&db_path, &temp_db_path)?;

        add_file_to_zip(&mut zip, &temp_db_path, "quickclipboard.db", zip_options)?;
        metadata.database_file = true;

        let _ = fs::remove_file(&temp_db_path);
    }

    // 导出设置文件（始终从默认目录读取）
    let default_data_dir = crate::settings::AppSettings::get_default_data_directory()
        .map_err(|e| format!("获取默认数据目录失败: {}", e))?;
    let settings_path = default_data_dir.join("settings.json");
    if settings_path.exists() {
        add_file_to_zip(&mut zip, &settings_path, "settings.json", zip_options)?;
        metadata.settings_file = true;
    }

    // 导出图片文件夹
    let images_dir = app_data_dir.join("clipboard_images");
    if images_dir.exists() {
        add_directory_to_zip(&mut zip, &images_dir, "clipboard_images", zip_options)?;
        metadata.images_folder = true;
    }

    // 添加元数据文件
    zip.start_file("metadata.json", zip_options)
        .map_err(|e| format!("创建元数据文件失败: {}", e))?;

    let metadata_json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("序列化元数据失败: {}", e))?;

    zip.write_all(metadata_json.as_bytes())
        .map_err(|e| format!("写入元数据失败: {}", e))?;

    zip.finish()
        .map_err(|e| format!("完成ZIP文件创建失败: {}", e))?;

    Ok(())
}

// 导入数据从ZIP文件
pub async fn import_data(import_path: &str, options: ImportOptions) -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;

    // 打开ZIP文件
    let file = fs::File::open(import_path).map_err(|e| format!("打开导入文件失败: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("读取ZIP文件失败: {}", e))?;

    // 读取元数据
    let _metadata = read_metadata_from_zip(&mut archive)?;

    match options.mode {
        ImportMode::Replace => {
            // 替换模式：先备份，然后完全替换所有内容（数据 + 设置）
            backup_current_data(&app_data_dir).await?;
            extract_all_files(&mut archive, &app_data_dir)?;
            // 单独处理设置文件
            extract_settings_file(&mut archive)?;
        }
        ImportMode::Merge => {
            // 合并模式：备份，然后合并数据内容，保持当前设置不变
            backup_current_data(&app_data_dir).await?;
            merge_import_data(&mut archive, &app_data_dir).await?;
        }
    }

    // 重新初始化数据库以确保所有表都存在
    crate::database::reinitialize_database()
        .map_err(|e| format!("重新初始化数据库失败: {}", e))?;

    Ok(())
}

// 清空剪贴板历史
pub async fn clear_clipboard_history() -> Result<(), String> {
    crate::clipboard_history::clear_all().map_err(|e| format!("清空剪贴板历史失败: {}", e))
}

// 重置所有数据
pub async fn reset_all_data() -> Result<(), String> {
    let app_data_dir = get_app_data_dir()?;

    // 备份当前数据
    backup_current_data(&app_data_dir).await?;

    // 清空数据库
    crate::database::clear_all_data().map_err(|e| format!("清空数据库失败: {}", e))?;

    // 删除设置文件（始终从默认目录删除）
    let default_data_dir = crate::settings::AppSettings::get_default_data_directory()
        .map_err(|e| format!("获取默认数据目录失败: {}", e))?;
    let settings_path = default_data_dir.join("settings.json");
    if settings_path.exists() {
        fs::remove_file(&settings_path).map_err(|e| format!("删除设置文件失败: {}", e))?;
    }

    // 删除图片文件夹
    let images_dir = app_data_dir.join("clipboard_images");
    if images_dir.exists() {
        fs::remove_dir_all(&images_dir).map_err(|e| format!("删除图片文件夹失败: {}", e))?;
    }

    Ok(())
}

// 恢复默认配置（仅恢复设置，不影响数据）
pub async fn reset_settings_to_default() -> Result<(), String> {
    let default_data_dir = crate::settings::AppSettings::get_default_data_directory()
        .map_err(|e| format!("获取默认数据目录失败: {}", e))?;
    let settings_path = default_data_dir.join("settings.json");
    
    if settings_path.exists() {
        fs::remove_file(&settings_path).map_err(|e| format!("删除设置文件失败: {}", e))?;
    }

    Ok(())
}

// =================== 辅助函数 ===================

// 导出数据库但排除 image_data 表
fn export_database_without_image_data(source_db: &Path, target_db: &Path) -> Result<(), String> {
    use rusqlite::Connection;

    if target_db.exists() {
        fs::remove_file(target_db).map_err(|e| format!("删除临时数据库失败: {}", e))?;
    }

    let source_conn = Connection::open(source_db)
        .map_err(|e| format!("打开源数据库失败: {}", e))?;

    let target_conn = Connection::open(target_db)
        .map_err(|e| format!("创建目标数据库失败: {}", e))?;

    let mut stmt = source_conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'image_data'")
        .map_err(|e| format!("查询表名失败: {}", e))?;
    
    let table_names: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("读取表名失败: {}", e))?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| format!("处理表名失败: {}", e))?;
    
    drop(stmt);

    for table_name in table_names {
        let create_sql: String = source_conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name=?1",
                [&table_name],
                |row| row.get(0),
            )
            .map_err(|e| format!("获取表 {} 的创建语句失败: {}", table_name, e))?;

        target_conn
            .execute(&create_sql, [])
            .map_err(|e| format!("创建表 {} 失败: {}", table_name, e))?;

        target_conn
            .execute(&format!("ATTACH DATABASE '{}' AS source_db", source_db.display()), [])
            .map_err(|e| format!("附加源数据库失败: {}", e))?;
        
        target_conn
            .execute(&format!("INSERT INTO {} SELECT * FROM source_db.{}", table_name, table_name), [])
            .map_err(|e| format!("复制表 {} 数据失败: {}", table_name, e))?;
        
        target_conn
            .execute("DETACH DATABASE source_db", [])
            .map_err(|e| format!("分离源数据库失败: {}", e))?;
    }
    
    // 复制索引
    let mut idx_stmt = source_conn
        .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND tbl_name != 'image_data'")
        .map_err(|e| format!("查询索引失败: {}", e))?;
    
    let index_sqls: Vec<String> = idx_stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("读取索引失败: {}", e))?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| format!("处理索引失败: {}", e))?;
    
    drop(idx_stmt);
    
    for index_sql in index_sqls {
        let _ = target_conn.execute(&index_sql, []);
    }
    
    Ok(())
}

// 备份当前数据
async fn backup_current_data(app_data_dir: &Path) -> Result<(), String> {
    let backup_dir = app_data_dir.join("backups");
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("backup_{}.zip", timestamp));

    // 创建备份目录
    fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败: {}", e))?;

    // 导出当前数据作为备份
    let backup_options = ExportOptions {};
    export_data(backup_path.to_str().unwrap(), backup_options).await?;

    Ok(())
}

// 从ZIP文件读取元数据
fn read_metadata_from_zip(archive: &mut ZipArchive<fs::File>) -> Result<ExportMetadata, String> {
    let mut file = archive
        .by_name("metadata.json")
        .map_err(|_| "找不到元数据文件".to_string())?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| format!("读取元数据文件失败: {}", e))?;

    serde_json::from_str(&contents).map_err(|e| format!("解析元数据失败: {}", e))
}

// 提取所有文件（替换模式）
fn extract_all_files(archive: &mut ZipArchive<fs::File>, app_data_dir: &Path) -> Result<(), String> {
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取ZIP文件项失败: {}", e))?;

        let file_name = file.name().to_string();

        // 跳过元数据文件和设置文件（设置文件单独处理）
        if file_name == "metadata.json" || file_name == "settings.json" {
            continue;
        }

        // 跳过目录
        if file_name.ends_with('/') {
            continue;
        }

        let output_path = app_data_dir.join(&file_name);

        // 创建父目录
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }

        // 写入文件
        let mut output_file = fs::File::create(&output_path)
            .map_err(|e| format!("创建文件失败: {}", e))?;

        std::io::copy(&mut file, &mut output_file)
            .map_err(|e| format!("复制文件失败: {}", e))?;
    }

    Ok(())
}

fn extract_settings_file(archive: &mut ZipArchive<fs::File>) -> Result<(), String> {
    let mut settings_file = match archive.by_name("settings.json") {
        Ok(file) => file,
        Err(_) => {
            return Ok(());
        }
    };

    // 获取默认数据目录（设置文件始终保存在默认目录）
    let default_data_dir = crate::settings::AppSettings::get_default_data_directory()
        .map_err(|e| format!("获取默认数据目录失败: {}", e))?;
    
    let target_settings_path = default_data_dir.join("settings.json");

    // 确保目录存在
    if let Some(parent) = target_settings_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建设置目录失败: {}", e))?;
    }

    // 写入设置文件
    let mut output_file = fs::File::create(&target_settings_path)
        .map_err(|e| format!("创建设置文件失败: {}", e))?;

    std::io::copy(&mut settings_file, &mut output_file)
        .map_err(|e| format!("复制设置文件失败: {}", e))?;

    Ok(())
}

// 合并导入数据（合并模式）
// 合并数据内容（数据库记录、图片），不覆盖用户设置
async fn merge_import_data(archive: &mut ZipArchive<fs::File>, app_data_dir: &Path) -> Result<(), String> {
    // 先提取到临时目录
    let temp_dir = app_data_dir.join("temp_import");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|e| format!("清理临时目录失败: {}", e))?;
    }
    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    extract_all_files(archive, &temp_dir)?;

    // 合并数据库
    let temp_db_path = temp_dir.join("quickclipboard.db");
    if temp_db_path.exists() {
        merge_database(&temp_db_path).await?;
    }


    // 合并图片文件夹（复制不存在的文件）
    let temp_images_dir = temp_dir.join("clipboard_images");
    if temp_images_dir.exists() {
        let target_images_dir = app_data_dir.join("clipboard_images");
        merge_images_directory(&temp_images_dir, &target_images_dir)?;
    }

    // 清理临时目录
    fs::remove_dir_all(&temp_dir).map_err(|e| format!("清理临时目录失败: {}", e))?;

    Ok(())
}

// 合并数据库
async fn merge_database(temp_db_path: &Path) -> Result<(), String> {
    // 不需要单独打开临时数据库，直接使用ATTACH

    // 确保主数据库已初始化
    crate::database::initialize_database()
        .map_err(|e| format!("初始化主数据库失败: {}", e))?;

    // 获取主数据库连接并执行合并操作
    let result = crate::database::with_connection(|main_conn| {
        // 简单粗暴的方法：直接用ATTACH DATABASE合并
        main_conn.execute(&format!("ATTACH DATABASE '{}' AS temp_db", temp_db_path.display()), [])?;

        // 合并剪贴板数据
        let _ = main_conn.execute(
            "INSERT OR IGNORE INTO clipboard (content, html_content, content_type, image_id, item_order, created_at, updated_at)
             SELECT content, html_content, content_type, image_id, item_order, created_at, updated_at FROM temp_db.clipboard",
            []
        );

        // 合并常用文本数据
        let _ = main_conn.execute(
            "INSERT OR IGNORE INTO favorites (id, title, content, content_type, image_id, group_id, item_order, created_at, updated_at)
             SELECT id, title, content, content_type, image_id, group_id, item_order, created_at, updated_at FROM temp_db.favorites",
            []
        );

        // 合并分组数据
        let _ = main_conn.execute(
            "INSERT OR IGNORE INTO groups (id, name, icon, created_at, updated_at)
             SELECT id, name, icon, created_at, updated_at FROM temp_db.groups",
            []
        );

        main_conn.execute("DETACH DATABASE temp_db", [])?;

        Ok(())
    });

    result.map_err(|e| format!("数据库合并失败: {}", e))
}

// 合并图片目录
fn merge_images_directory(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    if !target_dir.exists() {
        fs::create_dir_all(target_dir).map_err(|e| format!("创建图片目录失败: {}", e))?;
    }

    copy_dir_recursively(source_dir, target_dir)
}

// 递归复制目录
fn copy_dir_recursively(source: &Path, target: &Path) -> Result<(), String> {
    if !target.exists() {
        fs::create_dir_all(target).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    for entry in fs::read_dir(source).map_err(|e| format!("读取源目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());

        if source_path.is_dir() {
            copy_dir_recursively(&source_path, &target_path)?;
        } else {
            // 只复制不存在的文件（避免覆盖）
            if !target_path.exists() {
                fs::copy(&source_path, &target_path)
                    .map_err(|e| format!("复制文件失败: {}", e))?;
            }
        }
    }

    Ok(())
}

// 添加文件到ZIP
fn add_file_to_zip(
    zip: &mut ZipWriter<fs::File>,
    file_path: &Path,
    zip_path: &str,
    options: FileOptions<()>,
) -> Result<(), String> {
    zip.start_file(zip_path, options)
        .map_err(|e| format!("创建ZIP文件项失败: {}", e))?;

    let file_content = fs::read(file_path).map_err(|e| format!("读取文件失败: {}", e))?;
    zip.write_all(&file_content)
        .map_err(|e| format!("写入ZIP文件失败: {}", e))?;

    Ok(())
}

// 添加目录到ZIP
fn add_directory_to_zip(
    zip: &mut ZipWriter<fs::File>,
    dir_path: &Path,
    zip_prefix: &str,
    options: FileOptions<()>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir_path).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();
        let name = entry.file_name();
        let zip_path = format!("{}/{}", zip_prefix, name.to_string_lossy());

        if path.is_dir() {
            add_directory_to_zip(zip, &path, &zip_path, options)?;
        } else {
            add_file_to_zip(zip, &path, &zip_path, options)?;
        }
    }

    Ok(())
}

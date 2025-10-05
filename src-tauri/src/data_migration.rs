use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

/// 数据迁移服务
pub struct DataMigrationService;

impl DataMigrationService {
    /// 执行数据迁移
    pub async fn migrate_data(from_dir: &PathBuf, to_dir: &PathBuf, app: Option<AppHandle>) -> Result<(), String> {
        // 确保目标目录存在
        fs::create_dir_all(to_dir).map_err(|e| format!("创建目标目录失败: {}", e))?;
        
        // 首先关闭数据库连接，确保数据库文件可以被移动
        println!("关闭数据库连接以进行数据迁移...");
        crate::database::close_database_connection()
            .map_err(|e| format!("关闭数据库连接失败: {}", e))?;
        
        // 需要迁移的文件和文件夹（除了settings.json）
        let items_to_migrate = [
            "quickclipboard.db",
            "clipboard_images", 
            "backups",
        ];
        
        for item in &items_to_migrate {
            let source_path = from_dir.join(item);
            let target_path = to_dir.join(item);
            
            if source_path.exists() {
                if source_path.is_file() {
                    // 复制文件
                    if let Some(parent) = target_path.parent() {
                        fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
                    }
                    
                    // 对于数据库文件，使用简单复制
                    if *item == "quickclipboard.db" {
                        Self::copy_database_file(&source_path, &target_path)?;
                        
                        // 复制成功后删除原文件
                        fs::remove_file(&source_path)
                            .map_err(|e| format!("删除原数据库文件失败: {}", e))?;
                        println!("数据库文件迁移完成");
                    } else {
                        // 其他文件直接复制
                        fs::copy(&source_path, &target_path)
                            .map_err(|e| format!("复制文件 {} 失败: {}", item, e))?;
                    }
                } else if source_path.is_dir() {
                    // 复制目录
                    Self::copy_dir_recursive(&source_path, &target_path)?;
                    
                    // 复制成功后删除原目录
                    fs::remove_dir_all(&source_path)
                        .map_err(|e| format!("删除原目录 {} 失败: {}", item, e))?;
                    println!("目录 {} 迁移完成", item);
                }
            }
        }
        
        // 如果提供了 AppHandle，刷新所有窗口
        if let Some(app_handle) = app {
            println!("刷新所有窗口以显示新位置的数据...");
            if let Err(e) = crate::commands::refresh_all_windows(app_handle) {
                println!("刷新窗口失败: {}", e);
                // 不阻止迁移完成，只是记录错误
            }
        }
        
        println!("数据迁移完成");
        Ok(())
    }
    
    /// 复制数据库文件
    fn copy_database_file(source: &PathBuf, target: &PathBuf) -> Result<(), String> {
        fs::copy(source, target)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    format!("复制数据库文件失败: 权限不足。请选择一个您有写入权限的目录，避免选择 Program Files、Windows 等系统目录。错误详情: {}", e)
                } else {
                    format!("复制数据库文件失败: {}", e)
                }
            })?;
        println!("数据库文件复制成功");
        Ok(())
    }

    /// 递归复制目录
    fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
        fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {}", e))?;
        
        for entry in fs::read_dir(src).map_err(|e| format!("读取源目录失败: {}", e))? {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();
            let file_name = entry.file_name();
            let target_path = dst.join(&file_name);
            
            if path.is_file() {
                fs::copy(&path, &target_path)
                    .map_err(|e| format!("复制文件 {:?} 失败: {}", file_name, e))?;
            } else if path.is_dir() {
                Self::copy_dir_recursive(&path, &target_path)?;
            }
        }
        
        Ok(())
    }
    
}

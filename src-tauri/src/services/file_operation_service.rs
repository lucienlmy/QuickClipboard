use std::path::Path;

/// 文件操作服务 - 处理文件复制、移动等操作
pub struct FileOperationService;

impl FileOperationService {
    /// 复制文件到指定目录
    pub async fn copy_files_to_directory(
        files: Vec<String>,
        target_dir: String,
    ) -> Result<Vec<String>, String> {
        use tokio::fs;

        // 验证目标目录是否存在
        if !Path::new(&target_dir).exists() {
            return Err(format!("目标目录不存在: {}", target_dir));
        }

        let mut results = Vec::new();
        let mut errors = Vec::new();

        for file_path in files {
            let source_path = Path::new(&file_path);
            
            if !source_path.exists() {
                errors.push(format!("源文件不存在: {}", file_path));
                continue;
            }

            // 获取文件名
            let file_name = match source_path.file_name() {
                Some(name) => name.to_string_lossy().to_string(),
                None => {
                    errors.push(format!("无法获取文件名: {}", file_path));
                    continue;
                }
            };

            let target_path = Path::new(&target_dir).join(&file_name);

            // 如果目标文件已存在，生成新的文件名
            let final_target_path = if target_path.exists() {
                Self::generate_unique_filename(&target_path)
            } else {
                target_path
            };

            // 执行文件复制
            match fs::copy(&source_path, &final_target_path).await {
                Ok(_) => {
                    results.push(final_target_path.to_string_lossy().to_string());
                }
                Err(e) => {
                    errors.push(format!("复制文件失败 {}: {}", file_path, e));
                }
            }
        }

        if !errors.is_empty() {
            return Err(format!("部分文件复制失败: {}", errors.join("; ")));
        }

        Ok(results)
    }

    /// 生成唯一的文件名（避免覆盖）
    fn generate_unique_filename(target_path: &Path) -> std::path::PathBuf {
        let parent = target_path.parent().unwrap_or(Path::new(""));
        let file_stem = target_path.file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        let extension = target_path.extension()
            .map(|s| format!(".{}", s.to_string_lossy()))
            .unwrap_or_default();

        let mut counter = 1;
        loop {
            let new_name = format!("{}({}){}", file_stem, counter, extension);
            let new_path = parent.join(&new_name);
            
            if !new_path.exists() {
                return new_path;
            }
            
            counter += 1;
            
            // 防止无限循环
            if counter > 9999 {
                return parent.join(format!("{}_{}{}", file_stem, 
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(), 
                    extension));
            }
        }
    }

    /// 获取文件信息
    pub async fn get_file_info(path: String) -> Result<crate::file_handler::FileInfo, String> {
        crate::file_handler::get_file_info(&path)
    }

    /// 获取剪贴板中的文件
    pub async fn get_clipboard_files() -> Result<Vec<String>, String> {
        crate::file_handler::get_clipboard_files()
    }

    /// 设置剪贴板中的文件
    pub async fn set_clipboard_files(files: Vec<String>) -> Result<(), String> {
        crate::file_handler::set_clipboard_files(&files)
    }

    /// 在文件管理器中打开文件位置
    pub async fn open_file_location(file_path: String) -> Result<(), String> {
        use std::process::Command;

        #[cfg(windows)]
        {
            // Windows: 使用 explorer.exe /select 来选中文件
            let output = Command::new("explorer")
                .args(&["/select,", &file_path])
                .output()
                .map_err(|e| format!("执行命令失败: {}", e))?;

            if !output.status.success() {
                let error_msg = String::from_utf8_lossy(&output.stderr);
                if !error_msg.trim().is_empty() {
                    eprintln!("Explorer 命令警告: {}", error_msg);
                }
                // 不返回错误
            }
        }

        #[cfg(target_os = "macos")]
        {
            // macOS: 使用 open -R 来在Finder中显示文件
            let output = Command::new("open")
                .args(&["-R", &file_path])
                .output()
                .map_err(|e| format!("执行命令失败: {}", e))?;

            if !output.status.success() {
                let error_msg = String::from_utf8_lossy(&output.stderr);
                return Err(format!("打开文件位置失败: {}", error_msg));
            }
        }

        #[cfg(target_os = "linux")]
        {
            // Linux: 尝试使用不同的文件管理器
            let managers = ["nautilus", "dolphin", "thunar", "pcmanfm"];
            let mut success = false;

            for manager in &managers {
                if Command::new("which")
                    .arg(manager)
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                {
                    let result = if *manager == "nautilus" {
                        Command::new(manager).arg("--select").arg(&file_path).output()
                    } else {
                        // 对于其他文件管理器，打开包含该文件的目录
                        let parent_dir = std::path::Path::new(&file_path)
                            .parent()
                            .map(|p| p.to_string_lossy().to_string())
                            .unwrap_or_else(|| ".".to_string());
                        Command::new(manager).arg(&parent_dir).output()
                    };

                    if result.map(|o| o.status.success()).unwrap_or(false) {
                        success = true;
                        break;
                    }
                }
            }

            if !success {
                return Err("找不到可用的文件管理器".to_string());
            }
        }

        Ok(())
    }

    /// 使用默认程序打开文件
    pub async fn open_file_with_default_program(file_path: String) -> Result<(), String> {
        use std::process::Command;

        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            use std::os::windows::process::CommandExt;

            // Windows: 使用 start 命令打开文件
            let result = Command::new("cmd")
                .args(&["/C", "start", "", &file_path])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();

            match result {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("打开文件失败: {}", e)),
            }
        }

        #[cfg(target_os = "macos")]
        {
            // macOS: 使用 open 命令打开文件
            let result = Command::new("open").arg(&file_path).spawn();

            match result {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("打开文件失败: {}", e)),
            }
        }

        #[cfg(target_os = "linux")]
        {
            // Linux: 使用 xdg-open 打开文件
            let result = Command::new("xdg-open").arg(&file_path).spawn();

            match result {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("打开文件失败: {}", e)),
            }
        }
    }

    /// 读取图片文件并转换为数据URL
    pub fn read_image_file(file_path: String) -> Result<String, String> {
        use std::fs;
        use std::path::Path;
        use base64::{engine::general_purpose, Engine as _};

        let path = Path::new(&file_path);

        // 检查文件是否存在
        if !path.exists() {
            return Err("文件不存在".to_string());
        }

        // 检查文件大小（限制为10MB）
        if let Ok(metadata) = fs::metadata(&path) {
            const MAX_SIZE: u64 = 10 * 1024 * 1024; // 10MB
            if metadata.len() > MAX_SIZE {
                return Err("文件太大".to_string());
            }
        }

        // 根据文件扩展名确定MIME类型
        let content_type = match path.extension().and_then(|ext| ext.to_str()) {
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("png") => "image/png",
            Some("gif") => "image/gif",
            Some("bmp") => "image/bmp",
            Some("webp") => "image/webp",
            Some("tiff") | Some("tif") => "image/tiff",
            Some("ico") => "image/x-icon",
            Some("svg") => "image/svg+xml",
            _ => "image/png", // 默认
        };

        // 读取文件内容
        let image_data = fs::read(&file_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        // 转换为base64
        let base64_data = general_purpose::STANDARD.encode(&image_data);
        let data_url = format!("data:{};base64,{}", content_type, base64_data);

        Ok(data_url)
    }
}

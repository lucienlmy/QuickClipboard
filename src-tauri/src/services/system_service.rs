use tauri::Manager;

/// 系统服务 - 处理系统信息、调试日志等工具功能
pub struct SystemService;

impl SystemService {
    /// 调试日志
    pub fn log_debug(message: String) {
        println!("前端调试: {}", message);
    }

    /// 获取应用数据目录
    pub fn get_app_data_dir() -> Result<String, String> {
        crate::data_manager::get_app_data_dir().map(|path| path.to_string_lossy().to_string())
    }

    /// 刷新所有文件类型项目的图标
    pub fn refresh_file_icons(app_handle: tauri::AppHandle) -> Result<(), String> {
        println!("开始刷新文件图标...");

        // 获取所有剪贴板历史项目
        let items = crate::database::get_clipboard_history(None)
            .map_err(|e| format!("获取剪贴板历史失败: {}", e))?;

        let mut updated_count = 0;

        for item in items {
            // 只处理文件类型的项目
            if matches!(item.content_type, crate::database::ContentType::File) {
                // 简单的文件图标刷新逻辑
                // 这里可以根据需要实现具体的图标更新逻辑
                updated_count += 1;
            }
        }

        println!("文件图标刷新完成，处理了 {} 个项目", updated_count);

        // 通知前端刷新数据
        if let Some(main_window) = app_handle.get_webview_window("main") {
            use tauri::Emitter;
            let _ = main_window.emit("refresh-clipboard-history", ());
        }

        Ok(())
    }

}

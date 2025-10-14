/// 图片处理服务
pub struct ImageService;

impl ImageService {
    /// 获取图片文件路径
    pub fn get_image_file_path(content: String) -> Result<String, String> {
        if content.starts_with("image:") {
            // 格式：image:{image_id}
            let image_id = content.strip_prefix("image:").unwrap_or("");
            let image_manager = crate::image_manager::get_image_manager()?;
            let manager = image_manager
                .lock()
                .map_err(|e| format!("获取图片管理器锁失败: {}", e))?;
            manager.get_image_file_path(image_id)
        } else {
            Err("不支持的图片格式".to_string())
        }
    }

    /// 保存图片到文件（用于"另存为"功能）
    pub fn save_image_to_file(content: String, file_path: String) -> Result<(), String> {
        use std::fs;

        if content.starts_with("image:") {
            // 从图片管理器复制文件
            let image_id = content.strip_prefix("image:").unwrap_or("");
            let image_manager = crate::image_manager::get_image_manager()?;
            let manager = image_manager
                .lock()
                .map_err(|e| format!("获取图片管理器锁失败: {}", e))?;
            
            let source_path = manager.get_image_file_path(image_id)?;
            fs::copy(&source_path, &file_path)
                .map_err(|e| format!("复制文件失败: {}", e))?;
        } else if content.starts_with("data:image/") {
            // 从data URL保存
            use base64::{engine::general_purpose, Engine as _};
            
            let base64_data = content
                .split_once(',')
                .map(|(_, data)| data)
                .ok_or("无效的data URL格式")?;

            let image_data = general_purpose::STANDARD
                .decode(base64_data)
                .map_err(|e| format!("Base64解码失败: {}", e))?;

            fs::write(&file_path, image_data)
                .map_err(|e| format!("写入文件失败: {}", e))?;
        } else {
            return Err("不支持的图片格式".to_string());
        }

        Ok(())
    }
}

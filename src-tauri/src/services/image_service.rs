/// 图片处理服务 - 处理图片相关的业务逻辑
pub struct ImageService;

impl ImageService {
    /// 获取图片数据URL
    pub fn get_image_data_url(image_id: String) -> Result<String, String> {
        let image_manager = crate::image_manager::get_image_manager()?;
        let manager = image_manager
            .lock()
            .map_err(|e| format!("锁定图片管理器失败: {}", e))?;
        manager.get_image_data_url(&image_id)
    }

    /// 获取图片缩略图数据URL
    pub fn get_image_thumbnail_data_url(
        image_id: Option<String>,
        content: String,
        max_size: Option<u32>,
    ) -> Result<String, String> {
        let data_url = if let Some(image_id) = image_id {
            // 新格式：从图片管理器获取
            let image_manager = crate::image_manager::get_image_manager()?;
            let manager = image_manager
                .lock()
                .map_err(|e| format!("锁定图片管理器失败: {}", e))?;
            manager.get_image_data_url(&image_id)?
        } else if content.starts_with("data:image/") {
            // 旧格式：直接使用data URL
            content
        } else {
            return Err("无效的图片内容格式".to_string());
        };

        Ok(data_url)
    }

    /// 保存图片到文件
    pub fn save_image_to_file(content: String, file_path: String) -> Result<(), String> {
        use base64::{engine::general_purpose, Engine as _};
        use std::fs;

        // 如果内容是data URL，提取base64部分
        let base64_data = if content.starts_with("data:image/") {
            // 查找逗号位置，提取base64数据
            content
                .split_once(',')
                .map(|(_, data)| data)
                .ok_or("无效的data URL格式")?
        } else {
            &content
        };

        // 解码base64数据
        let image_data = general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| format!("Base64解码失败: {}", e))?;

        // 写入文件
        fs::write(&file_path, image_data)
            .map_err(|e| format!("写入文件失败: {}", e))?;

        println!("图片已保存到: {}", file_path);
        Ok(())
    }


    /// 获取图片文件路径
    pub fn get_image_file_path(content: String) -> Result<String, String> {
        if content.starts_with("image:") {
            // 新格式：通过图片ID获取文件路径
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

    /// 将图片固定到屏幕（已废弃，不再支持外部截屏程序）
    pub async fn pin_image_to_screen(_content: String) -> Result<(), String> {
        Err("钉图片功能已移除，不再支持外部截屏程序".to_string())
    }
}

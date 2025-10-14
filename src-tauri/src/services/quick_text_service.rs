use crate::database::FavoriteItem;
use crate::quick_texts;
use crate::image_manager::get_image_manager;

/// 常用文本服务 - 处理常用文本相关的业务逻辑
pub struct QuickTextService;

impl QuickTextService {
    /// 获取所有常用文本
    pub fn get_all() -> Vec<FavoriteItem> {
        quick_texts::get_all_quick_texts()
    }

    /// 添加常用文本
    pub fn add(title: String, content: String, group_name: String) -> Result<FavoriteItem, String> {
        quick_texts::add_quick_text(title, content, group_name)
    }

    /// 更新常用文本
    pub fn update(
        id: String,
        title: String,
        content: String,
        group_name: String,
    ) -> Result<FavoriteItem, String> {
        quick_texts::update_quick_text(id, title, content, Some(group_name))
    }

    /// 删除常用文本
    pub fn delete(id: String) -> Result<(), String> {
        quick_texts::delete_quick_text(&id)
    }

    /// 将剪贴板历史项添加到常用文本
    pub fn add_from_clipboard(id: i64) -> Result<FavoriteItem, String> {
        // 从数据库查询指定ID的剪贴板项
        let (content, html_content) = crate::database::with_connection(|conn| {
            conn.query_row(
                "SELECT content, html_content FROM clipboard WHERE id = ?",
                [id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?
                    ))
                }
            )
        }).map_err(|e| format!("未找到ID为 {} 的剪贴板项: {}", id, e))?;

        // 处理内容，如果是图片则创建副本
        let final_content = Self::process_image_content(content)?;

        // 生成标题
        let title = Self::generate_title(&final_content);

        // 添加到常用文本
        quick_texts::add_quick_text_with_group_and_html(title, final_content, html_content, "全部".to_string())
    }

    /// 处理图片内容，使用图片ID
    fn process_image_content(content: String) -> Result<String, String> {
        if content.starts_with("image:") {
            // 提取图片ID
            let image_id = content.strip_prefix("image:").unwrap_or("");
            if !image_id.is_empty() {
                // 验证图片是否存在
                match get_image_manager() {
                    Ok(image_manager) => {
                        match image_manager.lock() {
                            Ok(manager) => {
                                match manager.get_image_file_path(image_id) {
                                    Ok(_) => {
                                        // 图片存在，使用原始ID
                                        Ok(content)
                                    }
                                    Err(e) => {
                                        println!("验证图片失败: {}, 使用原始引用", e);
                                        Ok(content)
                                    }
                                }
                            }
                            Err(e) => {
                                println!("获取图片管理器锁失败: {}, 使用原始引用", e);
                                Ok(content)
                            }
                        }
                    }
                    Err(e) => {
                        println!("获取图片管理器失败: {}, 使用原始引用", e);
                        Ok(content)
                    }
                }
            } else {
                Ok(content)
            }
        } else {
            Ok(content)
        }
    }

    /// 根据内容类型生成合适的标题
    fn generate_title(content: &str) -> String {
        if content.starts_with("data:image/") || content.starts_with("image:") {
            // 图片内容使用固定标题
            "图片".to_string()
        } else if content.starts_with("files:") {
            // 文件内容解析文件名作为标题
            crate::utils::content_utils::generate_files_title(content)
        } else if content.chars().count() > 30 {
            // 文本内容取前30个字符作为标题
            let truncated: String = content.chars().take(30).collect();
            format!("{}...", truncated)
        } else {
            content.to_string()
        }
    }
}

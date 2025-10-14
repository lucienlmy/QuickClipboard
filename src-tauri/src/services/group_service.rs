use crate::database::GroupInfo;
use uuid;

/// 分组服务 - 处理分组相关的业务逻辑
pub struct GroupService;

impl GroupService {
    /// 获取所有分组
    pub fn get_all_groups() -> Vec<GroupInfo> {
        crate::database::get_all_groups().unwrap_or_default()
    }

    /// 添加分组
    pub fn add_group(name: String, icon: String) -> Result<GroupInfo, String> {
        crate::groups::add_group(name, icon)
    }

    /// 更新分组
    pub fn update_group(id: String, name: String, icon: String) -> Result<GroupInfo, String> {
        crate::groups::update_group(id, name, icon)
    }

    /// 删除分组
    pub fn delete_group(id: String) -> Result<(), String> {
        crate::groups::delete_group(id)
    }

    /// 按分组获取常用文本
    pub fn get_quick_texts_by_group(group_name: String) -> Vec<crate::database::FavoriteItem> {
        crate::quick_texts::get_quick_texts_by_group(&group_name)
    }

    /// 移动常用文本到分组
    pub fn move_quick_text_to_group(id: String, group_name: String) -> Result<(), String> {
        crate::quick_texts::move_quick_text_to_group(id, group_name)
    }

    /// 从剪贴板历史添加到分组
    pub fn add_clipboard_to_group(index: usize, group_name: String) -> Result<crate::database::FavoriteItem, String> {
        // 从数据库获取剪贴板历史
        let items = crate::database::get_clipboard_history(None)
            .map_err(|e| format!("获取剪贴板历史失败: {}", e))?;

        if index >= items.len() {
            return Err(format!("索引 {} 超出历史范围", index));
        }

        let content = items[index].content.clone();
        let html_content = items[index].html_content.clone();

        // 处理内容，如果是图片则创建副本
        let final_content = if content.starts_with("image:") {
            // 提取图片ID
            let image_id = content.strip_prefix("image:").unwrap_or("");
            
            // 验证图片是否存在
            match crate::image_manager::get_image_manager() {
                Ok(manager) => {
                    let guard = manager.lock().map_err(|e| format!("锁定图片管理器失败: {}", e))?;
                    match guard.get_image_file_path(image_id) {
                        Ok(_) => {
                            drop(guard);
                            content
                        },
                        Err(e) => {
                            eprintln!("图片文件不存在: {}", e);
                            content
                        }
                    }
                },
                Err(e) => {
                    eprintln!("获取图片管理器失败: {}", e);
                    content // 使用原始内容
                }
            }
        } else {
            content
        };

        // 生成标题（取前50个字符）
        let display_content = if final_content.starts_with("image:") {
            "[图片]".to_string()
        } else if final_content.starts_with("files:") {
            "[文件]".to_string()
        } else {
            final_content.chars().take(50).collect::<String>()
        };

        // 添加到收藏
        let favorite_item = crate::database::FavoriteItem {
            id: uuid::Uuid::new_v4().to_string(), // 生成唯一 UUID
            title: display_content,
            content: final_content,
            html_content,
            group_name,
            image_id: None,
            content_type: items[index].content_type.clone(),
            created_at: chrono::Local::now().timestamp(),
            updated_at: chrono::Local::now().timestamp(),
            item_order: 0,
        };

        crate::database::add_favorite_item(&favorite_item).map(|_| favorite_item)
    }
}

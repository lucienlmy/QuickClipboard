use crate::database;
use crate::image_manager::get_image_manager;
use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::RwLock;

// 使用database模块中的ClipboardItem结构
pub use crate::database::ClipboardItem;

// 历史记录数量限制 - 从设置文件读取用户配置的值
static HISTORY_LIMIT: Lazy<RwLock<usize>> = Lazy::new(|| {
    let settings = crate::settings::get_global_settings();
    RwLock::new(settings.history_limit as usize)
});

// 剪贴板监听控制
static MONITORING_ENABLED: AtomicBool = AtomicBool::new(true);

// 忽略重复内容控制
static IGNORE_DUPLICATES: AtomicBool = AtomicBool::new(false);

// 保存图片控制
static SAVE_IMAGES: AtomicBool = AtomicBool::new(true);

// 从数据库加载历史记录（数据库模式下不需要显式加载）
pub fn load_history() {
    println!("剪贴板历史记录将从数据库动态加载");
}

// 监听剪贴板变化并添加到历史记录
pub fn add_to_history(text: String) {
    if !MONITORING_ENABLED.load(Ordering::Relaxed) {
        println!("剪贴板监听已禁用，跳过添加历史记录");
        return;
    }

    // 过滤空白内容：检查去除空白字符后是否为空
    if text.trim().is_empty() {
        println!("跳过空白内容，不添加到历史记录");
        return;
    }

    if let Err(e) = database::add_clipboard_item_smart(text, None) {
        println!("添加剪贴板历史失败: {}", e);
    }
}



// 添加到历史记录并返回是否真正添加了新内容，支持HTML内容，控制是否移动重复内容
pub fn add_to_history_with_check_and_move_html(text: String, html_content: Option<String>, move_duplicates: bool) -> bool {
    if !MONITORING_ENABLED.load(Ordering::Relaxed) {
        println!("剪贴板监听已禁用，跳过添加历史记录");
        return false;
    }

    // 过滤空白内容：检查去除空白字符后是否为空
    if text.trim().is_empty() {
        println!("跳过空白内容，不添加到历史记录");
        return false;
    }

    // 检查是否已存在相同内容
    match database::clipboard_item_exists(&text) {
        Ok(Some(existing_id)) => {
            if move_duplicates {
                // 移动到最前面（复制操作）
                if let Err(e) = database::move_clipboard_item_to_front(existing_id) {
                    println!("移动剪贴板项目到前面失败: {}", e);
                    return false;
                }
                true // 移动了位置，算作添加了新内容
            } else {
                // 不移动重复内容（粘贴操作）
                false
            }
        }
        Ok(None) => {
            // 新文本：使用智能添加函数根据内容类型自动判断
            let result = database::add_clipboard_item_smart(text, html_content);
            
            if let Err(e) = result {
                println!("添加剪贴板历史失败: {}", e);
                return false;
            }

            // 限制历史记录数量
            let limit = *HISTORY_LIMIT.read().unwrap();
            if let Err(e) = database::limit_clipboard_history(limit) {
                println!("限制剪贴板历史数量失败: {}", e);
            }

            true // 添加了新内容
        }
        Err(e) => {
            println!("检查剪贴板项目是否存在失败: {}", e);
            false
        }
    }
}

// 检查内容是否在历史记录中且需要移动到第一位
pub fn move_to_front_if_exists(text: String) -> bool {
    // 过滤空白内容：检查去除空白字符后是否为空
    if text.trim().is_empty() {
        println!("跳过空白内容，不移动到前面");
        return false;
    }

    match database::clipboard_item_exists(&text) {
        Ok(Some(existing_id)) => {
            // 获取当前历史记录以检查是否已经在第一位
            match database::get_clipboard_history(Some(1)) {
                Ok(items) => {
                    // 如果已经是第一位，不需要移动
                    if !items.is_empty() && items[0].content == text {
                        return false;
                    }

                    // 移动到第一位
                    if let Err(e) = database::move_clipboard_item_to_front(existing_id) {
                        println!("移动剪贴板项目到前面失败: {}", e);
                        return false;
                    }
                    true
                }
                Err(e) => {
                    println!("获取剪贴板历史失败: {}", e);
                    false
                }
            }
        }
        Ok(None) => false,
        Err(e) => {
            println!("检查剪贴板项目是否存在失败: {}", e);
            false
        }
    }
}

// 获取历史记录数量限制
pub fn get_history_limit() -> usize {
    *HISTORY_LIMIT.read().unwrap()
}

// 设置历史记录数量限制
pub fn set_history_limit(limit: usize) {
    let mut history_limit = HISTORY_LIMIT.write().unwrap();
    *history_limit = limit;

    // 在数据库中限制历史记录数量
    if let Err(e) = database::limit_clipboard_history(limit) {
        println!("数据库限制操作失败: {}", e);
    } else {
        println!("历史记录数量限制已设置为: {}", limit);
    }
}

// 移动单个项目到指定位置
pub fn move_item(from_index: usize, to_index: usize) -> Result<(), String> {
    let items =
        database::get_clipboard_history(None).map_err(|e| format!("获取剪贴板历史失败: {}", e))?;

    if from_index >= items.len() {
        return Err(format!("源索引 {} 超出范围", from_index));
    }

    if to_index >= items.len() {
        return Err(format!("目标索引 {} 超出范围", to_index));
    }

    if from_index == to_index {
        return Ok(());
    }

    let mut reordered_items = items;
    let moved_item = reordered_items.remove(from_index);
    reordered_items.insert(to_index, moved_item);

    let item_ids: Vec<i64> = reordered_items
        .iter()
        .map(|item| item.id)
        .collect();

    database::reorder_clipboard_items_by_ids(&item_ids)
        .map_err(|e| format!("数据库重新排序失败: {}", e))?;

    Ok(())
}

// 设置剪贴板监听状态
pub fn set_monitoring_enabled(enabled: bool) {
    MONITORING_ENABLED.store(enabled, Ordering::Relaxed);
}

// 检查剪贴板监听是否启用
pub fn is_monitoring_enabled() -> bool {
    MONITORING_ENABLED.load(Ordering::Relaxed)
}

// 设置忽略重复内容状态
pub fn set_ignore_duplicates(enabled: bool) {
    IGNORE_DUPLICATES.store(enabled, Ordering::Relaxed);
    println!("忽略重复内容设置: {}", enabled);
}

// 设置保存图片状态
pub fn set_save_images(enabled: bool) {
    SAVE_IMAGES.store(enabled, Ordering::Relaxed);
    println!("保存图片设置: {}", enabled);
}

// 检查是否保存图片
pub fn is_save_images() -> bool {
    SAVE_IMAGES.load(Ordering::Relaxed)
}


// 清空所有剪贴板历史
pub fn clear_all() -> Result<(), String> {
    // 清空数据库
    database::clear_clipboard_history()?;

    // 清理未使用的图片
    cleanup_orphaned_images();

    println!("已清空所有剪贴板历史记录");
    Ok(())
}

// 清理未使用的图片文件（孤儿图片）
pub fn cleanup_orphaned_images() {
    // 收集所有正在使用的图片ID
    let mut used_image_ids = Vec::new();
    
    // 从剪贴板历史中收集图片ID
    if let Ok(clipboard_items) = database::get_clipboard_history(None) {
        for item in clipboard_items {
            // 从image_id字段收集（纯图片类型）
            if item.content_type == crate::database::ContentType::Image {
                if let Some(image_id) = item.image_id {
                    used_image_ids.push(image_id);
                }
            }
            
            // 从html_content字段中提取图片ID（富文本中的图片）
            if let Some(html) = &item.html_content {
                extract_image_ids_from_html(html, &mut used_image_ids);
            }
        }
    }
    
    // 从常用文本中收集图片ID
    if let Ok(quick_texts) = crate::database::get_all_favorite_items() {
        for text in quick_texts {
            // 检查content是否为图片引用格式 "image:id"
            if text.content.starts_with("image:") {
                let image_id = text.content.strip_prefix("image:").unwrap_or("");
                if !image_id.is_empty() {
                    used_image_ids.push(image_id.to_string());
                }
            }
            
            // 从html_content字段中提取图片ID（富文本中的图片）
            if let Some(html) = &text.html_content {
                extract_image_ids_from_html(html, &mut used_image_ids);
            }
        }
    }
    
    // 调用图片管理器清理未使用的图片
    if let Ok(image_manager) = get_image_manager() {
        if let Ok(manager) = image_manager.lock() {
            if let Err(e) = manager.cleanup_unused_images(&used_image_ids) {
                println!("清理未使用的图片失败: {}", e);
            } else {
                println!("已清理未使用的图片，保留 {} 个正在使用的图片", used_image_ids.len());
            }
        }
    }
}

// 从HTML内容中提取所有图片ID
fn extract_image_ids_from_html(html: &str, image_ids: &mut Vec<String>) {
    // 也匹配 onerror 等属性中的图片ID
    let patterns = [
        r#"src="image-id:([a-f0-9]+)""#,
        r#"src='image-id:([a-f0-9]+)'"#,
        r#"onerror="[^"]*image-id:([a-f0-9]+)[^"]*""#,
        r#"onerror='[^']*image-id:([a-f0-9]+)[^']*'"#,
    ];
    
    for pattern in &patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            for cap in re.captures_iter(html) {
                if let Some(id) = cap.get(1) {
                    let image_id = id.as_str().to_string();
                    if !image_ids.contains(&image_id) {
                        image_ids.push(image_id);
                    }
                }
            }
        }
    }
}

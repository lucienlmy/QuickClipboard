use crate::database;
use uuid::Uuid;

// 使用database模块中的FavoriteItem结构
pub use crate::database::FavoriteItem;

// 从数据库加载常用文本（数据库模式下不需要显式加载）
pub fn load_quick_texts() {
    println!("常用文本将从数据库动态加载");
}

// 获取所有常用文本
pub fn get_all_quick_texts() -> Vec<FavoriteItem> {
    match database::get_all_favorite_items() {
        Ok(texts) => texts,
        Err(e) => {
            println!("获取所有常用文本失败: {}", e);
            vec![]
        }
    }
}

// 按分组获取常用文本
pub fn get_quick_texts_by_group(group_name: &str) -> Vec<FavoriteItem> {
    match database::get_favorite_items_by_group(group_name) {
        Ok(texts) => texts,
        Err(e) => {
            println!("按分组获取常用文本失败: {}", e);
            vec![]
        }
    }
}

// 添加常用文本
pub fn add_quick_text(
    title: String,
    content: String,
    group_name: String,
) -> Result<FavoriteItem, String> {
    add_quick_text_with_group_and_html(title, content, None, group_name)
}

// 添加带HTML内容的常用文本
pub fn add_quick_text_with_group_and_html(
    title: String,
    content: String,
    html_content: Option<String>,
    group_name: String,

) -> Result<FavoriteItem, String> {
    let id = Uuid::new_v4().to_string();
    let quick_text = FavoriteItem::new_text_with_html(id, title, content, html_content, group_name);

    database::add_favorite_item(&quick_text)?;
    Ok(quick_text)
}

// 更新常用文本
pub fn update_quick_text(
    id: String,
    title: String,
    content: String,
    group_name: Option<String>,
) -> Result<FavoriteItem, String> {
    let texts = database::get_all_favorite_items()?;
    let existing_text = texts
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("常用文本 {} 不存在", id))?;

    let now = chrono::Local::now().timestamp();
    let group_name = group_name.unwrap_or_else(|| "全部".to_string());

    let mut updated_text = existing_text.clone();
    updated_text.title = title;
    updated_text.content = content;
    updated_text.group_name = group_name;
    updated_text.updated_at = now;

    database::update_favorite_item(&updated_text)?;
    Ok(updated_text)
}

// 删除常用文本
pub fn delete_quick_text(id: &str) -> Result<(), String> {
    database::delete_favorite_item(id)?;
    
    // 清理未使用的图片
    cleanup_orphaned_images();
    
    Ok(())
}

// 移动常用文本在同一分组内的位置
pub fn move_quick_text_within_group(
    item_id: &str,
    new_index: usize,
) -> Result<(), String> {
    // 获取所有常用文本
    let all_texts = database::get_all_favorite_items()?;

    // 找到要移动的项目
    let moved_item = all_texts
        .iter()
        .find(|t| t.id == item_id)
        .ok_or_else(|| format!("常用文本 {} 不存在", item_id))?;
    let item_group_name = &moved_item.group_name;

    // 获取同一分组的所有项目
    let mut group_texts: Vec<FavoriteItem> = all_texts
        .iter()
        .filter(|t| &t.group_name == item_group_name)
        .cloned()
        .collect();

    // 找到要移动的项目在分组内的实际索引
    let actual_item_index = group_texts
        .iter()
        .position(|t| t.id == moved_item.id)
        .ok_or_else(|| "在分组中找不到要移动的项目".to_string())?;

    if new_index >= group_texts.len() {
        return Err("无效的新位置索引".to_string());
    }

    // 在分组内重新排序
    let item = group_texts.remove(actual_item_index);
    group_texts.insert(new_index, item);

    // 更新排序
    database::reorder_favorite_items(&group_texts)
}

// 移动常用文本到指定分组
pub fn move_quick_text_to_group(id: String, group_name: String) -> Result<(), String> {
    // 获取现有的常用文本
    let texts = database::get_all_favorite_items()?;
    let existing_text = texts
        .iter()
        .find(|t| t.id == id)
        .cloned()
        .ok_or_else(|| format!("常用文本 {} 不存在", id))?;

    let old_group_name = existing_text.group_name.clone();

    // 创建更新后的文本
    let mut updated_text = existing_text.clone();
    updated_text.group_name = group_name.clone();
    updated_text.updated_at = chrono::Local::now().timestamp();

    // 更新数据库
    database::update_favorite_item(&updated_text)?;

    println!(
        "已将常用文本 {} 从分组 {} 移动到分组 {}",
        id, old_group_name, group_name
    );
    Ok(())
}

// 清理未使用的图片文件（孤儿图片）
fn cleanup_orphaned_images() {
    crate::clipboard_history::cleanup_orphaned_images();
}
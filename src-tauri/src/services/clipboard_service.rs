use arboard::Clipboard;
use crate::clipboard_content::{image_to_data_url, set_clipboard_content, set_clipboard_content_with_html};
use crate::clipboard_history::{self, ClipboardItem};

/// 剪贴板服务 - 处理剪贴板相关的业务逻辑
pub struct ClipboardService;

impl ClipboardService {
    /// 从剪贴板获取文本
    pub fn get_text() -> Result<String, String> {
        match Clipboard::new() {
            Ok(mut clipboard) => match clipboard.get_text() {
                Ok(text) => Ok(text),
                Err(_) => Err("剪贴板为空或不是文本格式".into()),
            },
            Err(e) => Err(format!("获取剪贴板失败: {}", e)),
        }
    }

    /// 设置剪贴板文本
    pub fn set_text(text: String) -> Result<(), String> {
        set_clipboard_content(text)
    }

    /// 设置剪贴板图片
    pub fn set_image(data_url: String) -> Result<(), String> {
        set_clipboard_content(data_url)
    }

    /// 获取剪贴板历史记录
    pub fn get_history() -> Vec<ClipboardItem> {
        // 获取当前的历史记录数量限制
        let limit = clipboard_history::get_history_limit();

        // 从数据库获取，使用当前的数量限制
        match crate::database::get_clipboard_history(Some(limit)) {
            Ok(items) => items,
            Err(e) => {
                println!("从数据库获取历史记录失败: {}", e);
                Vec::new()
            }
        }
    }

    /// 移动剪贴板项目到第一位
    pub fn move_to_front(text: String) -> Result<(), String> {
        clipboard_history::move_to_front_if_exists(text);
        Ok(())
    }

    /// 设置剪贴板内容（带HTML）
    pub fn set_content_with_html(text: String, html: String) -> Result<(), String> {
        set_clipboard_content_with_html(text, Some(html))
    }

    /// 刷新剪贴板内容（从系统剪贴板读取并添加到历史）
    pub fn refresh_clipboard() -> Result<(), String> {
        use arboard::Clipboard;
        use crate::clipboard_content::image_to_data_url;

        match Clipboard::new() {
            Ok(mut clipboard) => {
                if let Ok(text) = clipboard.get_text() {
                    // 过滤空白内容：检查去除空白字符后是否为空
                    if !text.is_empty() && !text.trim().is_empty() {
                        crate::clipboard_history::add_to_history(text);
                        return Ok(());
                    }
                }
                // 尝试图片
                match clipboard.get_image() {
                    Ok(img) => {
                        let data_url = image_to_data_url(&img);
                        crate::clipboard_history::add_to_history(data_url);
                        Ok(())
                    }
                    Err(_) => Ok(()),
                }
            }
            Err(e) => Err(format!("获取剪贴板失败: {}", e)),
        }
    }
}

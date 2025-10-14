/// 拖拽排序服务 - 处理项目拖拽排序相关的业务逻辑
pub struct DragSortService;

impl DragSortService {
    /// 移动剪贴板项目到指定位置
    pub fn move_clipboard_item(from_index: usize, to_index: usize) -> Result<(), String> {
        crate::clipboard_history::move_item(from_index, to_index)
    }

    /// 移动常用文本到指定位置
    pub fn move_quick_text_item(item_id: String, to_index: usize) -> Result<(), String> {
        crate::quick_texts::move_quick_text_within_group(&item_id, to_index)
    }
}

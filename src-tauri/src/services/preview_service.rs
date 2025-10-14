/// 预览服务 - 处理预览窗口相关的业务逻辑
pub struct PreviewService;

impl PreviewService {
    /// 设置预览索引
    pub fn set_preview_index(index: usize) -> Result<(), String> {
        crate::preview_window::set_preview_index(index);
        Ok(())
    }

    /// 通知预览选项卡变更
    pub fn notify_preview_tab_change(tab: String, group_name: String) -> Result<(), String> {
        crate::preview_window::update_preview_source(tab, group_name)
    }

    /// 取消预览（不粘贴直接隐藏）
    pub fn cancel_preview() -> Result<(), String> {
        tokio::spawn(async {
            let _ = crate::preview_window::cancel_preview().await;
        });
        Ok(())
    }

    /// 获取主窗口状态
    pub fn get_main_window_state() -> Result<serde_json::Value, String> {
        crate::preview_window::get_main_window_state()
    }
}

use tauri::AppHandle;
use crate::state_manager;
use crate::settings;
use crate::edge_snap;

/// 贴边隐藏服务 - 处理贴边隐藏相关的业务逻辑
pub struct EdgeSnapService;

impl EdgeSnapService {
    /// 设置贴边隐藏功能开关
    pub fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
        use tauri::Manager;

        // 1. 更新状态
        state_manager::set_edge_snap_enabled(enabled);

        // 2. 保存设置
        Self::save_settings(enabled)?;

        // 3. 处理当前隐藏的窗口
        if !enabled {
            if let Some(window) = app.get_webview_window("main") {
                if edge_snap::is_window_edge_hidden() {
                    let _ = edge_snap::show_snapped_window(&window);
                }
            }
        }

        Ok(())
    }

    /// 获取贴边隐藏功能开关状态
    pub fn is_enabled() -> bool {
        state_manager::is_edge_snap_enabled()
    }

    /// 启动时恢复贴边状态
    pub fn restore_on_startup(app: &AppHandle) -> Result<(), String> {
        use tauri::Manager;
        
        if let Some(window) = app.get_webview_window("main") {
            edge_snap::restore_edge_snap_on_startup(&window)
        } else {
            Err("找不到主窗口".to_string())
        }
    }

    /// 保存设置到配置文件
    fn save_settings(enabled: bool) -> Result<(), String> {
        let mut settings = settings::get_global_settings();
        settings.edge_hide_enabled = enabled;
        settings::update_global_settings(settings)
            .map_err(|e| format!("保存设置失败: {}", e))
    }
}

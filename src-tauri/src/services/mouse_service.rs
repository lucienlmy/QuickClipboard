use crate::mouse_hook::{enable_mouse_monitoring, disable_mouse_monitoring};

/// 鼠标监听服务 - 处理鼠标监听相关的业务逻辑
pub struct MouseService;

impl MouseService {
    /// 启用鼠标监听
    pub fn enable_monitoring() -> Result<(), String> {
        #[cfg(windows)]
        {
            enable_mouse_monitoring();
        }
        Ok(())
    }

    /// 禁用鼠标监听
    pub fn disable_monitoring() -> Result<(), String> {
        #[cfg(windows)]
        {
            disable_mouse_monitoring();
        }
        Ok(())
    }
}

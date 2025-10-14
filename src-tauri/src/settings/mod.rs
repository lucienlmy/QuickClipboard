// 设置功能模块

// 子模块
mod model;              // 数据模型定义
mod storage;            // 文件存储管理
mod converter;          // JSON转换
mod migration;          // 数据迁移
mod state;              // 全局状态管理
mod settings_service;   // 业务逻辑服务
mod window;             // 设置窗口管理

// 公共导出 - 供全局 commands.rs 直接调用
pub use model::{AppSettings, StorageInfo};
pub use state::{
    get_global_settings, 
    update_global_settings, 
    get_data_directory,
    save_window_position,
    save_window_size
};
pub use settings_service::SettingsService;
pub use window::SettingsWindow;
pub use storage::SettingsStorage;
pub use converter::SettingsConverter;
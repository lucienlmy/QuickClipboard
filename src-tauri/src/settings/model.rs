use serde::{Deserialize, Serialize};

/// 应用设置数据模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    // === 基础设置 ===
    pub auto_start: bool,
    pub start_hidden: bool,
    pub run_as_admin: bool,
    pub show_startup_notification: bool,
    pub history_limit: u64,
    pub theme: String,
    pub opacity: f64,
    pub background_image_path: String,
    pub toggle_shortcut: String,
    pub number_shortcuts: bool,
    pub number_shortcuts_modifier: String,
    pub clipboard_monitor: bool,
    pub ignore_duplicates: bool,
    pub save_images: bool,
    pub show_image_preview: bool,

    // === 音效设置 ===
    pub sound_enabled: bool,
    pub sound_volume: f64,
    pub copy_sound_path: String,
    pub paste_sound_path: String,

    // === 截屏设置 ===
    pub screenshot_enabled: bool,
    pub screenshot_shortcut: String,
    pub screenshot_quality: u8,
    pub screenshot_auto_save: bool,
    pub screenshot_show_hints: bool,
    pub screenshot_element_detection: String,
    pub screenshot_magnifier_enabled: bool,
    pub screenshot_hints_enabled: bool,
    pub screenshot_color_include_format: bool,

    // === 预览窗口设置 ===
    pub preview_enabled: bool,
    pub preview_shortcut: String,
    pub preview_items_count: u32,
    pub preview_auto_paste: bool,
    pub preview_scroll_sound: bool,
    pub preview_scroll_sound_path: String,

    // === AI翻译设置 ===
    pub ai_translation_enabled: bool,
    pub ai_api_key: String,
    pub ai_model: String,
    pub ai_base_url: String,
    pub ai_target_language: String,
    pub ai_translate_on_copy: bool,
    pub ai_translate_on_paste: bool,
    pub ai_translation_prompt: String,
    pub ai_input_speed: u32,
    pub ai_newline_mode: String,
    pub ai_output_mode: String,

    // === 鼠标设置 ===
    pub mouse_middle_button_enabled: bool,
    pub mouse_middle_button_modifier: String,

    // === 动画设置 ===
    pub clipboard_animation_enabled: bool,

    // === 显示行为 ===
    pub auto_scroll_to_top_on_show: bool,

    // === 应用过滤设置 ===
    pub app_filter_enabled: bool,
    pub app_filter_mode: String,
    pub app_filter_list: Vec<String>,

    #[serde(default)]
    pub image_data_priority_apps: Vec<String>,

    // === 窗口设置 ===
    pub window_position_mode: String,
    pub remember_window_size: bool,
    pub saved_window_position: Option<(i32, i32)>,
    pub saved_window_size: Option<(u32, u32)>,

    // === 贴边隐藏设置 ===
    pub edge_hide_enabled: bool,
    pub edge_snap_position: Option<(i32, i32)>,
    pub edge_hide_offset: i32,

    // === 窗口行为设置 ===
    pub auto_focus_search: bool,
    pub sidebar_hover_delay: f64,

    // === 标题栏设置 ===
    pub title_bar_position: String,

    // === 格式设置 ===
    pub paste_with_format: bool,

    // === 快捷键设置 ===
    pub navigate_up_shortcut: String,
    pub navigate_down_shortcut: String,
    pub tab_left_shortcut: String,
    pub tab_right_shortcut: String,
    pub focus_search_shortcut: String,
    pub hide_window_shortcut: String,
    pub execute_item_shortcut: String,
    pub previous_group_shortcut: String,
    pub next_group_shortcut: String,
    pub toggle_pin_shortcut: String,

    // === 数据存储设置 ===
    pub custom_storage_path: Option<String>,
    pub use_custom_storage: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            // 基础设置
            auto_start: false,
            start_hidden: true,
            run_as_admin: false,
            show_startup_notification: true,
            history_limit: 100,
            theme: "light".to_string(),
            opacity: 0.9,
            background_image_path: String::new(),
            toggle_shortcut: "Win+V".to_string(),
            number_shortcuts: true,
            number_shortcuts_modifier: "Ctrl".to_string(),
            clipboard_monitor: true,
            ignore_duplicates: true,
            save_images: true,
            show_image_preview: false,

            // 音效设置
            sound_enabled: true,
            sound_volume: 50.0,
            copy_sound_path: String::new(),
            paste_sound_path: String::new(),

            // 截屏设置
            screenshot_enabled: true,
            screenshot_shortcut: "Ctrl+Shift+A".to_string(),
            screenshot_quality: 85,
            screenshot_auto_save: true,
            screenshot_show_hints: true,
            screenshot_element_detection: "all".to_string(),
            screenshot_magnifier_enabled: true,
            screenshot_hints_enabled: true,
            screenshot_color_include_format: true,

            // 预览窗口设置
            preview_enabled: true,
            preview_shortcut: "Ctrl+`".to_string(),
            preview_items_count: 5,
            preview_auto_paste: true,
            preview_scroll_sound: true,
            preview_scroll_sound_path: "sounds/roll.mp3".to_string(),

            // AI翻译设置
            ai_translation_enabled: false,
            ai_api_key: String::new(),
            ai_model: "Qwen/Qwen2-7B-Instruct".to_string(),
            ai_base_url: "https://api.siliconflow.cn/v1".to_string(),
            ai_target_language: "auto".to_string(),
            ai_translate_on_copy: false,
            ai_translate_on_paste: true,
            ai_translation_prompt: "请将以下文本翻译成{target_language}，严格保持原文的所有格式、换行符、段落结构和空白字符，只返回翻译结果，不要添加任何解释或修改格式：".to_string(),
            ai_input_speed: 50,
            ai_newline_mode: "auto".to_string(),
            ai_output_mode: "stream".to_string(),

            // 鼠标设置
            mouse_middle_button_enabled: true,
            mouse_middle_button_modifier: "None".to_string(),

            // 动画设置
            clipboard_animation_enabled: true,

            // 显示行为
            auto_scroll_to_top_on_show: false,

            // 应用过滤设置
            app_filter_enabled: false,
            app_filter_mode: "blacklist".to_string(),
            app_filter_list: vec![],
            image_data_priority_apps: vec![],

            // 窗口设置
            window_position_mode: "smart".to_string(),
            remember_window_size: false,
            saved_window_position: None,
            saved_window_size: None,

            // 贴边隐藏设置
            edge_hide_enabled: true,
            edge_snap_position: None,
            edge_hide_offset: 3,

            // 窗口行为设置
            auto_focus_search: false,
            sidebar_hover_delay: 0.5,

            // 标题栏设置
            title_bar_position: "top".to_string(),

            // 格式设置
            paste_with_format: true,

            // 快捷键设置
            navigate_up_shortcut: "ArrowUp".to_string(),
            navigate_down_shortcut: "ArrowDown".to_string(),
            tab_left_shortcut: "ArrowLeft".to_string(),
            tab_right_shortcut: "ArrowRight".to_string(),
            focus_search_shortcut: "Tab".to_string(),
            hide_window_shortcut: "Escape".to_string(),
            execute_item_shortcut: "Ctrl+Enter".to_string(),
            previous_group_shortcut: "Ctrl+ArrowUp".to_string(),
            next_group_shortcut: "Ctrl+ArrowDown".to_string(),
            toggle_pin_shortcut: "Ctrl+P".to_string(),

            // 数据存储设置
            custom_storage_path: None,
            use_custom_storage: false,
        }
    }
}

/// 存储信息
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageInfo {
    pub current_path: String,
    pub default_path: String,
    pub is_default: bool,
    pub custom_path: Option<String>,
    pub is_portable: bool,
    pub portable_path: Option<String>,
}

impl AppSettings {
    /// 获取数据存储目录
    pub fn get_data_directory(&self) -> Result<std::path::PathBuf, String> {
        super::storage::SettingsStorage::get_data_directory(self)
    }

    /// 获取默认数据目录
    pub fn get_default_data_directory() -> Result<std::path::PathBuf, String> {
        super::storage::SettingsStorage::get_default_data_directory()
    }

    /// 转换为JSON
    pub fn to_json(&self) -> serde_json::Value {
        super::converter::SettingsConverter::to_json(self)
    }

    /// 获取存储信息
    pub fn get_storage_info(&self) -> Result<StorageInfo, String> {
        super::migration::SettingsMigration::get_storage_info(self)
    }

    /// 设置自定义存储路径
    pub async fn set_custom_storage_path(
        &mut self,
        new_path: String,
        app: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        super::migration::SettingsMigration::set_custom_storage_path(self, new_path, app).await
    }

    /// 重置为默认存储位置
    pub async fn reset_to_default_storage(
        &mut self,
        app: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        super::migration::SettingsMigration::reset_to_default_storage(self, app).await
    }
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    // 基础设置
    pub auto_start: bool,
    pub start_hidden: bool,
    pub show_startup_notification: bool,
    #[serde(alias = "history_limit")]
    pub history_limit: u64,
    pub language: String,
    pub theme: String,
    pub dark_theme_style: String,
    pub opacity: f64,
    pub background_image_path: String,
    pub toggle_shortcut: String,
    pub number_shortcuts: bool,
    pub number_shortcuts_modifier: String,
    pub clipboard_monitor: bool,
    pub ignore_duplicates: bool,
    pub save_images: bool,

    // 音效设置
    pub sound_enabled: bool,
    pub sound_volume: f64,
    pub copy_sound_path: String,
    pub paste_sound_path: String,

    // 截屏设置
    pub screenshot_enabled: bool,
    pub screenshot_shortcut: String,
    pub screenshot_quality: u8,
    pub screenshot_auto_save: bool,
    pub screenshot_show_hints: bool,
    pub screenshot_element_detection: String,
    pub screenshot_magnifier_enabled: bool,
    pub screenshot_hints_enabled: bool,
    pub screenshot_color_include_format: bool,

    // 预览窗口设置
    pub quickpaste_enabled: bool,
    pub quickpaste_shortcut: String,
    pub quickpaste_scroll_sound: bool,
    pub quickpaste_scroll_sound_path: String,
    pub quickpaste_window_width: u32,
    pub quickpaste_window_height: u32,

    // AI翻译设置
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

    // 鼠标设置
    pub mouse_middle_button_enabled: bool,
    pub mouse_middle_button_modifier: String,

    // 动画设置
    pub clipboard_animation_enabled: bool,

    // 显示行为
    pub auto_scroll_to_top_on_show: bool,
    pub auto_clear_search: bool,

    // 应用过滤设置
    pub app_filter_enabled: bool,
    pub app_filter_mode: String,
    pub app_filter_list: Vec<String>,

    // 窗口设置
    pub window_position_mode: String,
    pub remember_window_size: bool,
    pub saved_window_position: Option<(i32, i32)>,
    pub saved_window_size: Option<(u32, u32)>,

    // 贴边隐藏设置
    pub edge_hide_enabled: bool,
    pub edge_snap_position: Option<(i32, i32)>,
    pub edge_hide_offset: i32,

    // 窗口行为设置
    pub auto_focus_search: bool,

    // 标题栏设置
    pub title_bar_position: String,

    // 格式设置
    pub paste_with_format: bool,
    
    pub paste_to_top: bool,

    // 快捷键设置
    pub hotkeys_enabled: bool,
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
    pub toggle_clipboard_monitor_shortcut: String,
    pub toggle_paste_with_format_shortcut: String,

    // 数据存储设置
    #[serde(alias = "custom_storage_path")]
    pub custom_storage_path: Option<String>,
    #[serde(alias = "use_custom_storage")]
    pub use_custom_storage: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_start: false,
            start_hidden: true,
            show_startup_notification: true,
            history_limit: 100,
            language: "zh-CN".to_string(),
            theme: "light".to_string(),
            dark_theme_style: "classic".to_string(),
            opacity: 0.9,
            background_image_path: String::new(),
            toggle_shortcut: "Alt+V".to_string(),
            number_shortcuts: true,
            number_shortcuts_modifier: "Ctrl".to_string(),
            clipboard_monitor: true,
            ignore_duplicates: true,
            save_images: true,

            sound_enabled: true,
            sound_volume: 50.0,
            copy_sound_path: String::new(),
            paste_sound_path: String::new(),

            screenshot_enabled: true,
            screenshot_shortcut: "Ctrl+Shift+A".to_string(),
            screenshot_quality: 85,
            screenshot_auto_save: true,
            screenshot_show_hints: true,
            screenshot_element_detection: "all".to_string(),
            screenshot_magnifier_enabled: true,
            screenshot_hints_enabled: true,
            screenshot_color_include_format: true,

            quickpaste_enabled: true,
            quickpaste_shortcut: "Ctrl+`".to_string(),
            quickpaste_scroll_sound: true,
            quickpaste_scroll_sound_path: "sounds/roll.mp3".to_string(),
            quickpaste_window_width: 300,
            quickpaste_window_height: 400,

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

            mouse_middle_button_enabled: false,
            mouse_middle_button_modifier: "None".to_string(),

            clipboard_animation_enabled: true,

            auto_scroll_to_top_on_show: false,
            auto_clear_search: false,

            app_filter_enabled: false,
            app_filter_mode: "blacklist".to_string(),
            app_filter_list: vec![],

            window_position_mode: "smart".to_string(),
            remember_window_size: false,
            saved_window_position: None,
            saved_window_size: None,

            edge_hide_enabled: true,
            edge_snap_position: None,
            edge_hide_offset: 3,

            auto_focus_search: false,

            title_bar_position: "top".to_string(),

            paste_with_format: true,
            paste_to_top: false,

            hotkeys_enabled: true,
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
            toggle_clipboard_monitor_shortcut: "Ctrl+Shift+Z".to_string(),
            toggle_paste_with_format_shortcut: "Ctrl+Shift+X".to_string(),

            custom_storage_path: None,
            use_custom_storage: false,
        }
    }
}


use dirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    // 基础设置
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

    // 预览窗口设置
    pub preview_enabled: bool,
    pub preview_shortcut: String,
    pub preview_items_count: u32,
    pub preview_auto_paste: bool,
    pub preview_scroll_sound: bool,
    pub preview_scroll_sound_path: String,

    // AI翻译设置
    pub ai_translation_enabled: bool,
    pub ai_api_key: String,
    pub ai_model: String,
    pub ai_base_url: String,
    pub ai_target_language: String,
    pub ai_translate_on_copy: bool,
    pub ai_translate_on_paste: bool,
    pub ai_translation_prompt: String,
    pub ai_input_speed: u32,     // 输入速度，字符/秒
    pub ai_newline_mode: String, // 换行符处理模式：auto, enter, shift_enter, unicode
    pub ai_output_mode: String,  // 输出模式：stream（流式输出）, paste（直接粘贴）

    // 鼠标设置
    pub mouse_middle_button_enabled: bool,
    pub mouse_middle_button_modifier: String,

    // 动画设置
    pub clipboard_animation_enabled: bool, // 剪贴板显示/隐藏动画开关

    // 显示行为
    pub auto_scroll_to_top_on_show: bool, // 窗口显示后是否自动滚动到顶部

    // 应用黑白名单设置
    pub app_filter_enabled: bool,     // 是否启用应用过滤
    pub app_filter_mode: String,      // 过滤模式：whitelist(白名单) 或 blacklist(黑名单)
    pub app_filter_list: Vec<String>, // 应用列表（进程名或窗口标题关键词）

    #[serde(default)]
    pub image_data_priority_apps: Vec<String>, // 优先使用图像数据粘贴的应用列表

    // 窗口位置和大小设置默认值
    pub window_position_mode: String, // 窗口位置模式：smart(智能位置) 或 remember(记住位置)
    pub remember_window_size: bool,   // 是否记住窗口大小
    pub saved_window_position: Option<(i32, i32)>, // 保存的极口位置 (x, y)
    pub saved_window_size: Option<(u32, u32)>, // 保存的窗口大小 (width, height)

    // 贴边隐藏设置
    pub edge_hide_enabled: bool, // 是否启用贴边隐藏功能
    pub edge_snap_position: Option<(i32, i32)>, // 贴边隐藏时的窗口位置

    // 窗口行为设置
    pub auto_focus_search: bool, // 窗口显示时是否自动聚焦搜索框
    pub sidebar_hover_delay: f64, // 侧边栏悬停延迟时间（秒）

    // 标题栏位置设置
    pub title_bar_position: String,   // 标题栏位置：top(上), bottom(下), left(左), right(右)

    // 格式设置
    pub paste_with_format: bool,      // 是否带格式粘贴和显示，true=带格式，false=纯文本

    // 剪贴板窗口快捷键设置
    pub navigate_up_shortcut: String,      // 向上导航快捷键
    pub navigate_down_shortcut: String,    // 向下导航快捷键
    pub tab_left_shortcut: String,         // 左切换标签快捷键
    pub tab_right_shortcut: String,        // 右切换标签快捷键
    pub focus_search_shortcut: String,     // 聚焦搜索框快捷键
    pub hide_window_shortcut: String,      // 隐藏窗口快捷键
    pub execute_item_shortcut: String,     // 执行选中项目快捷键
    pub previous_group_shortcut: String,   // 上一个分组快捷键
    pub next_group_shortcut: String,       // 下一个分组快捷键
    pub toggle_pin_shortcut: String,       // 切换固定状态快捷键

    // 数据存储设置
    pub custom_storage_path: Option<String>, // 自定义存储路径，None表示使用默认位置
    pub use_custom_storage: bool,            // 是否使用自定义存储路径
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            // 基础设置默认值
            auto_start: false,
            start_hidden: true,
            run_as_admin: false,
            show_startup_notification: true,
            history_limit: 100,
            theme: "light".to_string(),
            opacity: 0.9,
            background_image_path: "".to_string(),
            toggle_shortcut: "Win+V".to_string(),
            number_shortcuts: true,
            number_shortcuts_modifier: "Ctrl".to_string(),
            clipboard_monitor: true,
            ignore_duplicates: true,
            save_images: true,
            show_image_preview: false,

            // 音效设置默认值
            sound_enabled: true,
            sound_volume: 50.0,
            copy_sound_path: "".to_string(),
            paste_sound_path: "".to_string(),

            // 截屏设置默认值
            screenshot_enabled: true,
            screenshot_shortcut: "Ctrl+Shift+A".to_string(),
            screenshot_quality: 85,
            screenshot_auto_save: true,
            screenshot_show_hints: true,

            // 预览窗口设置默认值
            preview_enabled: true,
            preview_shortcut: "Ctrl+`".to_string(),
            preview_items_count: 5,
            preview_auto_paste: true,
            preview_scroll_sound: true,
            preview_scroll_sound_path: "sounds/roll.mp3".to_string(),

            // AI翻译设置默认值
            ai_translation_enabled: false,
            ai_api_key: "".to_string(),
            ai_model: "Qwen/Qwen2-7B-Instruct".to_string(),
            ai_base_url: "https://api.siliconflow.cn/v1".to_string(),
            ai_target_language: "auto".to_string(),
            ai_translate_on_copy: false,
            ai_translate_on_paste: true,
            ai_translation_prompt:
                "请将以下文本翻译成{target_language}，严格保持原文的所有格式、换行符、段落结构和空白字符，只返回翻译结果，不要添加任何解释或修改格式："
                    .to_string(),
            ai_input_speed: 50,                // 50字符/秒
            ai_newline_mode: "auto".to_string(), // 默认使用自动模式，兼容性最好
            ai_output_mode: "stream".to_string(), // 默认使用流式输出

            // 鼠标设置默认值
            mouse_middle_button_enabled: true, // 默认启用鼠标中键显示剪贴板
            mouse_middle_button_modifier: "None".to_string(), // 默认单独中键，无修饰键

            // 动画设置默认值
            clipboard_animation_enabled: true, // 默认启用剪贴板显示/隐藏动画

            // 显示行为默认值
            auto_scroll_to_top_on_show: false,

            // 应用黑白名单设置默认值
            app_filter_enabled: false,                  // 默认不启用应用过滤
            app_filter_mode: "blacklist".to_string(), // 默认使用黑名单模式
            app_filter_list: vec![],                    // 默认空列表
            image_data_priority_apps: vec![],           // 默认没有特殊应用

            // 窗口极口和大小设置默认值
            window_position_mode: "smart".to_string(), // 默认使用智能位置
            remember_window_size: false,               // 默认不记住窗口大小
            saved_window_position: None,               // 初始没有保存的位置
            saved_window_size: None,                   // 初始没有保存的大小
            
            // 贴边隐藏设置默认值
            edge_hide_enabled: true,                   // 默认启用贴边隐藏功能
            edge_snap_position: None,                  // 默认没有保存的贴边位置

            // 窗口行为设置默认值
            auto_focus_search: false,                  // 默认不自动聚焦搜索框
            sidebar_hover_delay: 0.5,                  // 默认0.5秒悬停延迟

            // 标题栏位置设置默认值
            title_bar_position: "top".to_string(),    // 默认标题栏位置在上方
            
            // 格式设置默认值
            paste_with_format: true,                   // 默认带格式粘贴

            // 剪贴板窗口快捷键设置默认值
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

            // 数据存储设置默认值
            custom_storage_path: None,                 // 默认使用系统AppData目录
            use_custom_storage: false,                 // 默认不使用自定义存储路径
        }
    }
}

impl AppSettings {
    /// 获取默认的应用数据目录
    pub fn get_default_data_directory() -> Result<PathBuf, String> {
        let app_data_dir = dirs::data_local_dir()
            .ok_or_else(|| "无法获取本地数据目录".to_string())?
            .join("quickclipboard");

        fs::create_dir_all(&app_data_dir).map_err(|e| format!("创建应用数据目录失败: {}", e))?;
        Ok(app_data_dir)
    }

    /// 获取设置文件路径（总是在默认位置）
    fn get_settings_file_path() -> Result<PathBuf, String> {
        let config_dir = Self::get_default_data_directory()?;
        Ok(config_dir.join("settings.json"))
    }

    /// 根据当前设置获取数据存储目录
    pub fn get_data_directory(&self) -> Result<PathBuf, String> {
        if self.use_custom_storage {
            if let Some(custom_path) = &self.custom_storage_path {
                let path = PathBuf::from(custom_path);
                fs::create_dir_all(&path).map_err(|e| format!("创建自定义存储目录失败: {}", e))?;
                return Ok(path);
            }
        }
        Self::get_default_data_directory()
    }

    /// 从文件加载设置
    pub fn load() -> Self {
        match Self::load_from_file() {
            Ok(settings) => settings,
            Err(_e) => {
                let default_settings = Self::default();
                // 自动保存默认设置到文件
                let _ = default_settings.save();
                default_settings
            }
        }
    }

    /// 从文件加载设置（内部方法）
    fn load_from_file() -> Result<Self, String> {
        let settings_path = Self::get_settings_file_path()?;

        if !settings_path.exists() {
            return Err("设置文件不存在".to_string());
        }

        let content =
            fs::read_to_string(&settings_path).map_err(|e| format!("读取设置文件失败: {}", e))?;

        let settings: AppSettings =
            serde_json::from_str(&content).map_err(|e| format!("解析设置文件失败: {}", e))?;

        Ok(settings)
    }

    /// 保存设置到文件
    pub fn save(&self) -> Result<(), String> {
        let settings_path = Self::get_settings_file_path()?;

        let content =
            serde_json::to_string_pretty(self).map_err(|e| format!("序列化设置失败: {}", e))?;

        fs::write(&settings_path, content).map_err(|e| format!("写入设置文件失败: {}", e))?;

        // println!("设置已保存到: {:?}", settings_path);
        Ok(())
    }

    /// 转换为JSON值（用于前端）
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "autoStart": self.auto_start,
            "startHidden": self.start_hidden,
            "runAsAdmin": self.run_as_admin,
            "showStartupNotification": self.show_startup_notification,
            "historyLimit": self.history_limit,
            "theme": self.theme,
            "opacity": self.opacity,
            "backgroundImagePath": self.background_image_path,
            "toggleShortcut": self.toggle_shortcut,
            "numberShortcuts": self.number_shortcuts,
            "numberShortcutsModifier": self.number_shortcuts_modifier,
            "clipboardMonitor": self.clipboard_monitor,
            "ignoreDuplicates": self.ignore_duplicates,
            "saveImages": self.save_images,
            "showImagePreview": self.show_image_preview,
            "soundEnabled": self.sound_enabled,
            "soundVolume": self.sound_volume,
            "copySoundPath": self.copy_sound_path,
            "pasteSoundPath": self.paste_sound_path,
            "screenshot_enabled": self.screenshot_enabled,
            "screenshot_shortcut": self.screenshot_shortcut,
            "screenshot_quality": self.screenshot_quality,
            "screenshot_auto_save": self.screenshot_auto_save,
            "screenshot_show_hints": self.screenshot_show_hints,
            "previewEnabled": self.preview_enabled,
            "previewShortcut": self.preview_shortcut,
            "previewItemsCount": self.preview_items_count,
            "previewAutoPaste": self.preview_auto_paste,
            "previewScrollSound": self.preview_scroll_sound,
            "previewScrollSoundPath": self.preview_scroll_sound_path,
            "aiTranslationEnabled": self.ai_translation_enabled,
            "aiApiKey": self.ai_api_key,
            "aiModel": self.ai_model,
            "aiBaseUrl": self.ai_base_url,
            "aiTargetLanguage": self.ai_target_language,
            "aiTranslateOnCopy": self.ai_translate_on_copy,
            "aiTranslateOnPaste": self.ai_translate_on_paste,
            "aiTranslationPrompt": self.ai_translation_prompt,
            "aiInputSpeed": self.ai_input_speed,
            "aiNewlineMode": self.ai_newline_mode,
            "aiOutputMode": self.ai_output_mode,
            "mouseMiddleButtonEnabled": self.mouse_middle_button_enabled,
            "mouseMiddleButtonModifier": self.mouse_middle_button_modifier,
            "clipboardAnimationEnabled": self.clipboard_animation_enabled,
            "autoScrollToTopOnShow": self.auto_scroll_to_top_on_show,
            "windowPositionMode":self.window_position_mode,
            "rememberWindowSize":self.remember_window_size,
            "savedWindowPosition":self.saved_window_position,
            "savedWindowSize":self.saved_window_size,
            "appFilterEnabled":self.app_filter_enabled,
            "appFilterMode":self.app_filter_mode,
            "appFilterList":self.app_filter_list,
            "titleBarPosition":self.title_bar_position,
            "edgeHideEnabled":self.edge_hide_enabled,
            "autoFocusSearch":self.auto_focus_search,
            "sidebarHoverDelay":self.sidebar_hover_delay,
            "pasteWithFormat":self.paste_with_format,
            "imageDataPriorityApps":self.image_data_priority_apps,
            "navigateUpShortcut":self.navigate_up_shortcut,
            "navigateDownShortcut":self.navigate_down_shortcut,
            "tabLeftShortcut":self.tab_left_shortcut,
            "tabRightShortcut":self.tab_right_shortcut,
            "focusSearchShortcut":self.focus_search_shortcut,
            "hideWindowShortcut":self.hide_window_shortcut,
            "executeItemShortcut":self.execute_item_shortcut,
            "previousGroupShortcut":self.previous_group_shortcut,
            "nextGroupShortcut":self.next_group_shortcut,
            "togglePinShortcut":self.toggle_pin_shortcut,
        })
    }

    /// 从JSON值更新设置（来自前端）
    pub fn update_from_json(&mut self, json: &serde_json::Value) {
        if let Some(v) = json.get("autoStart").and_then(|v| v.as_bool()) {
            self.auto_start = v;
        }
        if let Some(v) = json.get("startHidden").and_then(|v| v.as_bool()) {
            self.start_hidden = v;
        }
        if let Some(v) = json.get("runAsAdmin").and_then(|v| v.as_bool()) {
            self.run_as_admin = v;
        }
        if let Some(v) = json
            .get("showStartupNotification")
            .and_then(|v| v.as_bool())
        {
            self.show_startup_notification = v;
        }
        if let Some(v) = json.get("historyLimit").and_then(|v| v.as_u64()) {
            self.history_limit = v;
        }
        if let Some(v) = json.get("theme").and_then(|v| v.as_str()) {
            self.theme = v.to_string();
        }
        if let Some(v) = json.get("opacity").and_then(|v| v.as_f64()) {
            self.opacity = v;
        }
        if let Some(v) = json.get("backgroundImagePath").and_then(|v| v.as_str()) {
            self.background_image_path = v.to_string();
        }
        if let Some(v) = json.get("toggleShortcut").and_then(|v| v.as_str()) {
            self.toggle_shortcut = v.to_string();
        }
        if let Some(v) = json.get("numberShortcuts").and_then(|v| v.as_bool()) {
            self.number_shortcuts = v;
        }
        if let Some(v) = json.get("numberShortcutsModifier").and_then(|v| v.as_str()) {
            self.number_shortcuts_modifier = v.to_string();
        }
        if let Some(v) = json.get("clipboardMonitor").and_then(|v| v.as_bool()) {
            self.clipboard_monitor = v;
        }
        if let Some(v) = json.get("ignoreDuplicates").and_then(|v| v.as_bool()) {
            self.ignore_duplicates = v;
        }
        if let Some(v) = json.get("saveImages").and_then(|v| v.as_bool()) {
            self.save_images = v;
        }
        if let Some(v) = json.get("showImagePreview").and_then(|v| v.as_bool()) {
            self.show_image_preview = v;
        }

        // 音效设置
        if let Some(v) = json.get("soundEnabled").and_then(|v| v.as_bool()) {
            self.sound_enabled = v;
        }
        if let Some(v) = json.get("soundVolume").and_then(|v| v.as_f64()) {
            self.sound_volume = v;
        }
        if let Some(v) = json.get("copySoundPath").and_then(|v| v.as_str()) {
            self.copy_sound_path = v.to_string();
        }
        if let Some(v) = json.get("pasteSoundPath").and_then(|v| v.as_str()) {
            self.paste_sound_path = v.to_string();
        }

        // 截屏设置
        if let Some(v) = json.get("screenshot_enabled").and_then(|v| v.as_bool()) {
            self.screenshot_enabled = v;
        }
        if let Some(v) = json.get("screenshot_shortcut").and_then(|v| v.as_str()) {
            self.screenshot_shortcut = v.to_string();
        }
        if let Some(v) = json.get("screenshot_quality").and_then(|v| v.as_u64()) {
            self.screenshot_quality = v as u8;
        }
        if let Some(v) = json.get("screenshot_auto_save").and_then(|v| v.as_bool()) {
            self.screenshot_auto_save = v;
        }
        if let Some(v) = json.get("screenshot_show_hints").and_then(|v| v.as_bool()) {
            self.screenshot_show_hints = v;
        }

        // 预览窗口设置
        if let Some(v) = json.get("previewEnabled").and_then(|v| v.as_bool()) {
            self.preview_enabled = v;
        }
        if let Some(v) = json.get("previewShortcut").and_then(|v| v.as_str()) {
            self.preview_shortcut = v.to_string();
        }
        if let Some(v) = json.get("previewItemsCount").and_then(|v| v.as_u64()) {
            self.preview_items_count = v as u32;
        }
        if let Some(v) = json.get("previewAutoPaste").and_then(|v| v.as_bool()) {
            self.preview_auto_paste = v;
        }
        if let Some(v) = json.get("previewScrollSound").and_then(|v| v.as_bool()) {
            self.preview_scroll_sound = v;
        }
        if let Some(v) = json.get("previewScrollSoundPath").and_then(|v| v.as_str()) {
            self.preview_scroll_sound_path = v.to_string();
        }

        // AI翻译设置
        if let Some(v) = json.get("aiTranslationEnabled").and_then(|v| v.as_bool()) {
            self.ai_translation_enabled = v;
        }
        if let Some(v) = json.get("aiApiKey").and_then(|v| v.as_str()) {
            self.ai_api_key = v.to_string();
        }
        if let Some(v) = json.get("aiModel").and_then(|v| v.as_str()) {
            self.ai_model = v.to_string();
        }
        if let Some(v) = json.get("aiBaseUrl").and_then(|v| v.as_str()) {
            self.ai_base_url = v.to_string();
        }
        if let Some(v) = json.get("aiTargetLanguage").and_then(|v| v.as_str()) {
            self.ai_target_language = v.to_string();
        }
        if let Some(v) = json.get("aiTranslateOnCopy").and_then(|v| v.as_bool()) {
            self.ai_translate_on_copy = v;
        }
        if let Some(v) = json.get("aiTranslateOnPaste").and_then(|v| v.as_bool()) {
            self.ai_translate_on_paste = v;
        }
        if let Some(v) = json.get("aiTranslationPrompt").and_then(|v| v.as_str()) {
            self.ai_translation_prompt = v.to_string();
        }
        if let Some(v) = json.get("aiInputSpeed").and_then(|v| v.as_u64()) {
            self.ai_input_speed = v as u32;
        }
        if let Some(v) = json.get("aiNewlineMode").and_then(|v| v.as_str()) {
            self.ai_newline_mode = v.to_string();
        }
        if let Some(v) = json.get("aiOutputMode").and_then(|v| v.as_str()) {
            self.ai_output_mode = v.to_string();
        }
        if let Some(v) = json
            .get("mouseMiddleButtonEnabled")
            .and_then(|v| v.as_bool())
        {
            self.mouse_middle_button_enabled = v;
        }
        if let Some(v) = json
            .get("mouseMiddleButtonModifier")
            .and_then(|v| v.as_str())
        {
            self.mouse_middle_button_modifier = v.to_string();
        }
        if let Some(v) = json
            .get("clipboardAnimationEnabled")
            .and_then(|v| v.as_bool())
        {
            self.clipboard_animation_enabled = v;
        }
        if let Some(v) = json.get("autoScrollToTopOnShow").and_then(|v| v.as_bool()) {
            self.auto_scroll_to_top_on_show = v;
        }
        if let Some(v) = json.get("windowPositionMode").and_then(|v| v.as_str()) {
            self.window_position_mode = v.to_string();
        }
        if let Some(v) = json.get("rememberWindowSize").and_then(|v| v.as_bool()) {
            self.remember_window_size = v;
        }
        if let Some(v) = json.get("savedWindowPosition").and_then(|v| v.as_array()) {
            if v.len() == 2 {
                if let (Some(x), Some(y)) = (v[0].as_i64(), v[1].as_i64()) {
                    self.saved_window_position = Some((x as i32, y as i32));
                }
            }
        }
        if let Some(v) = json.get("savedWindowSize").and_then(|v| v.as_array()) {
            if v.len() == 2 {
                if let (Some(w), Some(h)) = (v[0].as_u64(), v[1].as_u64()) {
                    self.saved_window_size = Some((w as u32, h as u32));
                }
            }
        }

        // 应用黑白名单设置
        if let Some(v) = json.get("appFilterEnabled").and_then(|v| v.as_bool()) {
            self.app_filter_enabled = v;
        }
        if let Some(v) = json.get("appFilterMode").and_then(|v| v.as_str()) {
            self.app_filter_mode = v.to_string();
        }
        if let Some(v) = json.get("appFilterList").and_then(|v| v.as_array()) {
            self.app_filter_list = v
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect();
        }

        // 标题栏位置设置
        if let Some(v) = json.get("titleBarPosition").and_then(|v| v.as_str()) {
            self.title_bar_position = v.to_string();
        }

        // 贴边隐藏设置
        if let Some(v) = json.get("edgeHideEnabled").and_then(|v| v.as_bool()) {
            self.edge_hide_enabled = v;
        }

        // 窗口行为设置
        if let Some(v) = json.get("autoFocusSearch").and_then(|v| v.as_bool()) {
            self.auto_focus_search = v;
        }
        if let Some(v) = json.get("sidebarHoverDelay").and_then(|v| v.as_f64()) {
            // 确保延迟时间在有效范围内 (0-10秒)
            self.sidebar_hover_delay = v.max(0.0).min(10.0);
        }

        // 格式设置
        if let Some(v) = json.get("pasteWithFormat").and_then(|v| v.as_bool()) {
            self.paste_with_format = v;
        }
        if let Some(v) = json.get("imageDataPriorityApps").and_then(|v| v.as_array()) {
            self.image_data_priority_apps = v
                .iter()
                .filter_map(|item| item.as_str())
                .map(|s| s.to_string())
                .collect();
        }

        // 剪贴板窗口快捷键设置
        if let Some(v) = json.get("navigateUpShortcut").and_then(|v| v.as_str()) {
            self.navigate_up_shortcut = v.to_string();
        }
        if let Some(v) = json.get("navigateDownShortcut").and_then(|v| v.as_str()) {
            self.navigate_down_shortcut = v.to_string();
        }
        if let Some(v) = json.get("tabLeftShortcut").and_then(|v| v.as_str()) {
            self.tab_left_shortcut = v.to_string();
        }
        if let Some(v) = json.get("tabRightShortcut").and_then(|v| v.as_str()) {
            self.tab_right_shortcut = v.to_string();
        }
        if let Some(v) = json.get("focusSearchShortcut").and_then(|v| v.as_str()) {
            self.focus_search_shortcut = v.to_string();
        }
        if let Some(v) = json.get("hideWindowShortcut").and_then(|v| v.as_str()) {
            self.hide_window_shortcut = v.to_string();
        }
        if let Some(v) = json.get("executeItemShortcut").and_then(|v| v.as_str()) {
            self.execute_item_shortcut = v.to_string();
        }
        if let Some(v) = json.get("previousGroupShortcut").and_then(|v| v.as_str()) {
            self.previous_group_shortcut = v.to_string();
        }
        if let Some(v) = json.get("nextGroupShortcut").and_then(|v| v.as_str()) {
            self.next_group_shortcut = v.to_string();
        }
        if let Some(v) = json.get("togglePinShortcut").and_then(|v| v.as_str()) {
            self.toggle_pin_shortcut = v.to_string();
        }
    }
}

// 全局设置实例
use once_cell::sync::Lazy;
use std::sync::{Arc, Mutex};

static GLOBAL_SETTINGS: Lazy<Arc<Mutex<AppSettings>>> =
    Lazy::new(|| Arc::new(Mutex::new(AppSettings::load())));

/// 获取全局设置
pub fn get_global_settings() -> AppSettings {
    GLOBAL_SETTINGS.lock().unwrap().clone()
}

/// 更新全局设置
pub fn update_global_settings(settings: AppSettings) -> Result<(), String> {
    {
        let mut global_settings = GLOBAL_SETTINGS.lock().unwrap();
        *global_settings = settings.clone();
    }

    // 保存到文件
    settings.save()?;

    Ok(())
}

/// 从JSON更新全局设置
pub fn update_global_settings_from_json(json: &serde_json::Value) -> Result<(), String> {
    let mut settings = get_global_settings();
    settings.update_from_json(json);
    update_global_settings(settings)
}

/// 获取当前数据存储目录（全局函数）
pub fn get_data_directory() -> Result<PathBuf, String> {
    let settings = get_global_settings();
    settings.get_data_directory()
}

impl AppSettings {
    /// 设置自定义存储路径并迁移数据
    pub async fn set_custom_storage_path(
        &mut self,
        new_path: String,
        app: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        let new_dir = PathBuf::from(&new_path);

        // 验证新路径
        if !new_dir.exists() {
            fs::create_dir_all(&new_dir).map_err(|e| format!("创建新存储目录失败: {}", e))?;
        }

        if !new_dir.is_dir() {
            return Err("指定的路径不是有效的目录".to_string());
        }

        // 获取当前存储目录
        let current_dir = self.get_data_directory()?;

        // 如果新路径与当前路径相同，无需迁移
        if current_dir == new_dir {
            return Ok(());
        }

        // 先执行数据迁移
        crate::data_migration::DataMigrationService::migrate_data(&current_dir, &new_dir, None)
            .await?;

        // 更新设置
        self.custom_storage_path = Some(new_path);
        self.use_custom_storage = true;

        // 立即更新全局设置缓存，确保 get_data_directory() 返回新路径
        {
            let mut global_settings = GLOBAL_SETTINGS.lock().unwrap();
            *global_settings = self.clone();
        }

        // 设置更新后重新初始化数据库并刷新窗口
        crate::database::reinitialize_database()
            .map_err(|e| format!("重新初始化数据库失败: {}", e))?;

        if let Some(app_handle) = app {
            println!("刷新所有窗口以显示新位置的数据...");
            if let Err(e) = crate::commands::refresh_all_windows(app_handle) {
                println!("刷新窗口失败: {}", e);
            }
        }

        Ok(())
    }

    /// 重置为默认存储位置
    pub async fn reset_to_default_storage(
        &mut self,
        app: Option<tauri::AppHandle>,
    ) -> Result<(), String> {
        let default_dir = Self::get_default_data_directory()?;
        let current_dir = self.get_data_directory()?;

        // 如果当前已经是默认位置，无需操作
        if current_dir == default_dir {
            return Ok(());
        }

        // 先执行数据迁移
        crate::data_migration::DataMigrationService::migrate_data(&current_dir, &default_dir, None)
            .await?;

        // 更新设置
        self.custom_storage_path = None;
        self.use_custom_storage = false;

        // 立即更新全局设置缓存，确保 get_data_directory() 返回新路径
        {
            let mut global_settings = GLOBAL_SETTINGS.lock().unwrap();
            *global_settings = self.clone();
        }

        // 设置更新后重新初始化数据库并刷新窗口
        crate::database::reinitialize_database()
            .map_err(|e| format!("重新初始化数据库失败: {}", e))?;

        if let Some(app_handle) = app {
            println!("刷新所有窗口以显示新位置的数据...");
            if let Err(e) = crate::commands::refresh_all_windows(app_handle) {
                println!("刷新窗口失败: {}", e);
            }
        }

        Ok(())
    }

    /// 获取存储信息
    pub fn get_storage_info(&self) -> Result<StorageInfo, String> {
        let current_dir = self.get_data_directory()?;
        let default_dir = Self::get_default_data_directory()?;

        Ok(StorageInfo {
            current_path: current_dir.to_string_lossy().to_string(),
            default_path: default_dir.to_string_lossy().to_string(),
            is_default: !self.use_custom_storage,
            custom_path: self.custom_storage_path.clone(),
        })
    }
}

/// 存储信息
#[derive(serde::Serialize, serde::Deserialize)]
pub struct StorageInfo {
    pub current_path: String,
    pub default_path: String,
    pub is_default: bool,
    pub custom_path: Option<String>,
}

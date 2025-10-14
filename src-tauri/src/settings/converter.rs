use super::model::AppSettings;
use serde_json::Value;

/// JSON 转换器
pub struct SettingsConverter;

impl SettingsConverter {
    /// 将设置转换为JSON（供前端使用）
    pub fn to_json(settings: &AppSettings) -> Value {
        serde_json::json!({
            "autoStart": settings.auto_start,
            "startHidden": settings.start_hidden,
            "runAsAdmin": settings.run_as_admin,
            "showStartupNotification": settings.show_startup_notification,
            "historyLimit": settings.history_limit,
            "theme": settings.theme,
            "opacity": settings.opacity,
            "backgroundImagePath": settings.background_image_path,
            "toggleShortcut": settings.toggle_shortcut,
            "numberShortcuts": settings.number_shortcuts,
            "numberShortcutsModifier": settings.number_shortcuts_modifier,
            "clipboardMonitor": settings.clipboard_monitor,
            "ignoreDuplicates": settings.ignore_duplicates,
            "saveImages": settings.save_images,
            "showImagePreview": settings.show_image_preview,
            "soundEnabled": settings.sound_enabled,
            "soundVolume": settings.sound_volume,
            "copySoundPath": settings.copy_sound_path,
            "pasteSoundPath": settings.paste_sound_path,
            "screenshot_enabled": settings.screenshot_enabled,
            "screenshot_shortcut": settings.screenshot_shortcut,
            "screenshot_quality": settings.screenshot_quality,
            "screenshot_auto_save": settings.screenshot_auto_save,
            "screenshot_show_hints": settings.screenshot_show_hints,
            "screenshot_element_detection": settings.screenshot_element_detection,
            "screenshot_magnifier_enabled": settings.screenshot_magnifier_enabled,
            "screenshot_hints_enabled": settings.screenshot_hints_enabled,
            "screenshot_color_include_format": settings.screenshot_color_include_format,
            "previewEnabled": settings.preview_enabled,
            "previewShortcut": settings.preview_shortcut,
            "previewItemsCount": settings.preview_items_count,
            "previewAutoPaste": settings.preview_auto_paste,
            "previewScrollSound": settings.preview_scroll_sound,
            "previewScrollSoundPath": settings.preview_scroll_sound_path,
            "aiTranslationEnabled": settings.ai_translation_enabled,
            "aiApiKey": settings.ai_api_key,
            "aiModel": settings.ai_model,
            "aiBaseUrl": settings.ai_base_url,
            "aiTargetLanguage": settings.ai_target_language,
            "aiTranslateOnCopy": settings.ai_translate_on_copy,
            "aiTranslateOnPaste": settings.ai_translate_on_paste,
            "aiTranslationPrompt": settings.ai_translation_prompt,
            "aiInputSpeed": settings.ai_input_speed,
            "aiNewlineMode": settings.ai_newline_mode,
            "aiOutputMode": settings.ai_output_mode,
            "mouseMiddleButtonEnabled": settings.mouse_middle_button_enabled,
            "mouseMiddleButtonModifier": settings.mouse_middle_button_modifier,
            "clipboardAnimationEnabled": settings.clipboard_animation_enabled,
            "autoScrollToTopOnShow": settings.auto_scroll_to_top_on_show,
            "windowPositionMode": settings.window_position_mode,
            "rememberWindowSize": settings.remember_window_size,
            "savedWindowPosition": settings.saved_window_position,
            "savedWindowSize": settings.saved_window_size,
            "appFilterEnabled": settings.app_filter_enabled,
            "appFilterMode": settings.app_filter_mode,
            "appFilterList": settings.app_filter_list,
            "titleBarPosition": settings.title_bar_position,
            "edgeHideEnabled": settings.edge_hide_enabled,
            "edgeHideOffset": settings.edge_hide_offset,
            "autoFocusSearch": settings.auto_focus_search,
            "sidebarHoverDelay": settings.sidebar_hover_delay,
            "pasteWithFormat": settings.paste_with_format,
            "imageDataPriorityApps": settings.image_data_priority_apps,
            "navigateUpShortcut": settings.navigate_up_shortcut,
            "navigateDownShortcut": settings.navigate_down_shortcut,
            "tabLeftShortcut": settings.tab_left_shortcut,
            "tabRightShortcut": settings.tab_right_shortcut,
            "focusSearchShortcut": settings.focus_search_shortcut,
            "hideWindowShortcut": settings.hide_window_shortcut,
            "executeItemShortcut": settings.execute_item_shortcut,
            "previousGroupShortcut": settings.previous_group_shortcut,
            "nextGroupShortcut": settings.next_group_shortcut,
            "togglePinShortcut": settings.toggle_pin_shortcut,
        })
    }

    /// 从JSON更新设置（来自前端）
    pub fn update_from_json(settings: &mut AppSettings, json: &Value) {
        // 使用宏简化字段更新
        macro_rules! update_bool {
            ($field:ident, $key:expr) => {
                if let Some(v) = json.get($key).and_then(|v| v.as_bool()) {
                    settings.$field = v;
                }
            };
        }

        macro_rules! update_u64 {
            ($field:ident, $key:expr) => {
                if let Some(v) = json.get($key).and_then(|v| v.as_u64()) {
                    settings.$field = v;
                }
            };
        }

        macro_rules! update_u32 {
            ($field:ident, $key:expr) => {
                if let Some(v) = json.get($key).and_then(|v| v.as_u64()) {
                    settings.$field = v as u32;
                }
            };
        }

        macro_rules! update_u8 {
            ($field:ident, $key:expr) => {
                if let Some(v) = json.get($key).and_then(|v| v.as_u64()) {
                    settings.$field = v as u8;
                }
            };
        }

        macro_rules! update_f64 {
            ($field:ident, $key:expr) => {
                if let Some(v) = json.get($key).and_then(|v| v.as_f64()) {
                    settings.$field = v;
                }
            };
        }

        macro_rules! update_string {
            ($field:ident, $key:expr) => {
                if let Some(v) = json.get($key).and_then(|v| v.as_str()) {
                    settings.$field = v.to_string();
                }
            };
        }

        // 基础设置
        update_bool!(auto_start, "autoStart");
        update_bool!(start_hidden, "startHidden");
        update_bool!(run_as_admin, "runAsAdmin");
        update_bool!(show_startup_notification, "showStartupNotification");
        update_u64!(history_limit, "historyLimit");
        update_string!(theme, "theme");
        update_f64!(opacity, "opacity");
        update_string!(background_image_path, "backgroundImagePath");
        update_string!(toggle_shortcut, "toggleShortcut");
        update_bool!(number_shortcuts, "numberShortcuts");
        update_string!(number_shortcuts_modifier, "numberShortcutsModifier");
        update_bool!(clipboard_monitor, "clipboardMonitor");
        update_bool!(ignore_duplicates, "ignoreDuplicates");
        update_bool!(save_images, "saveImages");
        update_bool!(show_image_preview, "showImagePreview");

        // 音效设置
        update_bool!(sound_enabled, "soundEnabled");
        update_f64!(sound_volume, "soundVolume");
        update_string!(copy_sound_path, "copySoundPath");
        update_string!(paste_sound_path, "pasteSoundPath");

        // 截屏设置
        update_bool!(screenshot_enabled, "screenshot_enabled");
        update_string!(screenshot_shortcut, "screenshot_shortcut");
        update_u8!(screenshot_quality, "screenshot_quality");
        update_bool!(screenshot_auto_save, "screenshot_auto_save");
        update_bool!(screenshot_show_hints, "screenshot_show_hints");
        update_string!(screenshot_element_detection, "screenshot_element_detection");
        update_bool!(screenshot_magnifier_enabled, "screenshot_magnifier_enabled");
        update_bool!(screenshot_hints_enabled, "screenshot_hints_enabled");
        update_bool!(screenshot_color_include_format, "screenshot_color_include_format");

        // 预览窗口设置
        update_bool!(preview_enabled, "previewEnabled");
        update_string!(preview_shortcut, "previewShortcut");
        update_u32!(preview_items_count, "previewItemsCount");
        update_bool!(preview_auto_paste, "previewAutoPaste");
        update_bool!(preview_scroll_sound, "previewScrollSound");
        update_string!(preview_scroll_sound_path, "previewScrollSoundPath");

        // AI翻译设置
        update_bool!(ai_translation_enabled, "aiTranslationEnabled");
        update_string!(ai_api_key, "aiApiKey");
        update_string!(ai_model, "aiModel");
        update_string!(ai_base_url, "aiBaseUrl");
        update_string!(ai_target_language, "aiTargetLanguage");
        update_bool!(ai_translate_on_copy, "aiTranslateOnCopy");
        update_bool!(ai_translate_on_paste, "aiTranslateOnPaste");
        update_string!(ai_translation_prompt, "aiTranslationPrompt");
        update_u32!(ai_input_speed, "aiInputSpeed");
        update_string!(ai_newline_mode, "aiNewlineMode");
        update_string!(ai_output_mode, "aiOutputMode");

        // 鼠标设置
        update_bool!(mouse_middle_button_enabled, "mouseMiddleButtonEnabled");
        update_string!(mouse_middle_button_modifier, "mouseMiddleButtonModifier");

        // 动画设置
        update_bool!(clipboard_animation_enabled, "clipboardAnimationEnabled");

        // 显示行为
        update_bool!(auto_scroll_to_top_on_show, "autoScrollToTopOnShow");

        // 窗口设置
        update_string!(window_position_mode, "windowPositionMode");
        update_bool!(remember_window_size, "rememberWindowSize");

        if let Some(v) = json.get("savedWindowPosition").and_then(|v| v.as_array()) {
            if v.len() == 2 {
                if let (Some(x), Some(y)) = (v[0].as_i64(), v[1].as_i64()) {
                    settings.saved_window_position = Some((x as i32, y as i32));
                }
            }
        }

        if let Some(v) = json.get("savedWindowSize").and_then(|v| v.as_array()) {
            if v.len() == 2 {
                if let (Some(w), Some(h)) = (v[0].as_u64(), v[1].as_u64()) {
                    settings.saved_window_size = Some((w as u32, h as u32));
                }
            }
        }

        // 应用过滤设置
        update_bool!(app_filter_enabled, "appFilterEnabled");
        update_string!(app_filter_mode, "appFilterMode");

        if let Some(v) = json.get("appFilterList").and_then(|v| v.as_array()) {
            settings.app_filter_list = v
                .iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect();
        }

        // 标题栏设置
        update_string!(title_bar_position, "titleBarPosition");

        // 贴边隐藏设置
        update_bool!(edge_hide_enabled, "edgeHideEnabled");
        
        if let Some(v) = json.get("edgeHideOffset").and_then(|v| v.as_i64()) {
            settings.edge_hide_offset = (v as i32).max(0).min(50);
        }

        // 窗口行为设置
        update_bool!(auto_focus_search, "autoFocusSearch");
        
        if let Some(v) = json.get("sidebarHoverDelay").and_then(|v| v.as_f64()) {
            settings.sidebar_hover_delay = v.max(0.0).min(10.0);
        }

        // 格式设置
        update_bool!(paste_with_format, "pasteWithFormat");

        if let Some(v) = json.get("imageDataPriorityApps").and_then(|v| v.as_array()) {
            settings.image_data_priority_apps = v
                .iter()
                .filter_map(|item| item.as_str())
                .map(|s| s.to_string())
                .collect();
        }

        // 快捷键设置
        update_string!(navigate_up_shortcut, "navigateUpShortcut");
        update_string!(navigate_down_shortcut, "navigateDownShortcut");
        update_string!(tab_left_shortcut, "tabLeftShortcut");
        update_string!(tab_right_shortcut, "tabRightShortcut");
        update_string!(focus_search_shortcut, "focusSearchShortcut");
        update_string!(hide_window_shortcut, "hideWindowShortcut");
        update_string!(execute_item_shortcut, "executeItemShortcut");
        update_string!(previous_group_shortcut, "previousGroupShortcut");
        update_string!(next_group_shortcut, "nextGroupShortcut");
        update_string!(toggle_pin_shortcut, "togglePinShortcut");
    }
}

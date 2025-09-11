use arboard::Clipboard;
use serde::Deserialize;
use tauri::WebviewWindow;
use tauri::{Emitter, Manager};

#[cfg(not(debug_assertions))]
use auto_launch::AutoLaunch;

use crate::admin_privileges;
use crate::clipboard_content::{image_to_data_url, set_clipboard_content, set_clipboard_content_with_html};
use crate::clipboard_history::{self, ClipboardItem};
use crate::groups::{self};
use crate::image_manager::get_image_manager;
use crate::mouse_hook::{disable_mouse_monitoring, enable_mouse_monitoring};
use crate::quick_texts::{self};
use crate::database::{self, FavoriteItem, GroupInfo};
use crate::window_management;

#[derive(Deserialize)]
pub struct GroupParams {
    #[serde(rename = "groupId")]
    pub group_id: String,
}

#[derive(Deserialize)]
pub struct AddToGroupParams {
    pub index: usize,
    #[serde(rename = "groupId")]
    pub group_id: String,
}

#[derive(Deserialize)]
pub struct MoveToGroupParams {
    pub id: String,
    #[serde(rename = "groupId")]
    pub group_id: String,
}

// 从剪贴板获取文本
#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    match Clipboard::new() {
        Ok(mut clipboard) => match clipboard.get_text() {
            Ok(text) => {
                // 不在这里添加到历史记录，因为剪贴板监听器已经处理了
                Ok(text)
            }
            Err(_) => Err("剪贴板为空或不是文本格式".into()),
        },
        Err(e) => Err(format!("获取剪贴板失败: {}", e)),
    }
}

// 设置剪贴板文本
#[tauri::command]
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    set_clipboard_content(text)?;
    Ok(())
}

// 设置剪贴板文本
#[tauri::command]
pub fn set_clipboard_text_with_html(text: String, html: Option<String>) -> Result<(), String> {
    set_clipboard_content_with_html(text, html)?;
    Ok(())
}

// 设置剪贴板图片
#[tauri::command]
pub fn set_clipboard_image(data_url: String) -> Result<(), String> {
    set_clipboard_content(data_url)?;
    Ok(())
}

// 移动剪贴板项目到第一位
#[tauri::command]
pub fn move_clipboard_item_to_front(text: String) -> Result<(), String> {
    clipboard_history::move_to_front_if_exists(text);
    Ok(())
}

// 获取剪贴板历史
#[tauri::command]
pub fn get_clipboard_history() -> Vec<ClipboardItem> {
    // 获取当前的历史记录数量限制
    let limit = clipboard_history::get_history_limit();

    // 从数据库获取，使用当前的数量限制
    match crate::database::get_clipboard_history(Some(limit)) {
        Ok(items) => {
            // 转换数据库ID为前端期望的索引
            items
                .into_iter()
                .enumerate()
                .map(|(index, mut item)| {
                    // 将数据库ID转换为索引，保持前端兼容性
                    item.id = index as i64;
                    item
                })
                .collect()
        }
        Err(e) => {
            println!("从数据库获取历史记录失败: {}", e);
            // 数据库模式下没有后备方案，返回空列表
            Vec::new()
        }
    }
}

// 刷新剪贴板监听函数，只添加新内容
#[tauri::command]
pub fn refresh_clipboard() -> Result<(), String> {
    match Clipboard::new() {
        Ok(mut clipboard) => {
            if let Ok(text) = clipboard.get_text() {
                // 过滤空白内容：检查去除空白字符后是否为空
                if !text.is_empty() && !text.trim().is_empty() {
                    clipboard_history::add_to_history(text);
                    return Ok(());
                }
            }
            // 尝试图片
            match clipboard.get_image() {
                Ok(img) => {
                    let data_url = image_to_data_url(&img);
                    clipboard_history::add_to_history(data_url);
                    Ok(())
                }
                Err(_) => Ok(()),
            }
        }
        Err(e) => Err(format!("获取剪贴板失败: {}", e)),
    }
}

// 切换窗口显示/隐藏状态
#[tauri::command]
pub fn toggle_window_visibility(window: WebviewWindow) -> Result<(), String> {
    // 先判断是否固定，如果是固定且窗口可见就不隐藏
    #[cfg(windows)]
    {
        if window.is_visible().unwrap_or(true) && window_management::get_window_pinned() {
            // 固定时不隐藏
            return Ok(());
        }
    }

    // 使用统一的窗口显示/隐藏逻辑
    window_management::toggle_webview_window_visibility(window);
    Ok(())
}

// 保留原有的greet函数以兼容现有代码
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 窗口管理功能
#[tauri::command]
pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
    window_management::focus_clipboard_window(window)
}

#[tauri::command]
pub fn restore_last_focus() -> Result<(), String> {
    window_management::restore_last_focus()
}

#[tauri::command]
pub fn set_window_pinned(pinned: bool) -> Result<(), String> {
    window_management::set_window_pinned(pinned)
}

#[tauri::command]
pub fn get_window_pinned() -> bool {
    window_management::get_window_pinned()
}

// 如果主窗口是自动显示的，则隐藏它
#[tauri::command]
pub fn hide_main_window_if_auto_shown(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(main_window) = app.get_webview_window("main") {
        window_management::hide_main_window_if_auto_shown(&main_window)
    } else {
        Err("找不到主窗口".to_string())
    }
}

// =================== 常用文本相关命令 ===================

// 获取所有常用文本
#[tauri::command]
pub fn get_quick_texts() -> Vec<FavoriteItem> {
    quick_texts::get_all_quick_texts()
}

// 添加常用文本
#[tauri::command]
pub fn add_quick_text(
    title: String,
    content: String,
    groupName: String,
) -> Result<FavoriteItem, String> {
    // 直接使用传入的groupName
    quick_texts::add_quick_text(title, content, groupName)
}

// 更新常用文本
#[tauri::command]
pub fn update_quick_text(
    id: String,
    title: String,
    content: String,
    groupName: String,
) -> Result<FavoriteItem, String> {
    // 直接使用传入的groupName
    quick_texts::update_quick_text(id, title, content, Some(groupName))
}

// 删除常用文本
#[tauri::command]
pub fn delete_quick_text(id: String) -> Result<(), String> {
    quick_texts::delete_quick_text(&id)
}

// 将剪贴板历史项添加到常用文本
#[tauri::command]
pub fn add_clipboard_to_favorites(index: usize) -> Result<FavoriteItem, String> {
    // 从数据库获取剪贴板历史
    let items = crate::database::get_clipboard_history(None)
        .map_err(|e| format!("获取剪贴板历史失败: {}", e))?;

    if index >= items.len() {
        return Err(format!("索引 {} 超出历史范围", index));
    }

    let content = items[index].content.clone();
    let html_content = items[index].html_content.clone();

    // 处理内容，如果是图片则创建副本
    let final_content = if content.starts_with("image:") {
        // 提取图片ID
        let image_id = content.strip_prefix("image:").unwrap_or("");
        if !image_id.is_empty() {
            // 创建图片副本
            match get_image_manager() {
                Ok(image_manager) => {
                    match image_manager.lock() {
                        Ok(manager) => {
                            match manager.copy_image(image_id) {
                                Ok(new_image_info) => {
                                    format!("image:{}", new_image_info.id)
                                }
                                Err(e) => {
                                    println!("复制图片失败: {}, 使用原始引用", e);
                                    content // 如果复制失败，使用原始引用
                                }
                            }
                        }
                        Err(e) => {
                            println!("获取图片管理器锁失败: {}, 使用原始引用", e);
                            content
                        }
                    }
                }
                Err(e) => {
                    println!("获取图片管理器失败: {}, 使用原始引用", e);
                    content
                }
            }
        } else {
            content
        }
    } else {
        content.clone()
    };

    // 生成标题：根据内容类型生成合适的标题
    let title = if final_content.starts_with("data:image/") || final_content.starts_with("image:") {
        // 图片内容使用固定标题
        "图片".to_string()
    } else if final_content.starts_with("files:") {
        // 文件内容解析文件名作为标题
        crate::utils::content_utils::generate_files_title(&final_content)
    } else if final_content.chars().count() > 30 {
        // 文本内容取前30个字符作为标题
        let truncated: String = final_content.chars().take(30).collect();
        format!("{}...", truncated)
    } else {
        final_content.clone()
    };

    // 添加到常用文本
    quick_texts::add_quick_text_with_group_and_html(title, final_content, html_content, "全部".to_string())
}

// =================== 鼠标监听控制命令 ===================

// 启用鼠标监听
#[tauri::command]
pub fn enable_mouse_monitoring_command() -> Result<(), String> {
    #[cfg(windows)]
    enable_mouse_monitoring();
    Ok(())
}

// 禁用鼠标监听
#[tauri::command]
pub fn disable_mouse_monitoring_command() -> Result<(), String> {
    #[cfg(windows)]
    disable_mouse_monitoring();
    Ok(())
}

// =================== 设置相关命令 ===================

// 设置开机自启动
#[tauri::command]
pub fn set_startup_launch(enabled: bool) -> Result<(), String> {
    // 在开发模式下跳过开机自启动设置
    #[cfg(debug_assertions)]
    {
        println!("开发模式下跳过开机自启动设置: enabled = {}", enabled);
        return Ok(());
    }

    #[cfg(not(debug_assertions))]
    {
        let app_name = "QuickClipboard";
        let app_path = std::env::current_exe().map_err(|e| format!("获取程序路径失败: {}", e))?;

        let auto_launch = AutoLaunch::new(app_name, &app_path.to_string_lossy(), &[] as &[&str]);

        if enabled {
            auto_launch
                .enable()
                .map_err(|e| format!("启用开机自启动失败: {}", e))?;
        } else {
            auto_launch
                .disable()
                .map_err(|e| format!("禁用开机自启动失败: {}", e))?;
        }

        Ok(())
    }
}

// 设置历史记录数量限制
#[tauri::command]
pub fn set_history_limit(limit: usize) -> Result<(), String> {
    clipboard_history::set_history_limit(limit);
    Ok(())
}

// =================== 拖拽排序相关命令 ===================

// 移动剪贴板项目到指定位置
#[tauri::command]
pub fn move_clipboard_item(from_index: usize, to_index: usize) -> Result<(), String> {
    clipboard_history::move_item(from_index, to_index)
}

// 移动常用文本到指定位置
#[tauri::command]
pub fn move_quick_text_item(item_index: usize, to_index: usize) -> Result<(), String> {
    quick_texts::move_quick_text_within_group(item_index, to_index)
}

// 重新排序剪贴板历史（保留兼容性）
#[tauri::command]
pub fn reorder_clipboard_history(items: Vec<String>) -> Result<(), String> {
    clipboard_history::reorder_history(items);
    Ok(())
}

// 重新排序常用文本（保留兼容性）
#[tauri::command]
pub fn reorder_quick_texts(items: Vec<FavoriteItem>) -> Result<(), String> {
    quick_texts::reorder_quick_texts(items)
}

// =================== 分组相关命令 ===================

// 获取所有分组
#[tauri::command]
pub fn get_groups() -> Vec<GroupInfo> {
    database::get_all_groups().unwrap_or_default()
}

// 添加分组
#[tauri::command]
pub fn add_group(name: String, icon: String) -> Result<GroupInfo, String> {
    groups::add_group(name, icon)
}

// 更新分组
#[tauri::command]
pub fn update_group(id: String, name: String, icon: String) -> Result<GroupInfo, String> {
    groups::update_group(id, name, icon)
}

// 删除分组
#[tauri::command]
pub fn delete_group(id: String) -> Result<(), String> {
    groups::delete_group(id)
}

// 按分组获取常用文本
#[tauri::command]
pub fn get_quick_texts_by_group(groupName: String) -> Vec<FavoriteItem> {
    quick_texts::get_quick_texts_by_group(&groupName)
}

// 移动常用文本到分组
#[tauri::command]
pub fn move_quick_text_to_group(id: String, groupName: String) -> Result<(), String> {
    quick_texts::move_quick_text_to_group(id, groupName)
}

// 打开设置窗口
#[tauri::command]
pub async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::window_service::open_settings_window(app).await
}

// =================== 文本编辑窗口命令 ===================

// 打开文本编辑窗口
#[tauri::command]
pub async fn open_text_editor_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::window_service::open_text_editor_window(app).await
}

// 获取设置
#[tauri::command]
pub fn get_settings() -> Result<serde_json::Value, String> {
    let settings = crate::settings::get_global_settings();
    Ok(settings.to_json())
}

#[tauri::command]
pub fn reload_settings() -> Result<serde_json::Value, String> {
    // 强制从文件重新加载设置
    let fresh_settings = crate::settings::AppSettings::load();

    // 更新全局设置
    if let Err(e) = crate::settings::update_global_settings(fresh_settings.clone()) {
        println!("更新全局设置失败: {}", e);
    }

    Ok(fresh_settings.to_json())
}

// 保存设置
#[tauri::command]
pub fn save_settings(
    app_handle: tauri::AppHandle,
    settings: serde_json::Value,
) -> Result<(), String> {
    // 由于设置窗口可能持有过期的窗口尺寸/位置，
    // 这里过滤掉 savedWindowSize 与 savedWindowPosition，避免覆盖最新值
    let mut settings_filtered = settings.clone();
    if let Some(obj) = settings_filtered.as_object_mut() {
        obj.remove("savedWindowSize");
        obj.remove("savedWindowPosition");
    }

    // 更新全局设置（使用过滤后的对象）
    crate::settings::update_global_settings_from_json(&settings_filtered)?;

    // 获取更新后的设置
    let app_settings = crate::settings::get_global_settings();

    // 应用各种设置
    // 1. 历史记录数量限制
    crate::clipboard_history::set_history_limit(app_settings.history_limit as usize);

    // 2. 开机自启动
    if let Err(e) = set_startup_launch(app_settings.auto_start) {
        println!("设置开机自启动失败: {}", e);
    }

    // 3. 剪贴板监听设置
    crate::clipboard_history::set_monitoring_enabled(app_settings.clipboard_monitor);

    // 4. 忽略重复内容设置
    crate::clipboard_history::set_ignore_duplicates(app_settings.ignore_duplicates);

    // 5. 保存图片设置
    crate::clipboard_history::set_save_images(app_settings.save_images);

    // 6. 数字快捷键设置
    #[cfg(windows)]
    crate::global_state::set_number_shortcuts_enabled(app_settings.number_shortcuts);

    // 7. 预览窗口快捷键设置
    #[cfg(windows)]
    crate::global_state::update_preview_shortcut_config(&app_settings.preview_shortcut);

    // 6. 更新音效设置
    let sound_settings = crate::sound_manager::SoundSettings {
        enabled: app_settings.sound_enabled,
        volume: (app_settings.sound_volume / 100.0) as f32, // 转换为0.0-1.0范围
        copy_sound_path: app_settings.copy_sound_path.clone(),
        paste_sound_path: app_settings.paste_sound_path.clone(),
        preset: app_settings.sound_preset.clone(),
    };
    crate::sound_manager::update_sound_settings(sound_settings);

    // 7. 截屏设置应用
    // 重新获取最新的设置以确保显示正确的值
    let updated_settings = crate::settings::get_global_settings();
    println!(
        "截屏设置已更新: 启用={}, 快捷键={}, 质量={}",
        updated_settings.screenshot_enabled,
        updated_settings.screenshot_shortcut,
        updated_settings.screenshot_quality
    );

    // 8. 更新快捷键拦截器配置
    #[cfg(windows)]
    {
        // 更新主窗口快捷键
        let toggle_shortcut = if app_settings.toggle_shortcut.is_empty() {
            "Win+V".to_string()
        } else {
            app_settings.toggle_shortcut.clone()
        };
        crate::shortcut_interceptor::update_shortcut_to_intercept(&toggle_shortcut);

        // 更新预览窗口快捷键
        let preview_shortcut = if app_settings.preview_shortcut.is_empty() {
            "Ctrl+`".to_string()
        } else {
            app_settings.preview_shortcut.clone()
        };
        crate::shortcut_interceptor::update_preview_shortcut_to_intercept(&preview_shortcut);
    }

    // 9. 检查是否需要刷新文件图标
    if settings_filtered.get("showImagePreview").is_some() {
        // 异步刷新文件图标，不阻塞设置保存
        let app_handle_clone = app_handle.clone();
        std::thread::spawn(move || {
            if let Err(e) = refresh_file_icons(app_handle_clone) {
                println!("刷新文件图标失败: {}", e);
            }
        });
    }

    // 10. 如果设置了显示后滚动到顶部，通知前端（主窗口）更新行为
    if let Some(main_window) = app_handle.get_webview_window("main") {
        use tauri::Emitter;
        let _ = main_window.emit(
            "settings-changed",
            app_settings.to_json(),
        );
    }

    Ok(())
}

// 调试日志
#[tauri::command]
pub fn log_debug(message: String) {
    println!("前端调试: {}", message);
}

// 浏览音效文件
#[tauri::command]
pub async fn browse_sound_file() -> Result<Option<String>, String> {
    let dialog = rfd::AsyncFileDialog::new()
        .add_filter("音频文件", &["wav", "mp3", "ogg", "flac", "m4a", "aac"])
        .set_title("选择音效文件");

    if let Some(file) = dialog.pick_file().await {
        Ok(Some(file.path().to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

// 浏览背景图片文件
#[tauri::command]
pub async fn browse_image_file() -> Result<Option<String>, String> {
    let dialog = rfd::AsyncFileDialog::new()
        .add_filter("图片文件", &["png", "jpg", "jpeg", "bmp", "gif", "webp"])
        .set_title("选择背景图片");

    if let Some(file) = dialog.pick_file().await {
        Ok(Some(file.path().to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

// 测试音效（异步版本）
#[tauri::command]
pub async fn test_sound(sound_path: String, volume: f32, sound_type: Option<String>) -> Result<(), String> {
    let volume_normalized = volume / 100.0; // 将0-100转换为0.0-1.0

    // 在后台线程中播放音效，避免阻塞前端
    let sound_path_clone = sound_path.clone();
    let sound_type_clone = sound_type.clone();
    tokio::task::spawn_blocking(move || {
        let effective_path = if sound_path_clone.is_empty() {
            // 根据音效类型选择默认音效
            match sound_type_clone.as_deref() {
                Some("paste") => "sounds/paste.mp3".to_string(),
                Some("preview-scroll") => "sounds/scroll.mp3".to_string(),
                _ => "sounds/copy.mp3".to_string(), // 默认为复制音效
            }
        } else {
            sound_path_clone
        };

        // 播放音效文件
        if let Err(e) =
            crate::sound_manager::SoundManager::play_sound_sync(&effective_path, volume_normalized)
        {
            eprintln!("测试音效失败: {}", e);
            // 如果文件播放失败，回退到代码生成的音效
            let frequency = match sound_type_clone.as_deref() {
                Some("paste") => 600.0,
                Some("preview-scroll") => 500.0,
                _ => 700.0,
            };
            if let Err(e2) =
                crate::sound_manager::SoundManager::play_beep(frequency, 200, volume_normalized)
            {
                eprintln!("测试默认音效也失败: {}", e2);
            }
        }
    })
    .await
    .map_err(|e| format!("音效测试任务失败: {}", e))?;

    Ok(())
}

// 播放粘贴音效（供键盘钩子调用）
#[tauri::command]
pub fn play_paste_sound() -> Result<(), String> {
    crate::sound_manager::play_paste_sound();
    Ok(())
}

// 播放滚动音效（供预览窗口调用）
#[tauri::command]
pub fn play_scroll_sound() -> Result<(), String> {
    crate::sound_manager::play_scroll_sound();
    Ok(())
}

// 清理音效缓存
#[tauri::command]
pub fn clear_sound_cache() -> Result<(), String> {
    crate::sound_manager::clear_sound_cache()
}

// 获取当前活跃音效播放数量
#[tauri::command]
pub fn get_active_sound_count() -> usize {
    crate::sound_manager::get_active_sound_count()
}

// 从剪贴板历史添加到分组
#[tauri::command]
pub fn add_clipboard_to_group(index: usize, groupName: String) -> Result<FavoriteItem, String> {
    // 从数据库获取剪贴板历史
    let items = crate::database::get_clipboard_history(None)
        .map_err(|e| format!("获取剪贴板历史失败: {}", e))?;

    if index >= items.len() {
        return Err(format!("索引 {} 超出历史范围", index));
    }

    let content = items[index].content.clone(); // 释放锁
    let html_content = items[index].html_content.clone();

    // 处理内容，如果是图片则创建副本
    let final_content = if content.starts_with("image:") {
        // 提取图片ID
        let image_id = content.strip_prefix("image:").unwrap_or("");
        if !image_id.is_empty() {
            // 创建图片副本
            match get_image_manager() {
                Ok(image_manager) => {
                    match image_manager.lock() {
                        Ok(manager) => {
                            match manager.copy_image(image_id) {
                                Ok(new_image_info) => {
                                    format!("image:{}", new_image_info.id)
                                }
                                Err(e) => {
                                    println!("复制图片失败: {}, 使用原始引用", e);
                                    content // 如果复制失败，使用原始引用
                                }
                            }
                        }
                        Err(e) => {
                            println!("获取图片管理器锁失败: {}, 使用原始引用", e);
                            content
                        }
                    }
                }
                Err(e) => {
                    println!("获取图片管理器失败: {}, 使用原始引用", e);
                    content
                }
            }
        } else {
            content
        }
    } else {
        content.clone()
    };

    // 生成标题：根据内容类型生成合适的标题
    let title = if final_content.starts_with("data:image/") || final_content.starts_with("image:") {
        // 图片内容使用固定标题
        "图片".to_string()
    } else if final_content.starts_with("files:") {
        // 文件内容解析文件名作为标题
        crate::utils::content_utils::generate_files_title(&final_content)
    } else {
        // 安全地截取字符串，避免在UTF-8字符中间截断
        let chars: Vec<char> = final_content.chars().collect();
        if chars.len() > 30 {
            format!("{}...", chars.iter().take(30).collect::<String>())
        } else {
            final_content.clone()
        }
    };

    // 添加到指定分组的常用文本
    quick_texts::add_quick_text_with_group_and_html(title, final_content, html_content, groupName)
}

// 设置主窗口为置顶
#[tauri::command]
pub fn set_super_topmost(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(windows)]
        {
            crate::window_management::setup_window_properties(&window)
                .map_err(|e| format!("设置窗口属性失败: {}", e))?;
        }
        Ok(())
    } else {
        Err("找不到主窗口".to_string())
    }
}

// 获取音效播放状态
#[tauri::command]
pub fn get_sound_status() -> Result<serde_json::Value, String> {
    let active_count = crate::sound_manager::get_active_sound_count();
    Ok(serde_json::json!({
        "active_sounds": active_count,
        "max_concurrent": 3
    }))
}

// 获取图片数据URL
#[tauri::command]
pub fn get_image_data_url(image_id: String) -> Result<String, String> {
    let image_manager = get_image_manager()?;
    let manager = image_manager
        .lock()
        .map_err(|e| format!("获取图片管理器锁失败: {}", e))?;
    manager.get_image_data_url(&image_id)
}

// 获取图片缩略图数据URL
#[tauri::command]
pub fn get_image_thumbnail_url(image_id: String) -> Result<String, String> {
    let image_manager = get_image_manager()?;
    let manager = image_manager
        .lock()
        .map_err(|e| format!("获取图片管理器锁失败: {}", e))?;
    manager.get_thumbnail_data_url(&image_id)
}

// 保存图片到指定路径
#[tauri::command]
pub fn save_image_to_file(content: String, file_path: String) -> Result<(), String> {
    use base64::{engine::general_purpose, Engine as _};
    use std::fs;

    let data_url = if content.starts_with("image:") {
        // 新格式：通过图片ID获取data URL
        let image_id = content.strip_prefix("image:").unwrap_or("");
        let image_manager = get_image_manager()?;
        let manager = image_manager
            .lock()
            .map_err(|e| format!("获取图片管理器锁失败: {}", e))?;
        manager.get_image_data_url(image_id)?
    } else if content.starts_with("data:image/") {
        // 旧格式：直接使用data URL
        content
    } else {
        return Err("不支持的图片格式".to_string());
    };

    // 解析data URL
    let comma_pos = data_url
        .find(',')
        .ok_or_else(|| "无效的data URL格式".to_string())?;

    let encoded = &data_url[(comma_pos + 1)..];
    let image_data = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Base64解码失败: {}", e))?;

    // 保存到文件
    fs::write(&file_path, &image_data).map_err(|e| format!("保存文件失败: {}", e))?;

    println!("图片已保存到: {}", file_path);
    Ok(())
}

// 设置预览窗口当前索引
#[tauri::command]
pub fn set_preview_index(index: usize) -> Result<(), String> {
    crate::preview_window::set_preview_index(index);
    Ok(())
}

// 取消预览（不粘贴直接隐藏）
#[tauri::command]
pub async fn cancel_preview() -> Result<(), String> {
    crate::preview_window::cancel_preview().await
}

// 删除剪贴板项目
#[tauri::command]
pub fn delete_clipboard_item(id: usize) -> Result<(), String> {
    clipboard_history::delete_item_by_index(id)
}

// 更新剪贴板项目内容
#[tauri::command]
pub fn update_clipboard_item(index: usize, content: String) -> Result<(), String> {
    clipboard_history::update_item_content(index, content)
}

// 清空剪贴板历史
#[tauri::command]
pub fn clear_clipboard_history() -> Result<(), String> {
    clipboard_history::clear_all()
}

// 发送剪贴板更新事件
#[tauri::command]
pub async fn emit_clipboard_updated(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;

    // 发送事件到主窗口
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.emit("clipboard-changed", ());
    }

    // 发送事件到预览窗口
    if let Some(preview_window) = app.get_webview_window("preview") {
        let _ = preview_window.emit("clipboard-history-updated", ());
    }

    Ok(())
}

// 发送常用文本更新事件
#[tauri::command]
pub async fn emit_quick_texts_updated(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;

    // 发送事件到主窗口
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.emit("refreshQuickTexts", ());
    }

    // 发送事件到预览窗口
    if let Some(preview_window) = app.get_webview_window("preview") {
        let _ = preview_window.emit("quick-texts-updated", ());
    }

    Ok(())
}

// 通知预览窗口标签切换
#[tauri::command]
pub fn notify_preview_tab_change(tab: String, groupName: String) -> Result<(), String> {
    crate::preview_window::update_preview_source(tab, groupName)
}

// 获取主窗口当前状态
#[tauri::command]
pub fn get_main_window_state() -> Result<serde_json::Value, String> {
    crate::preview_window::get_main_window_state()
}

// 更新主题设置
#[tauri::command]
pub fn update_theme_setting(theme: String) -> Result<(), String> {
    let mut settings = crate::settings::get_global_settings();
    settings.theme = theme;
    crate::settings::update_global_settings(settings)?;
    Ok(())
}

// 获取应用版本信息
#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let pkg = app.package_info();
    let version = pkg.version.to_string();
    let version_info = serde_json::json!({
        "version": version
    });
    Ok(version_info)
}

// =================== 网络图片代理 ===================

/// 通过后端下载网络图片并返回 data URL（用于绕过部分站点的热链/跨域限制）
#[tauri::command]
pub async fn fetch_image_as_data_url(url: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) QuickClipboard/1.0 Chrome/122 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    // 尝试设置Referer为图片来源域名，规避部分站点的防盗链
    let referer = reqwest::Url::parse(&url)
        .ok()
        .and_then(|u| u.domain().map(|d| (u.scheme().to_string(), d.to_string())))
        .map(|(scheme, domain)| format!("{}://{}", scheme, domain));

    let mut request = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "image/avif,image/webp,image/apng,image/*,*/*;q=0.8");

    if let Some(ref v) = referer {
        request = request.header(reqwest::header::REFERER, v);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("请求图片失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("请求失败: {}", response.status()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取图片失败: {}", e))?;

    const MAX_SIZE: usize = 10 * 1024 * 1024; // 10MB
    if bytes.len() > MAX_SIZE {
        return Err("图片过大".to_string());
    }

    let base64_data = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, base64_data))
}

// =================== 管理员权限相关命令 ===================

// 获取管理员权限状态
#[tauri::command]
pub fn get_admin_status() -> Result<admin_privileges::AdminStatus, String> {
    Ok(admin_privileges::get_admin_status())
}

// 以管理员权限重启应用
#[tauri::command]
pub fn restart_as_admin() -> Result<(), String> {
    admin_privileges::restart_as_admin()
}

// 检查后端是否初始化完成
#[tauri::command]
pub fn is_backend_initialized() -> bool {
    crate::BACKEND_INITIALIZED.load(std::sync::atomic::Ordering::Relaxed)
}

// =================== 系统通知相关命令 ===================

// 发送系统通知
#[tauri::command]
pub fn send_system_notification(title: String, body: String) -> Result<(), String> {
    println!("发送系统通知: {} - {}", title, body);
    Ok(())
}

// 发送启动通知
#[tauri::command]
pub fn send_startup_notification(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let admin_status = admin_privileges::get_admin_status();
    let status_text = if admin_status.is_admin {
        "（管理员模式）"
    } else {
        ""
    };

    // 获取当前设置的快捷键
    let app_settings = crate::settings::get_global_settings();
    let shortcut_key = if app_settings.toggle_shortcut.is_empty() {
        "Win+V".to_string()
    } else {
        app_settings.toggle_shortcut.clone()
    };

    let notification_body = format!(
        "QuickClipboard 已启动{}\n按 {} 打开剪贴板",
        status_text, shortcut_key
    );

    match app
        .notification()
        .builder()
        .title("QuickClipboard")
        .body(&notification_body)
        .show()
    {
        Ok(_) => {
            println!("启动通知发送成功");
            Ok(())
        }
        Err(e) => {
            println!("发送启动通知失败: {}", e);
            Err(format!("发送通知失败: {}", e))
        }
    }
}

// =================== AI翻译相关命令 ===================

/// 测试AI翻译配置
#[tauri::command]
pub async fn test_ai_translation() -> Result<String, String> {
    let settings = crate::settings::get_global_settings();

    // 检查配置是否有效
    if !crate::ai_translator::is_translation_config_valid(&settings) {
        return Err("AI翻译配置不完整，请检查API密钥、模型和目标语言设置".to_string());
    }

    // 创建翻译配置
    let config = crate::ai_translator::config_from_settings(&settings);

    // 创建翻译器
    let translator = match crate::ai_translator::AITranslator::new(config) {
        Ok(t) => t,
        Err(e) => return Err(format!("创建翻译器失败: {}", e)),
    };

    // 测试翻译
    let test_text = "Hello, this is a test message for AI translation.";

    match translator.translate_stream(test_text).await {
        Ok(mut receiver) => {
            let mut result = String::new();

            // 收集流式响应
            while let Some(translation_result) = receiver.recv().await {
                match translation_result {
                    crate::ai_translator::TranslationResult::Chunk(chunk) => {
                        result.push_str(&chunk);
                    }
                    crate::ai_translator::TranslationResult::Complete => {
                        break;
                    }
                    crate::ai_translator::TranslationResult::Error(e) => {
                        return Err(format!("翻译失败: {}", e));
                    }
                }
            }

            if result.is_empty() {
                Err("翻译结果为空".to_string())
            } else {
                Ok(format!("测试成功！翻译结果：{}", result))
            }
        }
        Err(e) => Err(format!("启动翻译失败: {}", e)),
    }
}

/// 取消正在进行的翻译
#[tauri::command]
pub fn cancel_translation() -> Result<(), String> {
    crate::services::translation_service::cancel_translation()
}

/// 启用AI翻译取消快捷键
#[tauri::command]
pub fn enable_ai_translation_cancel_shortcut() -> Result<(), String> {
    #[cfg(windows)]
    crate::global_state::enable_ai_translation_cancel();
    Ok(())
}

/// 禁用AI翻译取消快捷键
#[tauri::command]
pub fn disable_ai_translation_cancel_shortcut() -> Result<(), String> {
    #[cfg(windows)]
    crate::global_state::disable_ai_translation_cancel();
    Ok(())
}

/// 翻译文本并直接粘贴（非流式）
#[tauri::command]
pub async fn translate_and_paste_text(text: String) -> Result<(), String> {
    crate::services::translation_service::translate_and_paste_text(text).await
}

/// 翻译文本并流式输入
#[tauri::command]
pub async fn translate_and_input_text(text: String) -> Result<(), String> {
    crate::services::translation_service::translate_and_input_text(text).await
}

/// 智能翻译文本（根据设置选择流式输入或直接粘贴）
#[tauri::command]
pub async fn translate_text_smart(text: String) -> Result<(), String> {
    crate::services::translation_service::translate_text_smart(text).await
}

/// 复制时翻译并直接输入到目标位置
#[tauri::command]
pub async fn translate_and_input_on_copy(text: String) -> Result<(), String> {
    crate::services::translation_service::translate_and_input_on_copy(text).await
}

/// 检查当前是否处于粘贴状态
#[tauri::command]
pub fn is_currently_pasting() -> bool {
    crate::clipboard_monitor::is_currently_pasting()
}

/// 检查AI翻译配置是否有效
#[tauri::command]
pub fn check_ai_translation_config() -> Result<bool, String> {
    let settings = crate::settings::get_global_settings();
    Ok(crate::ai_translator::is_translation_config_valid(&settings))
}

// =================== 文件处理命令 ===================

#[tauri::command]
pub async fn copy_files_to_directory(
    files: Vec<String>,
    target_dir: String,
) -> Result<Vec<String>, String> {
    crate::file_handler::copy_files_to_target(&files, &target_dir)
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<crate::file_handler::FileInfo, String> {
    crate::file_handler::get_file_info(&path)
}

#[tauri::command]
pub async fn get_clipboard_files() -> Result<Vec<String>, String> {
    crate::file_handler::get_clipboard_files()
}

#[tauri::command]
pub async fn set_clipboard_files(files: Vec<String>) -> Result<(), String> {
    crate::file_handler::set_clipboard_files(&files)
}

/// 获取可用的AI模型列表
#[tauri::command]
pub async fn get_available_ai_models() -> Result<Vec<String>, String> {
    let settings = crate::settings::get_global_settings();
    let ai_config = crate::ai_config::create_ai_config_from_settings(&settings);

    if !ai_config.is_valid() {
        return Err("AI配置无效，请检查API密钥等设置".to_string());
    }

    let config_manager = crate::ai_config::AIConfigManager::new(ai_config)
        .map_err(|e| format!("创建AI配置管理器失败: {}", e))?;

    config_manager
        .get_available_models()
        .await
        .map_err(|e| format!("获取模型列表失败: {}", e))
}

/// 测试AI配置
#[tauri::command]
pub async fn test_ai_config() -> Result<bool, String> {
    let settings = crate::settings::get_global_settings();
    let ai_config = crate::ai_config::create_ai_config_from_settings(&settings);

    if !ai_config.is_valid() {
        return Err("AI配置无效".to_string());
    }

    let config_manager = crate::ai_config::AIConfigManager::new(ai_config)
        .map_err(|e| format!("创建AI配置管理器失败: {}", e))?;

    config_manager
        .test_config()
        .await
        .map_err(|e| format!("AI配置测试失败: {}", e))?;

    Ok(true)
}

// 打开文件位置
#[tauri::command]
pub async fn open_file_location(file_path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(windows)]
    {
        // Windows: 使用 explorer 打开文件位置并选中文件
        let result = Command::new("explorer")
            .args(&["/select,", &file_path])
            .spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件位置失败: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: 使用 Finder 打开文件位置
        let result = Command::new("open").args(&["-R", &file_path]).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件位置失败: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: 尝试使用文件管理器打开
        let result = Command::new("xdg-open")
            .arg(
                std::path::Path::new(&file_path)
                    .parent()
                    .unwrap_or(std::path::Path::new("/")),
            )
            .spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件位置失败: {}", e)),
        }
    }
}
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
// 使用默认程序打开文件
#[tauri::command]
pub async fn open_file_with_default_program(file_path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(windows)]
    {
        // Windows: 使用 start 命令打开文件
        let result = Command::new("cmd")
            .args(&["/C", "start", "", &file_path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件失败: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: 使用 open 命令打开文件
        let result = Command::new("open").arg(&file_path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件失败: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: 使用 xdg-open 打开文件
        let result = Command::new("xdg-open").arg(&file_path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("打开文件失败: {}", e)),
        }
    }
}

// 统一粘贴命令 - 自动识别内容类型并执行相应的粘贴操作
#[tauri::command]
pub async fn paste_content(
    params: crate::services::paste_service::PasteContentParams,
    window: WebviewWindow,
) -> Result<(), String> {
    crate::services::paste_service::paste_content(params, window).await
}

// 读取图片文件并返回base64数据
#[tauri::command]
pub fn read_image_file(file_path: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;

    let path = Path::new(&file_path);

    // 检查文件是否存在
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    // 检查文件大小（限制为10MB）
    if let Ok(metadata) = fs::metadata(&path) {
        const MAX_SIZE: u64 = 10 * 1024 * 1024; // 10MB
        if metadata.len() > MAX_SIZE {
            return Err("文件太大".to_string());
        }
    }

    // 读取文件
    let image_data = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;

    // 根据文件扩展名确定MIME类型
    let mime_type = match path.extension().and_then(|ext| ext.to_str()) {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        Some("webp") => "image/webp",
        Some("tiff") | Some("tif") => "image/tiff",
        Some("ico") => "image/x-icon",
        Some("svg") => "image/svg+xml",
        _ => "image/png", // 默认
    };

    // 编码为base64
    use base64::{engine::general_purpose, Engine as _};
    let base64_data = general_purpose::STANDARD.encode(&image_data);
    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}

// =================== 数据管理命令 ===================

// 导出数据
#[tauri::command]
pub async fn export_data(
    export_path: String,
    options: crate::data_manager::ExportOptions,
) -> Result<(), String> {
    crate::data_manager::export_data(&export_path, options).await
}

// 导入数据
#[tauri::command]
pub async fn import_data(
    import_path: String,
    options: crate::data_manager::ImportOptions,
) -> Result<(), String> {
    crate::data_manager::import_data(&import_path, options).await
}

// 重启应用程序
#[tauri::command]
pub async fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    println!("正在重启应用程序...");
    app.restart();
}

// 清空剪贴板历史（数据管理）
#[tauri::command]
pub async fn clear_clipboard_history_dm() -> Result<(), String> {
    crate::data_manager::clear_clipboard_history().await
}

// 重置所有数据
#[tauri::command]
pub async fn reset_all_data() -> Result<(), String> {
    crate::data_manager::reset_all_data().await
}

// 获取应用数据目录
#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    crate::data_manager::get_app_data_dir().map(|path| path.to_string_lossy().to_string())
}

// 刷新所有文件类型项目的图标
fn refresh_file_icons(app_handle: tauri::AppHandle) -> Result<(), String> {
    use crate::database;
    use crate::file_handler::FileClipboardData;

    println!("开始刷新文件图标...");

    let mut updated_count = 0;

    // 1. 刷新剪贴板历史记录中的文件图标
    let clipboard_items = database::get_clipboard_history(None)?;
    for item in clipboard_items {
        // 检查是否是文件类型的项目
        if item.content.starts_with("files:") {
            let json_str = item.content.strip_prefix("files:").unwrap_or("");

            // 解析文件数据
            if let Ok(mut file_data) = serde_json::from_str::<FileClipboardData>(json_str) {
                let mut has_changes = false;

                // 为每个文件重新生成图标
                for file in &mut file_data.files {
                    if let Ok(new_icon) = crate::file_handler::get_file_icon(&file.path) {
                        if file.icon_data.as_ref() != Some(&new_icon) {
                            file.icon_data = Some(new_icon);
                            has_changes = true;
                        }
                    }
                }

                // 如果有变化，更新数据库
                if has_changes {
                    if let Ok(updated_json) = serde_json::to_string(&file_data) {
                        let updated_text = format!("files:{}", updated_json);
                        if let Err(e) = database::update_clipboard_item(item.id, updated_text) {
                            println!("更新剪贴板项目 {} 失败: {}", item.id, e);
                        } else {
                            updated_count += 1;
                        }
                    }
                }
            }
        }
    }

    // 2. 刷新常用文本列表中的文件图标
    let quick_texts = database::get_all_favorite_items()?;
    for text in quick_texts {
        // 检查是否是文件类型的常用文本
        if text.content.starts_with("files:") {
            let json_str = text.content.strip_prefix("files:").unwrap_or("");

            // 解析文件数据
            if let Ok(mut file_data) = serde_json::from_str::<FileClipboardData>(json_str) {
                let mut has_changes = false;

                // 为每个文件重新生成图标
                for file in &mut file_data.files {
                    if let Ok(new_icon) = crate::file_handler::get_file_icon(&file.path) {
                        if file.icon_data.as_ref() != Some(&new_icon) {
                            file.icon_data = Some(new_icon);
                            has_changes = true;
                        }
                    }
                }

                // 如果有变化，更新数据库
                if has_changes {
                    if let Ok(updated_json) = serde_json::to_string(&file_data) {
                        let updated_content = format!("files:{}", updated_json);

                        // 创建更新后的常用文本对象
                        let mut updated_text = text.clone();
                        updated_text.content = updated_content;
                        let now_local = chrono::Local::now();
                        updated_text.updated_at = now_local.timestamp();

                        if let Err(e) = database::update_favorite_item(&updated_text) {
                            println!("更新常用文本 {} 失败: {}", text.id, e);
                        } else {
                            updated_count += 1;
                        }
                    }
                }
            }
        }
    }

    println!("文件图标刷新完成，更新了 {} 个项目", updated_count);

    // 发送事件通知前端刷新数据
    if let Err(e) = app_handle.emit("file-icons-refreshed", updated_count) {
        println!("发送文件图标刷新事件失败: {}", e);
    }

    Ok(())
}

// 保存窗口位置
#[tauri::command]
pub fn save_window_position(x: i32, y: i32) -> Result<(), String> {
    let mut settings = crate::settings::get_global_settings();
    settings.saved_window_position = Some((x, y));
    crate::settings::update_global_settings(settings)?;
    Ok(())
}

// 保存窗口大小
#[tauri::command]
pub fn save_window_size(width: u32, height: u32) -> Result<(), String> {
    let mut settings = crate::settings::get_global_settings();
    settings.saved_window_size = Some((width, height));
    crate::settings::update_global_settings(settings)?;
    Ok(())
}

// 获取保存的窗口位置
#[tauri::command]
pub fn get_saved_window_position() -> Result<Option<(i32, i32)>, String> {
    let settings = crate::settings::get_global_settings();
    Ok(settings.saved_window_position)
}

// 获取保存的窗口大小
#[tauri::command]
pub fn get_saved_window_size() -> Result<Option<(u32, u32)>, String> {
    let settings = crate::settings::get_global_settings();
    Ok(settings.saved_window_size)
}

// =================== 外部截屏程序命令 ===================

// 通过HTTP请求触发截屏
#[tauri::command]
pub async fn launch_external_screenshot(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    
    // 隐藏主窗口
    if let Some(main_window) = app.get_webview_window("main") {
        crate::window_management::hide_webview_window(main_window);
    }
    
    // 触发截屏
    crate::screenshot_service::trigger_screenshot().await
        .map_err(|e| format!("截屏请求失败: {}", e))?;
    
    Ok(())
}

// 启动外部截屏程序进程
#[tauri::command]
pub fn launch_external_screenshot_process(app: tauri::AppHandle) -> Result<(), String> {
    use std::process::{Command, Stdio};
    use std::io::{BufRead, BufReader};
    use tauri::Manager;
    
    // 获取应用资源目录
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;
    
    // 构建external_apps文件夹路径
    let external_apps_dir = resource_dir.join("external_apps");
    
    // 检查目录是否存在
    if !external_apps_dir.exists() {
        return Err("截屏程序目录不存在，请重新安装QuickClipboard".to_string());
    }
    
    let screenshot_exe = external_apps_dir.join("QCScreenshot.exe");
    
    if !screenshot_exe.exists() {
        return Err("截屏程序未找到或被删除\n\n请将QuickClipboardScreenshot.exe文件放入external_apps文件夹中".to_string());
    }
    
    println!("启动外部截屏程序: {}", screenshot_exe.display());
    
    // 启动外部截屏程序
    let mut command = Command::new(&screenshot_exe);
    command.current_dir(&external_apps_dir);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    
    match command.spawn() {
        Ok(mut child) => {
            println!("外部截屏程序已启动，PID: {:?}", child.id());
            
            // 读取子程序的输出来获取端口信息
            if let Some(stdout) = child.stdout.take() {
                let reader = BufReader::new(stdout);
                let app_handle_clone = app.clone();
                
                // 在新线程中读取输出，避免阻塞
                std::thread::spawn(move || {
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            println!("子程序输出: {}", line);
                            
                            // 解析端口信息，匹配子程序输出格式如 "QCScreenshot started on port: 8080"
                            if line.contains("QCScreenshot started on port:") {
                                if let Some(port_str) = line.split(':').last() {
                                    if let Ok(port) = port_str.trim().parse::<u16>() {
                                        crate::screenshot_service::set_screenshot_service_port_and_start_heartbeat(port, app_handle_clone.clone());
                                        println!("成功解析到端口: {}，心跳检测服务已启动", port);
                                        break;
                                    }
                                }
                            }
                            
                            // 也支持纯数字格式的端口输出
                            if let Ok(port) = line.trim().parse::<u16>() {
                                if port > 1024 && port < 65535 {
                                    crate::screenshot_service::set_screenshot_service_port_and_start_heartbeat(port, app_handle_clone.clone());
                                    println!("成功解析到端口: {}，心跳检测服务已启动", port);
                                    break;
                                }
                            }
                        }
                    }
                });
            }
            
            // 立即detach，不等待进程结束
            std::mem::forget(child);
            Ok(())
        }
        Err(e) => {
            eprintln!("启动截屏程序失败: {}", e);
            Err(format!("启动截屏程序失败: {}", e))
        }
    }
}
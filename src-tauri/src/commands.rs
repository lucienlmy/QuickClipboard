use serde::Deserialize;
use tauri::WebviewWindow;
use tauri::Manager;


use crate::admin_privileges;
use crate::clipboard_history::{self, ClipboardItem};
use crate::database::{FavoriteItem, GroupInfo};
use std::sync::atomic::Ordering;

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
    crate::services::clipboard_service::ClipboardService::get_text()
}

// 设置剪贴板文本
#[tauri::command]
pub fn set_clipboard_text(text: String) -> Result<(), String> {
    crate::services::clipboard_service::ClipboardService::set_text(text)
}

// 设置剪贴板文本（带HTML）
#[tauri::command]
pub fn set_clipboard_text_with_html(text: String, html: Option<String>) -> Result<(), String> {
    let html_content = html.unwrap_or_default();
    crate::services::clipboard_service::ClipboardService::set_content_with_html(text, html_content)
}

// 设置剪贴板图片
#[tauri::command]
pub fn set_clipboard_image(data_url: String) -> Result<(), String> {
    crate::services::clipboard_service::ClipboardService::set_image(data_url)
}

// 移动剪贴板项目到第一位
#[tauri::command]
pub fn move_clipboard_item_to_front(text: String) -> Result<(), String> {
    crate::services::clipboard_service::ClipboardService::move_to_front(text)
}

// 获取剪贴板历史
#[tauri::command]
pub fn get_clipboard_history() -> Vec<ClipboardItem> {
    crate::services::clipboard_service::ClipboardService::get_history()
}

// 刷新剪贴板监听函数，只添加新内容
#[tauri::command]
pub fn refresh_clipboard() -> Result<(), String> {
    crate::services::clipboard_service::ClipboardService::refresh_clipboard()
}

// 切换窗口显示/隐藏状态
#[tauri::command]
pub fn toggle_window_visibility(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::window_service::WindowService::toggle_visibility(&app)
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 窗口管理功能
#[tauri::command]
pub fn focus_clipboard_window(window: WebviewWindow) -> Result<(), String> {
    crate::services::window_service::WindowService::focus_clipboard_window(window)
}

#[tauri::command]
pub fn restore_last_focus() -> Result<(), String> {
    crate::services::window_service::WindowService::restore_last_focus()
}

#[tauri::command]
pub fn set_window_pinned(pinned: bool) -> Result<(), String> {
    crate::services::window_service::WindowService::set_pinned(pinned)
}

#[tauri::command]
pub fn get_window_pinned() -> bool {
    crate::services::window_service::WindowService::is_pinned()
}

// 如果主窗口是自动显示的，则隐藏它
#[tauri::command]
pub fn hide_main_window_if_auto_shown(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::window_service::WindowService::hide_if_auto_shown(&app)
}

// =================== 常用文本相关命令 ===================

// 获取所有常用文本
#[tauri::command]
pub fn get_quick_texts() -> Vec<FavoriteItem> {
    crate::services::quick_text_service::QuickTextService::get_all()
}

// 添加常用文本
#[tauri::command]
pub fn add_quick_text(
    title: String,
    content: String,
    groupName: String,
) -> Result<FavoriteItem, String> {
    crate::services::quick_text_service::QuickTextService::add(title, content, groupName)
}

// 更新常用文本
#[tauri::command]
pub fn update_quick_text(
    id: String,
    title: String,
    content: String,
    groupName: String,
) -> Result<FavoriteItem, String> {
    crate::services::quick_text_service::QuickTextService::update(id, title, content, groupName)
}

// 删除常用文本
#[tauri::command]
pub fn delete_quick_text(id: String) -> Result<(), String> {
    crate::services::quick_text_service::QuickTextService::delete(id)
}

// 将剪贴板历史项添加到常用文本
#[tauri::command]
pub fn add_clipboard_to_favorites(id: i64) -> Result<FavoriteItem, String> {
    crate::services::quick_text_service::QuickTextService::add_from_clipboard(id)
}

// =================== 鼠标监听控制命令 ===================

// 启用鼠标监听
#[tauri::command]
pub fn enable_mouse_monitoring_command() -> Result<(), String> {
    crate::services::mouse_service::MouseService::enable_monitoring()
}

// 禁用鼠标监听
#[tauri::command]
pub fn disable_mouse_monitoring_command() -> Result<(), String> {
    crate::services::mouse_service::MouseService::disable_monitoring()
}

// =================== 设置相关命令 ===================

/// 设置开机自启动
#[tauri::command]
pub fn set_startup_launch(enabled: bool) -> Result<(), String> {
    crate::settings::SettingsService::set_startup_launch(enabled)
}

/// 设置历史记录数量限制
#[tauri::command]
pub fn set_history_limit(limit: usize) -> Result<(), String> {
    crate::clipboard_history::set_history_limit(limit);
    Ok(())
}

// =================== 拖拽排序相关命令 ===================

// 移动剪贴板项目到指定位置
#[tauri::command]
pub fn move_clipboard_item(from_index: usize, to_index: usize) -> Result<(), String> {
    crate::services::drag_sort_service::DragSortService::move_clipboard_item(from_index, to_index)
}

// 移动常用文本到指定位置
#[tauri::command]
pub fn move_quick_text_item(item_id: String, to_index: usize) -> Result<(), String> {
    crate::services::drag_sort_service::DragSortService::move_quick_text_item(item_id, to_index)
}

// =================== 分组相关命令 ===================

// 获取所有分组
#[tauri::command]
pub fn get_groups() -> Vec<GroupInfo> {
    crate::services::group_service::GroupService::get_all_groups()
}

// 添加分组
#[tauri::command]
pub fn add_group(name: String, icon: String) -> Result<GroupInfo, String> {
    crate::services::group_service::GroupService::add_group(name, icon)
}

// 更新分组
#[tauri::command]
pub fn update_group(id: String, name: String, icon: String) -> Result<GroupInfo, String> {
    crate::services::group_service::GroupService::update_group(id, name, icon)
}

// 删除分组
#[tauri::command]
pub fn delete_group(id: String) -> Result<(), String> {
    crate::services::group_service::GroupService::delete_group(id)
}

// 按分组获取常用文本
#[tauri::command]
pub fn get_quick_texts_by_group(groupName: String) -> Vec<FavoriteItem> {
    crate::services::group_service::GroupService::get_quick_texts_by_group(groupName)
}

// 移动常用文本到分组
#[tauri::command]
pub fn move_quick_text_to_group(id: String, groupName: String) -> Result<(), String> {
    crate::services::group_service::GroupService::move_quick_text_to_group(id, groupName)
}

/// 打开设置窗口
#[tauri::command]
pub async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::settings::SettingsWindow::open(app).await
}

// =================== 文本编辑窗口命令 ===================

// 打开文本编辑窗口
#[tauri::command]
pub async fn open_text_editor_window(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::window_service::WindowService::open_text_editor_window(app).await
}

/// 获取设置
#[tauri::command]
pub fn get_settings() -> Result<serde_json::Value, String> {
    let settings = crate::settings::get_global_settings();
    Ok(crate::settings::SettingsConverter::to_json(&settings))
}

/// 重新加载设置
#[tauri::command]
pub fn reload_settings() -> Result<serde_json::Value, String> {
    let fresh_settings = crate::settings::SettingsStorage::load_or_default();
    
    if let Err(e) = crate::settings::update_global_settings(fresh_settings.clone()) {
        println!("更新全局设置失败: {}", e);
    }

    Ok(crate::settings::SettingsConverter::to_json(&fresh_settings))
}

/// 保存设置
#[tauri::command]
pub fn save_settings(
    app_handle: tauri::AppHandle,
    settings: serde_json::Value,
) -> Result<(), String> {
    crate::settings::SettingsService::save_settings(app_handle, settings)
}

// 调试日志
#[tauri::command]
pub fn log_debug(message: String) {
    crate::services::system_service::SystemService::log_debug(message);
}

// 浏览音效文件
#[tauri::command]
pub async fn browse_sound_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let file = app.dialog()
        .file()
        .add_filter("音频文件", &["wav", "mp3", "ogg", "flac", "m4a", "aac"])
        .set_title("选择音效文件")
        .blocking_pick_file();
    
    Ok(file.and_then(|f| f.as_path().map(|p| p.to_string_lossy().to_string())))
}

// 浏览背景图片文件
#[tauri::command]
pub async fn browse_image_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let file = app.dialog()
        .file()
        .add_filter("图片文件", &["png", "jpg", "jpeg", "bmp", "gif", "webp"])
        .set_title("选择背景图片")
        .blocking_pick_file();
    
    Ok(file.and_then(|f| f.as_path().map(|p| p.to_string_lossy().to_string())))
}

// 测试音效（异步版本）
#[tauri::command]
pub async fn test_sound(sound_path: String, volume: f32, sound_type: Option<String>) -> Result<(), String> {
    crate::services::sound_service::SoundService::test_sound(sound_path, volume, sound_type).await
}

// 播放粘贴音效（供键盘钩子调用）
#[tauri::command]
pub fn play_paste_sound() -> Result<(), String> {
    crate::services::sound_service::SoundService::play_paste_sound()
}

// 播放滚动音效（供预览窗口调用）
#[tauri::command]
pub fn play_scroll_sound() -> Result<(), String> {
    crate::services::sound_service::SoundService::play_scroll_sound()
}

// 清理音效缓存
#[tauri::command]
pub fn clear_sound_cache() -> Result<(), String> {
    crate::services::sound_service::SoundService::clear_sound_cache()
}

// 获取当前活跃音效播放数量
#[tauri::command]
pub fn get_active_sound_count() -> usize {
    crate::services::sound_service::SoundService::get_active_sound_count()
}

// 从剪贴板历史添加到分组
#[tauri::command]
pub fn add_clipboard_to_group(index: usize, groupName: String) -> Result<FavoriteItem, String> {
    crate::services::group_service::GroupService::add_clipboard_to_group(index, groupName)
}

// 设置主窗口为置顶
#[tauri::command]
pub fn set_super_topmost(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(true)
            .map_err(|e| format!("设置窗口置顶失败: {}", e))?;
        Ok(())
    } else {
        Err("找不到主窗口".to_string())
    }
}

// 获取音效播放状态
#[tauri::command]
pub fn get_sound_status() -> Result<serde_json::Value, String> {
    crate::services::sound_service::SoundService::get_sound_status()
}

// 获取图片文件路径
#[tauri::command]
pub fn get_image_file_path(content: String) -> Result<String, String> {
    crate::services::image_service::ImageService::get_image_file_path(content)
}

// 保存图片到指定路径
#[tauri::command]
pub fn save_image_to_file(content: String, file_path: String) -> Result<(), String> {
    crate::services::image_service::ImageService::save_image_to_file(content, file_path)
}

// 设置预览窗口当前索引
#[tauri::command]
pub fn set_preview_index(index: usize) -> Result<(), String> {
    crate::services::preview_service::PreviewService::set_preview_index(index)
}

// 取消预览（不粘贴直接隐藏）
#[tauri::command]
pub async fn cancel_preview() -> Result<(), String> {
    crate::services::preview_service::PreviewService::cancel_preview()
}

// 删除剪贴板项目
#[tauri::command]
pub fn delete_clipboard_item(id: i64) -> Result<(), String> {
    crate::database::delete_clipboard_item(id)
}

// 更新剪贴板项目内容
#[tauri::command]
pub fn update_clipboard_item(id: i64, content: String) -> Result<(), String> {
    crate::database::update_clipboard_item(id, content)
}

// 清空剪贴板历史
#[tauri::command]
pub fn clear_clipboard_history() -> Result<(), String> {
    clipboard_history::clear_all()
}

// 手动清理未使用的图片
#[tauri::command]
pub fn cleanup_unused_images() -> Result<String, String> {
    crate::clipboard_history::cleanup_orphaned_images();
    Ok("清理完成".to_string())
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
    crate::services::preview_service::PreviewService::notify_preview_tab_change(tab, groupName)
}

// 获取主窗口当前状态
#[tauri::command]
pub fn get_main_window_state() -> Result<serde_json::Value, String> {
    crate::services::preview_service::PreviewService::get_main_window_state()
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
    crate::services::translation_service::test_ai_translation().await
}

/// 取消正在进行的翻译
#[tauri::command]
pub fn cancel_translation() -> Result<(), String> {
    crate::services::translation_service::cancel_translation()
}

/// 启用AI翻译取消快捷键
#[tauri::command]
pub fn enable_ai_translation_cancel_shortcut() -> Result<(), String> {
    crate::services::translation_service::enable_ai_translation_cancel_shortcut()
}

/// 禁用AI翻译取消快捷键
#[tauri::command]
pub fn disable_ai_translation_cancel_shortcut() -> Result<(), String> {
    crate::services::translation_service::disable_ai_translation_cancel_shortcut()
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
    crate::services::translation_service::check_ai_translation_config()
}

// =================== 文件处理命令 ===================

#[tauri::command]
pub async fn copy_files_to_directory(
    files: Vec<String>,
    target_dir: String,
) -> Result<Vec<String>, String> {
    crate::services::file_operation_service::FileOperationService::copy_files_to_directory(files, target_dir).await
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<crate::file_handler::FileInfo, String> {
    crate::services::file_operation_service::FileOperationService::get_file_info(path).await
}

#[tauri::command]
pub async fn get_clipboard_files() -> Result<Vec<String>, String> {
    crate::services::file_operation_service::FileOperationService::get_clipboard_files().await
}

#[tauri::command]
pub async fn set_clipboard_files(files: Vec<String>) -> Result<(), String> {
    crate::services::file_operation_service::FileOperationService::set_clipboard_files(files).await
}

/// 获取可用的AI模型列表
#[tauri::command]
pub async fn get_available_ai_models() -> Result<Vec<String>, String> {
    crate::services::ai_service::AIService::get_available_ai_models().await
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
    crate::services::file_operation_service::FileOperationService::open_file_location(file_path).await
}
// 使用默认程序打开文件
#[tauri::command]
pub async fn open_file_with_default_program(file_path: String) -> Result<(), String> {
    crate::services::file_operation_service::FileOperationService::open_file_with_default_program(file_path).await
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
    crate::services::file_operation_service::FileOperationService::read_image_file(file_path)
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

// 恢复默认配置
#[tauri::command]
pub async fn reset_settings_to_default() -> Result<(), String> {
    crate::data_manager::reset_settings_to_default().await
}

// 获取应用数据目录
#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    crate::services::system_service::SystemService::get_app_data_dir()
}

// =================== 存储管理 ===================

/// 检查是否为便携版模式
#[tauri::command]
pub fn is_portable_mode() -> bool {
    crate::settings::SettingsStorage::is_portable_mode()
}

/// 获取存储信息
#[tauri::command]
pub fn get_storage_info() -> Result<crate::settings::StorageInfo, String> {
    let settings = crate::settings::get_global_settings();
    settings.get_storage_info()
}

/// 设置自定义存储位置
#[tauri::command]
pub async fn set_custom_storage_location(new_path: String, app: tauri::AppHandle) -> Result<(), String> {
    // 便携版模式下禁止更改存储位置
    if crate::settings::SettingsStorage::is_portable_mode() {
        return Err("便携版模式下无法更改数据存储位置".to_string());
    }
    
    let mut settings = crate::settings::get_global_settings();
    settings.set_custom_storage_path(new_path, Some(app)).await?;
    crate::settings::update_global_settings(settings)
}

/// 重置为默认存储位置
#[tauri::command]
pub async fn reset_to_default_storage_location(app: tauri::AppHandle) -> Result<(), String> {
    // 便携版模式下禁止更改存储位置
    if crate::settings::SettingsStorage::is_portable_mode() {
        return Err("便携版模式下无法更改数据存储位置".to_string());
    }
    
    let mut settings = crate::settings::get_global_settings();
    settings.reset_to_default_storage(Some(app)).await?;
    crate::settings::update_global_settings(settings)
}

/// 打开存储文件夹
#[tauri::command]
pub async fn open_storage_folder() -> Result<(), String> {
    let settings = crate::settings::get_global_settings();
    crate::settings::SettingsStorage::open_folder(&settings)
}

/// 保存窗口位置
#[tauri::command]
pub fn save_window_position(x: i32, y: i32) -> Result<(), String> {
    crate::settings::save_window_position(x, y)
}

/// 保存窗口大小
#[tauri::command]
pub fn save_window_size(width: u32, height: u32) -> Result<(), String> {
    crate::settings::save_window_size(width, height)
}

// 刷新所有文件类型项目的图标
pub fn refresh_file_icons(app_handle: tauri::AppHandle) -> Result<(), String> {
    crate::services::system_service::SystemService::refresh_file_icons(app_handle)
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

// =================== 内置截屏程序命令 ===================

// 启动内置截屏窗口
#[tauri::command]
pub fn start_builtin_screenshot(app: tauri::AppHandle) -> Result<(), String> {
    // 检查窗口是否已显示，防止重复请求
    if crate::screenshot::ScreenshotWindowManager::is_screenshot_window_visible() {
        return Ok(()); // 静默忽略重复请求
    }
    crate::screenshot::ScreenshotWindowManager::show_screenshot_window(&app)
}

// =================== 边缘吸附相关命令 ===================

// 初始化边缘吸附
#[tauri::command]
pub fn init_edge_snap() -> Result<(), String> {
    crate::edge_snap::init_edge_snap()
}

// 检查窗口边缘吸附
#[tauri::command]
pub fn check_window_edge_snap(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    
    if let Some(window) = app.get_webview_window("main") {
        crate::edge_snap::check_window_snap(&window)
    } else {
        Err("找不到主窗口".to_string())
    }
}

// 从吸附状态恢复窗口
#[tauri::command]
pub fn restore_window_from_snap(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    
    if let Some(window) = app.get_webview_window("main") {
        crate::edge_snap::restore_from_snap(&window)
    } else {
        Err("找不到主窗口".to_string())
    }
}


#[tauri::command]
pub fn get_screen_size() -> Result<(i32, i32), String> {
    crate::edge_snap::get_screen_size()
}

#[tauri::command]
pub fn start_custom_drag(app: tauri::AppHandle, mouse_screen_x: i32, mouse_screen_y: i32) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        crate::window_drag::start_custom_drag(window, mouse_screen_x, mouse_screen_y)
    } else {
        Err("找不到主窗口".to_string())
    }
}

#[tauri::command]
pub fn stop_custom_drag() -> Result<(), String> {
    crate::window_drag::stop_custom_drag()
}

#[tauri::command]
pub fn set_edge_hide_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    crate::services::edge_snap_service::EdgeSnapService::set_enabled(&app, enabled)
}

#[tauri::command]
pub fn is_edge_hide_enabled() -> bool {
    crate::services::edge_snap_service::EdgeSnapService::is_enabled()
}

#[tauri::command]
pub fn restore_edge_snap_on_startup(app: tauri::AppHandle) -> Result<(), String> {
    crate::services::edge_snap_service::EdgeSnapService::restore_on_startup(&app)
}

// 刷新所有窗口
#[tauri::command]
pub fn refresh_all_windows(app: tauri::AppHandle) -> Result<(), String> {
    println!("刷新所有窗口");
    
    // 获取所有窗口并刷新
    for (label, window) in app.webview_windows().iter() {
        println!("刷新窗口: {}", label);
        if let Err(e) = window.eval("window.location.reload()") {
            println!("刷新窗口 {} 失败: {}", label, e);
        }
    }
    
            Ok(())
}

// 设置快捷键录制状态
#[tauri::command]
pub fn set_shortcut_recording(recording: bool) -> Result<(), String> {
    crate::global_state::SHORTCUT_RECORDING.store(recording, Ordering::SeqCst);
    Ok(())
}

// 检查文件是否存在
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

// 创建贴图窗口
#[tauri::command]
pub async fn create_pin_image_window(
    app: tauri::AppHandle,
    image_data: Vec<u8>,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    crate::pin_image_window::show_pin_image_window(app, image_data, width, height, x, y).await
}

// 从文件路径创建贴图窗口
#[tauri::command]
pub async fn pin_image_from_file(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<(), String> {
    crate::pin_image_window::show_pin_image_from_file(app, file_path).await
}
use serde::Deserialize;
use tauri::WebviewWindow;
#[derive(Deserialize)]
pub struct PasteContentParams {
    /// 剪贴板历史项ID
    pub clipboard_id: Option<i64>,
    /// 常用文本ID
    pub quick_text_id: Option<String>,
}

/// 统一粘贴入口
pub async fn paste_content(
    params: PasteContentParams,
    window: WebviewWindow,
) -> Result<(), String> {
    // 从数据库获取内容
    let (content, html_content) = if let Some(id) = params.clipboard_id {
        get_clipboard_item_by_id(id)?
    } else if let Some(ref id) = params.quick_text_id {
        get_quick_text_by_id(id)?
    } else {
        return Err("必须提供 clipboard_id 或 quick_text_id".to_string());
    };

    // 根据内容类型执行相应的粘贴操作
    if content.starts_with("files:") {
        paste_files(content, &window).await
    } else if content.starts_with("data:image/") || content.starts_with("image:") {
        paste_image(content, &window).await
    } else {
        // 文本类型：判断是否需要翻译
        paste_text_with_html(content, html_content, &window).await
    }?;

    Ok(())
}

/// 根据ID从数据库获取剪贴板项目
fn get_clipboard_item_by_id(id: i64) -> Result<(String, Option<String>), String> {
    let result = crate::database::with_connection(|conn| {
        conn.query_row(
            "SELECT content, html_content FROM clipboard WHERE id = ?",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?
                ))
            }
        )
    });
    
    // 转换错误信息
    result.map_err(|e| {
        if e.contains("Query returned no rows") {
            format!("未找到ID为 {} 的剪贴板项，可能已被删除或数据不同步", id)
        } else {
            e
        }
    })
}

/// 根据ID从数据库获取常用文本
fn get_quick_text_by_id(id: &str) -> Result<(String, Option<String>), String> {
    let result = crate::database::with_connection(|conn| {
        conn.query_row(
            "SELECT content, html_content FROM favorites WHERE id = ?",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?
                ))
            }
        )
    });
    
    result.map_err(|e| {
        if e.contains("Query returned no rows") {
            format!("未找到ID为 {} 的常用文本", id)
        } else {
            e
        }
    })
}

/// 粘贴文本内容
pub async fn paste_text_with_html(
    text_content: String,
    html_content: Option<String>,
    window: &WebviewWindow,
) -> Result<(), String> {
    // 检查是否需要翻译
    let settings = crate::settings::get_global_settings();
    let should_translate = crate::ai_translator::is_translation_config_valid(&settings)
        && settings.ai_translate_on_paste;

    if should_translate {
        // 发送翻译相关事件
        send_translation_events(window, &text_content, "文本粘贴").await;

        // 使用智能翻译命令，根据设置自动选择输出方式
        match crate::services::translation_service::translate_text_smart(text_content.clone()).await
        {
            Ok(_) => {
                send_translation_success_events(window, &text_content, "文本粘贴").await;
                handle_window_after_paste(window)?;
                return Ok(());
            }
            Err(e) => {
                send_translation_error_events(window, &e, "文本粘贴").await;
                // 翻译失败，继续执行普通粘贴
            }
        }
    }

    // 执行普通文本粘贴
    paste_text_without_translation_internal_with_html(text_content, html_content, window).await
}

/// 粘贴文本内容
async fn paste_text_without_translation_internal_with_html(
    text_content: String,
    html_content: Option<String>,
    window: &WebviewWindow,
) -> Result<(), String> {
    // 开始粘贴操作，增加粘贴计数器
    crate::clipboard_monitor::start_pasting_operation();

    // 获取格式设置
    let settings = crate::settings::get_global_settings();
    let use_html = html_content.is_some() && settings.paste_with_format;

    // 将文本设置到剪贴板（不添加到历史记录，避免重复）
    let result = if use_html {
        crate::clipboard_content::set_clipboard_content_no_history_with_html(
            text_content,
            html_content,
        )
    } else {
        crate::clipboard_content::set_clipboard_content_no_history(text_content)
    };

    if let Err(e) = result {
        crate::clipboard_monitor::end_pasting_operation();
        return Err(e);
    }

    // 短暂延迟确保剪贴板内容完全设置
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    // 执行粘贴操作
    if !crate::paste_utils::windows_paste() {
        crate::clipboard_monitor::end_pasting_operation();
        return Err("粘贴操作失败".to_string());
    }

    // 播放粘贴音效
    crate::sound_manager::play_paste_sound();

    // 处理窗口显示/隐藏
    handle_window_after_paste(window)?;

    // 延迟结束粘贴操作，确保剪贴板监听器能正确识别
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
        crate::clipboard_monitor::end_pasting_operation();
    });

    Ok(())
}

/// 粘贴图片内容
pub async fn paste_image(image_content: String, window: &WebviewWindow) -> Result<(), String> {
    // 开始粘贴操作，增加粘贴计数器
    crate::clipboard_monitor::start_pasting_operation();

    // 处理图片内容到剪贴板
    if image_content.starts_with("image:") {
        // 需要通过图片管理器获取完整数据
        let image_id = &image_content[6..];

        let image_manager = crate::image_manager::get_image_manager().map_err(|e| {
            crate::clipboard_monitor::end_pasting_operation();
            format!("获取图片管理器失败: {}", e)
        })?;

        let (bgra, png_bytes, width, height, file_path) = {
            let manager = image_manager.lock().unwrap();
            
            let (bgra, png_bytes, width, height) = manager.get_image_bgra_and_png(image_id).map_err(|e| {
                crate::clipboard_monitor::end_pasting_operation();
                format!("获取图片数据失败: {}", e)
            })?;

            let file_path = manager.get_image_file_path(image_id).map_err(|e| {
                crate::clipboard_monitor::end_pasting_operation();
                format!("获取图片文件路径失败: {}", e)
            })?;

            (bgra, png_bytes, width, height, file_path)
        }; 

        // 直接设置剪贴板内容，包含图像数据和文件路径
        #[cfg(windows)]
        {
            use crate::clipboard_content::set_windows_clipboard_image_with_file;
            use crate::utils::window_utils::get_active_window_process_name;
            let settings = crate::settings::get_global_settings();
            let prefers_image_data = get_active_window_process_name()
                .map(|process| {
                    let process_lower = process.to_lowercase();
                    let is_priority = settings
                        .image_data_priority_apps
                        .iter()
                        .any(|app| process_lower.contains(&app.to_lowercase()));
                    
                    is_priority
                })
                .unwrap_or(false);
            let file_path_opt = if prefers_image_data {
                None
            } else {
                Some(file_path.as_str())
            };
            if let Err(e) =
                set_windows_clipboard_image_with_file(&bgra, &png_bytes, width, height, file_path_opt)
            {
                crate::clipboard_monitor::end_pasting_operation();
                return Err(e);
            }

            // 检测目标应用是否为文件管理器，只对文件管理器延迟
            let is_file_manager = crate::utils::window_utils::is_target_file_manager();
            if is_file_manager {
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            }
        }
        #[cfg(not(windows))]
        {
            // 非Windows系统，使用原有逻辑
            if let Err(e) = crate::clipboard_content::set_clipboard_content_no_history(image_data) {
                crate::clipboard_monitor::end_pasting_operation();
                return Err(e);
            }
        }
    } else if image_content.starts_with("data:image/") {
        // 旧格式：完整的data URL
        if let Err(e) = crate::clipboard_content::set_clipboard_content_no_history(image_content) {
            crate::clipboard_monitor::end_pasting_operation();
            return Err(e);
        }
    } else {
        crate::clipboard_monitor::end_pasting_operation();
        return Err("不支持的图片格式".to_string());
    }

    // 执行粘贴操作
    if !crate::paste_utils::windows_paste() {
        crate::clipboard_monitor::end_pasting_operation();
        return Err("粘贴操作失败".to_string());
    }

    // 播放粘贴音效
    crate::sound_manager::play_paste_sound();

    // 处理窗口显示/隐藏
    handle_window_after_paste(window)?;

    // 延迟结束粘贴操作，确保剪贴板监听器能正确识别
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
        crate::clipboard_monitor::end_pasting_operation();
    });

    Ok(())
}

/// 粘贴文件内容
pub async fn paste_files(files_data: String, window: &WebviewWindow) -> Result<(), String> {
    // 解析文件数据
    if !files_data.starts_with("files:") {
        return Err("无效的文件数据格式".to_string());
    }

    let files_json = &files_data[6..]; // 去掉 "files:" 前缀
    let files_data: serde_json::Value =
        serde_json::from_str(files_json).map_err(|e| format!("解析文件数据失败: {}", e))?;

    let files = files_data["files"].as_array().ok_or("文件数据格式错误")?;

    let file_paths: Vec<String> = files
        .iter()
        .filter_map(|file| file["path"].as_str())
        .map(|path| path.to_string())
        .collect();

    let valid_file_paths: Vec<String> = file_paths
        .into_iter()
        .filter(|path| std::path::Path::new(path).exists())
        .collect();

    if valid_file_paths.is_empty() {
        return Err("没有找到有效的文件路径".to_string());
    }

    // 开始粘贴操作，增加粘贴计数器
    crate::clipboard_monitor::start_pasting_operation();

    // 设置剪贴板文件
    if let Err(e) = crate::file_handler::set_clipboard_files(&valid_file_paths) {
        crate::clipboard_monitor::end_pasting_operation();
        return Err(e);
    }

    // 执行粘贴操作
    if !crate::paste_utils::windows_paste() {
        crate::clipboard_monitor::end_pasting_operation();
        return Err("粘贴操作失败".to_string());
    }

    // 播放粘贴音效
    crate::sound_manager::play_paste_sound();

    // 处理窗口显示/隐藏
    handle_window_after_paste(window)?;

    // 延迟结束粘贴操作，确保剪贴板监听器能正确识别
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
        crate::clipboard_monitor::end_pasting_operation();
    });

    Ok(())
}

/// 处理粘贴后的窗口状态
fn handle_window_after_paste(window: &WebviewWindow) -> Result<(), String> {
    let is_pinned = crate::state_manager::is_window_pinned();
    if !is_pinned {
        // 使用专门的窗口隐藏逻辑
        crate::window_management::hide_webview_window(window.clone());
    }
    Ok(())
}

/// 发送翻译相关事件
async fn send_translation_events(window: &WebviewWindow, text: &str, source: &str) {
    use tauri::Emitter;

    // 发送显示翻译指示器事件
    if let Err(e) = window.emit(
        "show-translation-indicator",
        serde_json::json!({
            "text": "正在翻译...",
            "source": source
        }),
    ) {
        eprintln!("发送显示翻译指示器事件失败: {}", e);
    }

    // 发送翻译开始通知
    let start_message = format!("开始翻译 ({} 字符)", text.len());
    if let Err(e) = window.emit(
        "translation-start",
        serde_json::json!({
            "message": start_message,
            "source": source,
            "textLength": text.len()
        }),
    ) {
        eprintln!("发送翻译开始通知失败: {}", e);
    }

    // 发送翻译状态通知
    if let Err(e) = window.emit(
        "translation-status",
        serde_json::json!({
            "status": "translating",
            "message": "正在翻译...",
            "source": source
        }),
    ) {
        eprintln!("发送翻译状态通知失败: {}", e);
    }
}

/// 发送翻译成功事件
async fn send_translation_success_events(window: &WebviewWindow, text: &str, source: &str) {
    use tauri::Emitter;

    // 发送翻译成功通知
    let success_message = format!("翻译完成 ({} 字符)", text.len());
    if let Err(e) = window.emit(
        "translation-success",
        serde_json::json!({
            "message": success_message,
            "source": source,
            "originalLength": text.len()
        }),
    ) {
        eprintln!("发送翻译成功通知失败: {}", e);
    }

    // 发送隐藏翻译指示器事件
    if let Err(e) = window.emit(
        "hide-translation-indicator",
        serde_json::json!({
            "source": source
        }),
    ) {
        eprintln!("发送隐藏翻译指示器事件失败: {}", e);
    }
}

/// 发送翻译错误事件
async fn send_translation_error_events(window: &WebviewWindow, error: &str, source: &str) {
    use tauri::Emitter;

    // 发送翻译失败通知
    if let Err(e) = window.emit(
        "translation-error",
        serde_json::json!({
            "message": format!("翻译失败，使用普通粘贴: {}", error),
            "source": source,
            "error": error
        }),
    ) {
        eprintln!("发送翻译失败通知失败: {}", e);
    }

    // 发送隐藏翻译指示器事件
    if let Err(e) = window.emit(
        "hide-translation-indicator",
        serde_json::json!({
            "source": source
        }),
    ) {
        eprintln!("发送隐藏翻译指示器事件失败: {}", e);
    }
}

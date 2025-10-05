// 翻译服务模块
//
// 整合 ai_translator 和 text_input_simulator 模块，提供高级的翻译服务

use crate::ai_translator::{config_from_settings, AITranslator, TranslationResult};
use crate::settings;
use std::sync::atomic::{AtomicBool, Ordering};

// 全局翻译状态管理
static TRANSLATION_CANCELLED: AtomicBool = AtomicBool::new(false);

/// 翻译守护结构，确保在函数结束时清理资源
pub struct TranslationGuard;

impl Drop for TranslationGuard {
    fn drop(&mut self) {
        #[cfg(windows)]
        {
            crate::global_state::disable_ai_translation_cancel();
            // 恢复导航按键
            crate::shortcut_interceptor::set_translation_in_progress(false);
        }
    }
}

/// 智能翻译文本（根据设置选择流式输入或直接粘贴）
pub async fn translate_text_smart(text: String) -> Result<(), String> {
    let settings = settings::get_global_settings();

    // 根据输出模式设置选择翻译方式
    match settings.ai_output_mode.as_str() {
        "paste" => {
            println!("使用直接粘贴模式进行翻译");
            translate_and_paste_text(text).await
        }
        "stream" | _ => {
            println!("使用流式输入模式进行翻译");
            translate_and_input_text(text).await
        }
    }
}

/// 翻译文本并直接粘贴（非流式）
pub async fn translate_and_paste_text(text: String) -> Result<(), String> {
    // 重置取消状态
    TRANSLATION_CANCELLED.store(false, Ordering::SeqCst);

    // 启用AI翻译取消快捷键
    #[cfg(windows)]
    crate::global_state::enable_ai_translation_cancel();

    // 禁用导航按键以防止翻译过程中的按键触发导航
    #[cfg(windows)]
    crate::shortcut_interceptor::set_translation_in_progress(true);

    // 确保在函数结束时禁用快捷键和恢复导航按键
    let _guard = TranslationGuard;

    let settings = settings::get_global_settings();

    // 检查翻译是否启用
    if !settings.ai_translation_enabled {
        return Err("AI翻译功能未启用".to_string());
    }

    // 检查配置是否有效
    if !crate::ai_translator::is_translation_config_valid(&settings) {
        return Err("AI翻译配置不完整".to_string());
    }

    // 预处理输入文本
    let processed_text = preprocess_translation_text(&text)?;

    // 创建翻译配置
    let translation_config = config_from_settings(&settings);

    // 创建翻译器
    let translator =
        AITranslator::new(translation_config).map_err(|e| format!("创建翻译器失败: {}", e))?;

    // 开始翻译（非流式）
    match translator.translate(&processed_text).await {
        Ok(translated_text) => {
            // 检查是否被取消
            if TRANSLATION_CANCELLED.load(Ordering::SeqCst) {
                println!("翻译在粘贴前被用户取消");
                return Err("翻译已被取消".to_string());
            }

            println!("翻译完成，结果长度: {} 字符", translated_text.len());

            // 设置剪贴板内容并粘贴
            crate::clipboard_monitor::start_pasting_operation();

            // 使用现有的剪贴板设置功能
            crate::clipboard_content::set_clipboard_content_no_history(translated_text)?;

            // 执行粘贴操作
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(10));
                #[cfg(windows)]
                crate::paste_utils::windows_paste();

                // 播放粘贴音效
                crate::sound_manager::play_paste_sound();

                // 粘贴完成后结束粘贴操作
                std::thread::sleep(std::time::Duration::from_millis(500));
                crate::clipboard_monitor::end_pasting_operation();
            });

            Ok(())
        }
        Err(e) => Err(format!("翻译失败: {}", e)),
    }
}

/// 翻译文本并流式输入
pub async fn translate_and_input_text(text: String) -> Result<(), String> {
    // 重置取消状态
    TRANSLATION_CANCELLED.store(false, Ordering::SeqCst);

    // 启用AI翻译取消快捷键
    #[cfg(windows)]
    crate::global_state::enable_ai_translation_cancel();

    // 禁用导航按键以防止翻译过程中的回车键触发导航
    #[cfg(windows)]
    crate::shortcut_interceptor::set_translation_in_progress(true);

    // 确保在函数结束时禁用快捷键和恢复导航按键
    let _guard = TranslationGuard;

    let settings = settings::get_global_settings();

    // 检查翻译是否启用
    if !settings.ai_translation_enabled {
        return Err("AI翻译功能未启用".to_string());
    }

    // 检查配置是否有效
    if !crate::ai_translator::is_translation_config_valid(&settings) {
        return Err("AI翻译配置不完整".to_string());
    }

    // 预处理输入文本
    let processed_text = preprocess_translation_text(&text)?;

    // 创建翻译配置
    let translation_config = config_from_settings(&settings);
    let input_config = crate::text_input_simulator::config_from_settings(&settings);

    // 创建翻译器
    let translator =
        AITranslator::new(translation_config).map_err(|e| format!("创建翻译器失败: {}", e))?;

    // 更新输入模拟器配置
    crate::text_input_simulator::update_global_input_simulator_config(input_config);

    // 开始翻译
    match translator.translate_stream(&processed_text).await {
        Ok(mut receiver) => {
            let mut accumulated_text = String::new();
            let mut chunk_count = 0;

            // 处理流式响应并实时输入
            while let Some(translation_result) = receiver.recv().await {
                // 检查是否被取消
                if TRANSLATION_CANCELLED.load(Ordering::SeqCst) {
                    println!("翻译被用户取消");
                    return Err("翻译已被取消".to_string());
                }

                match translation_result {
                    TranslationResult::Chunk(chunk) => {
                        // 再次检查是否被取消（在输入前）
                        if TRANSLATION_CANCELLED.load(Ordering::SeqCst) {
                            println!("翻译在输入前被用户取消");
                            return Err("翻译已被取消".to_string());
                        }

                        // 累积文本用于错误恢复
                        accumulated_text.push_str(&chunk);
                        chunk_count += 1;

                        // 使用改进的智能输入方法
                        match crate::text_input_simulator::simulate_text_chunk_input_smart(&chunk)
                            .await
                        {
                            Ok(()) => {
                                // 成功时不输出信息，减少日志噪音
                            }
                            Err(e) => {
                                println!("输入失败: {}", e);

                                // 尝试使用降级输入方法
                                match crate::text_input_simulator::simulate_text_chunk_input_precise(&chunk).await {
                                    Ok(()) => {
                                        println!("降级输入成功");
                                    }
                                    Err(fallback_error) => {
                                        println!("降级输入也失败: {}", fallback_error);
                                        // 继续处理下一个片段，而不是完全失败
                                    }
                                }
                            }
                        }
                    }
                    TranslationResult::Complete => {
                        println!(
                            "翻译完成，总共处理 {} 个片段，累积长度: {}",
                            chunk_count,
                            accumulated_text.len()
                        );
                        break;
                    }
                    TranslationResult::Error(e) => {
                        return Err(format!("翻译失败: {}", e));
                    }
                }
            }

            Ok(())
        }
        Err(e) => Err(format!("启动翻译失败: {}", e)),
    }
}

/// 取消正在进行的翻译
pub fn cancel_translation() -> Result<(), String> {
    TRANSLATION_CANCELLED.store(true, Ordering::SeqCst);
    println!("翻译已被用户取消");
    Ok(())
}

/// 复制时翻译并直接输入到目标位置
pub async fn translate_and_input_on_copy(text: String) -> Result<(), String> {
    // 重置取消状态
    TRANSLATION_CANCELLED.store(false, Ordering::SeqCst);

    // 启用AI翻译取消快捷键
    #[cfg(windows)]
    crate::global_state::enable_ai_translation_cancel();

    // 禁用导航按键以防止翻译过程中的按键触发导航
    #[cfg(windows)]
    crate::shortcut_interceptor::set_translation_in_progress(true);

    // 确保在函数结束时禁用快捷键和恢复导航按键
    let _guard = TranslationGuard;

    let settings = settings::get_global_settings();

    // 检查翻译是否启用
    if !settings.ai_translation_enabled {
        return Err("AI翻译功能未启用".to_string());
    }

    // 检查配置是否有效
    if !crate::ai_translator::is_translation_config_valid(&settings) {
        return Err("AI翻译配置不完整".to_string());
    }

    // 预处理输入文本
    let processed_text = preprocess_translation_text(&text)?;

    // 创建翻译配置和输入配置
    let translation_config = config_from_settings(&settings);
    let input_config = crate::text_input_simulator::config_from_settings(&settings);

    // 创建翻译器
    let translator =
        AITranslator::new(translation_config).map_err(|e| format!("创建翻译器失败: {}", e))?;

    // 更新输入模拟器配置
    crate::text_input_simulator::update_global_input_simulator_config(input_config);

    println!("开始复制时翻译，原文长度: {} 字符", processed_text.len());

    // 根据输出模式选择翻译方式
    match settings.ai_output_mode.as_str() {
        "paste" => {
            // 直接粘贴模式：翻译后设置剪贴板并粘贴
            println!("复制时翻译使用直接粘贴模式");
            match translator.translate(&processed_text).await {
                Ok(translated_text) => {
                    // 检查是否被取消
                    if TRANSLATION_CANCELLED.load(Ordering::SeqCst) {
                        println!("翻译在粘贴前被用户取消");
                        return Err("翻译已被取消".to_string());
                    }

                    println!("复制时翻译完成，结果长度: {} 字符", translated_text.len());

                    // 设置粘贴状态，防止触发新的复制检测
                    crate::clipboard_monitor::start_pasting_operation();

                    // 设置剪贴板内容并粘贴
                    crate::clipboard_content::set_clipboard_content_no_history(translated_text)?;

                    // 执行粘贴操作
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(10));
                        #[cfg(windows)]
                        crate::paste_utils::windows_paste();

                        // 播放粘贴音效
                        crate::sound_manager::play_paste_sound();

                        // 粘贴完成后结束粘贴操作
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        crate::clipboard_monitor::end_pasting_operation();
                    });

                    Ok(())
                }
                Err(e) => Err(format!("复制时翻译失败: {}", e)),
            }
        }
        "stream" | _ => {
            // 流式输入模式：翻译后直接输入到目标位置
            println!("复制时翻译使用流式输入模式");
            match translator.translate_stream(&processed_text).await {
                Ok(mut receiver) => {
                    let mut accumulated_text = String::new();
                    let mut chunk_count = 0;

                    // 处理流式翻译结果
                    loop {
                        // 检查是否被取消
                        if TRANSLATION_CANCELLED.load(Ordering::SeqCst) {
                            println!("复制时翻译被用户取消");
                            return Err("翻译已被取消".to_string());
                        }

                        match receiver.recv().await {
                            Some(result) => match result {
                                TranslationResult::Chunk(chunk) => {
                                    // 累积文本用于错误恢复
                                    accumulated_text.push_str(&chunk);
                                    chunk_count += 1;

                                    // 使用改进的智能输入方法
                                    match crate::text_input_simulator::simulate_text_chunk_input_smart(&chunk).await {
                                        Ok(()) => {
                                            // 成功时不输出信息，减少日志噪音
                                        }
                                        Err(e) => {
                                            println!("输入失败: {}", e);

                                            // 尝试使用降级输入方法
                                            match crate::text_input_simulator::simulate_text_chunk_input_precise(&chunk).await {
                                                Ok(()) => {
                                                    println!("降级输入成功");
                                                }
                                                Err(fallback_error) => {
                                                    println!("降级输入也失败: {}", fallback_error);
                                                    // 继续处理下一个片段，而不是完全失败
                                                }
                                            }
                                        }
                                    }
                                }
                                TranslationResult::Complete => {
                                    println!(
                                        "复制时翻译完成，总共处理 {} 个片段，累积长度: {}",
                                        chunk_count,
                                        accumulated_text.len()
                                    );
                                    break;
                                }
                                TranslationResult::Error(e) => {
                                    return Err(format!("复制时翻译失败: {}", e));
                                }
                            },
                            None => {
                                println!("翻译流意外结束");
                                break;
                            }
                        }
                    }

                    Ok(())
                }
                Err(e) => Err(format!("启动复制时翻译失败: {}", e)),
            }
        }
    }
}

/// 预处理翻译文本
fn preprocess_translation_text(text: &str) -> Result<String, String> {
    // 检查文本长度
    if text.is_empty() {
        return Err("输入文本为空".to_string());
    }

    if text.len() > 50_000 {
        return Err("输入文本过长，超过50KB限制".to_string());
    }

    // 规范化文本格式
    let normalized = text
        .replace("\r\n", "\n") // 统一换行符
        .replace('\r', "\n"); // 处理Mac格式换行符

    // 移除过多的连续空行（保留最多2个连续换行）
    let cleaned = regex::Regex::new(r"\n{3,}")
        .unwrap()
        .replace_all(&normalized, "\n\n")
        .to_string();

    Ok(cleaned)
}

/// 测试AI翻译配置
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

/// 启用AI翻译取消快捷键
pub fn enable_ai_translation_cancel_shortcut() -> Result<(), String> {
    #[cfg(windows)]
    crate::global_state::enable_ai_translation_cancel();
    Ok(())
}

/// 禁用AI翻译取消快捷键
pub fn disable_ai_translation_cancel_shortcut() -> Result<(), String> {
    #[cfg(windows)]
    crate::global_state::disable_ai_translation_cancel();
    Ok(())
}

/// 检查AI翻译配置是否有效
pub fn check_ai_translation_config() -> Result<bool, String> {
    let settings = crate::settings::get_global_settings();
    Ok(crate::ai_translator::is_translation_config_valid(&settings))
}

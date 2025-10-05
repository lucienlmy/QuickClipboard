use once_cell::sync::OnceCell;
use serde_json::json;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder};

// 预览窗口状态
pub static PREVIEW_WINDOW_VISIBLE: AtomicBool = AtomicBool::new(false);
pub static PREVIEW_CURRENT_INDEX: AtomicUsize = AtomicUsize::new(0);
static PREVIEW_WINDOW_HANDLE: OnceCell<Mutex<Option<WebviewWindow>>> = OnceCell::new();

// 主窗口状态
static MAIN_WINDOW_STATE: OnceCell<Mutex<MainWindowState>> = OnceCell::new();

#[derive(Debug, Clone)]
struct MainWindowState {
    tab: String,
    group_id: String,
}

// 初始化预览窗口句柄存储
pub fn init_preview_window() {
    PREVIEW_WINDOW_HANDLE.set(Mutex::new(None)).ok();
    // 确保状态初始化为 false
    PREVIEW_WINDOW_VISIBLE.store(false, Ordering::SeqCst);
    PREVIEW_CURRENT_INDEX.store(0, Ordering::SeqCst);

    // 重置预览状态
    #[cfg(windows)]
    crate::global_state::PREVIEW_SHORTCUT_HELD.store(false, std::sync::atomic::Ordering::SeqCst);
}

// 显示预览窗口
pub async fn show_preview_window(app: AppHandle) -> Result<(), String> {
    // 检查预览窗口是否启用
    let settings = crate::settings::get_global_settings();
    if !settings.preview_enabled {
        return Ok(());
    }

    // 防止快速连续调用导致的竞态条件
    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

    // 根据当前设置调整窗口尺寸
    let width = 350.0;
    let item_height = 35.0; // 每个项目的实际高度
    let item_gap = 4.0; // 项目间隔
    let container_padding = 16.0; // 容器上下内边距

    // 计算总高度：容器内边距 + (项目数量 * 项目高度) + ((项目数量-1) * 间隔) + 额外高度
    let extra_height = 10.0 * (item_height + item_gap);
    let height = container_padding
        + (settings.preview_items_count as f64 * item_height)
        + ((settings.preview_items_count as f64 - 1.0).max(0.0) * item_gap)
        + extra_height;
    println!(
        "根据项目数量({})调整窗口尺寸: {}x{}",
        settings.preview_items_count, width, height
    );

    let window_handle = PREVIEW_WINDOW_HANDLE.get().unwrap();
    let mut window_guard = window_handle.lock().unwrap();

    // 如果窗口不存在，获取已存在的窗口
    if window_guard.is_none() {
        println!("预览窗口句柄不存在，尝试获取已存在的窗口");
        if let Some(window) = app.get_webview_window("preview") {
            println!("找到已存在的预览窗口");
            *window_guard = Some(window);
        } else {
            println!("预览窗口不存在，开始创建");
            let window = create_preview_window(app).await?;
            *window_guard = Some(window);
            println!("预览窗口创建完成");
        }
    }

    if let Some(window) = window_guard.as_ref() {
        println!("开始定位和显示预览窗口");

        // 调整窗口尺寸
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: width as u32,
                height: height as u32,
            }))
            .map_err(|e| format!("设置窗口尺寸失败: {}", e))?;
        println!("窗口尺寸已调整为: {}x{}", width, height);

        // 定位窗口到屏幕右下角
        position_preview_window(window)?;
        println!("窗口定位完成");

        // 显示窗口
        window
            .show()
            .map_err(|e| format!("显示预览窗口失败: {}", e))?;
        println!("窗口显示命令已发送");

        // 设置窗口属性
        #[cfg(windows)]
        set_preview_window_properties(window)?;

        PREVIEW_WINDOW_VISIBLE.store(true, Ordering::SeqCst);

        // 重置索引
        PREVIEW_CURRENT_INDEX.store(0, Ordering::SeqCst);

        // 重置用户取消标志
        #[cfg(windows)]
        crate::global_state::PREVIEW_CANCELLED_BY_USER
            .store(false, std::sync::atomic::Ordering::SeqCst);

        // 通知前端索引已重置
        let _ = window.emit("preview-index-changed", serde_json::json!({ "index": 0 }));

        // 启用鼠标监听以捕获滚轮事件
        #[cfg(windows)]
        {
            crate::mouse_hook::request_mouse_monitoring("preview_window");
        }

        // 通知前端刷新数据
        let _ = window.emit("clipboard-history-updated", ());

        // 在开发模式下打开开发者工具
        #[cfg(debug_assertions)]
        {
            let _ = window.open_devtools();
            println!("预览窗口开发者工具已打开");
        }

        println!("预览窗口已显示");
    }

    Ok(())
}

// 隐藏预览窗口
pub async fn hide_preview_window() -> Result<(), String> {
    let window_handle = PREVIEW_WINDOW_HANDLE.get().unwrap();
    let window_guard = window_handle.lock().unwrap();

    if let Some(window) = window_guard.as_ref() {
        window
            .hide()
            .map_err(|e| format!("隐藏预览窗口失败: {}", e))?;
        PREVIEW_WINDOW_VISIBLE.store(false, Ordering::SeqCst);

        // 释放预览窗口的鼠标监听请求
        #[cfg(windows)]
        {
            crate::mouse_hook::release_mouse_monitoring("preview_window");
        }

        println!("预览窗口已隐藏");
    }

    Ok(())
}

// 创建预览窗口
async fn create_preview_window(app: AppHandle) -> Result<WebviewWindow, String> {
    // 获取预览窗口设置
    let settings = crate::settings::get_global_settings();

    // 根据项目数量动态计算窗口尺寸
    let width = 400.0; // 固定宽度
    let item_height = 35.0; // 每个项目的实际高度（内边距16px + 文本17px + 边框2px）
    let item_gap = 4.0; // 项目间隔
    let container_padding = 16.0; // 容器上下内边距（8px * 2）

    // 计算总高度：容器内边距 + (项目数量 * 项目高度) + ((项目数量-1) * 间隔) + 额外高度
    let extra_height = 10.0 * (item_height + item_gap);
    let height = container_padding
        + (settings.preview_items_count as f64 * item_height)
        + ((settings.preview_items_count as f64 - 1.0).max(0.0) * item_gap)
        + extra_height;

    println!("开始创建预览窗口，使用配置:");
    println!("- 项目数量: {}", settings.preview_items_count);
    println!("- 计算尺寸: {}x{}", width, height);
    println!("- 透明: true");
    println!("- 置顶: true");
    println!("- 无焦点: true");
    println!("- 启用状态: {}", settings.preview_enabled);

    // 如果预览功能被禁用，返回错误
    if !settings.preview_enabled {
        return Err("预览窗口功能已禁用".to_string());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        "preview",
        tauri::WebviewUrl::App("preview.html".into()),
    )
    .title("快速预览")
    .inner_size(width, height)
    .min_inner_size(width, height)
    .max_inner_size(width, height)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .visible(false)
    // .shadow(false) // 禁用阴影
    .build()
    .map_err(|e| format!("创建预览窗口失败: {}", e))?;

    Ok(window)
}

// 定位预览窗口到鼠标位置
fn position_preview_window(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetCursorPos, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
        };

        unsafe {
            // 获取当前鼠标位置
            let mut cursor_pos = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut cursor_pos).is_ok() {
                // 获取屏幕尺寸
                let screen_width = GetSystemMetrics(SM_CXSCREEN);
                let screen_height = GetSystemMetrics(SM_CYSCREEN);

                // 窗口尺寸
                let window_width = 350;
                let window_height = 180;

                // 计算窗口位置，确保不超出屏幕边界
                let mut x = cursor_pos.x + 10; // 鼠标右侧偏移10像素
                let mut y = cursor_pos.y - window_height / 2; // 鼠标垂直居中

                // 边界检查
                if x + window_width > screen_width {
                    x = cursor_pos.x - window_width - 10; // 显示在鼠标左侧
                }
                if y < 0 {
                    y = 10; // 距离顶部10像素
                } else if y + window_height > screen_height {
                    y = screen_height - window_height - 10; // 距离底部10像素
                }

                println!(
                    "鼠标位置: ({}, {}), 窗口位置: ({}, {})",
                    cursor_pos.x, cursor_pos.y, x, y
                );

                window
                    .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
                    .map_err(|e| format!("设置窗口位置失败: {}", e))?;
            } else {
                // 如果获取鼠标位置失败，使用屏幕中心
                let x = (GetSystemMetrics(SM_CXSCREEN) - 350) / 2;
                let y = (GetSystemMetrics(SM_CYSCREEN) - 180) / 2;

                window
                    .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
                    .map_err(|e| format!("设置窗口位置失败: {}", e))?;
            }
        }
    }

    #[cfg(not(windows))]
    {
        // 非Windows平台的简单实现 - 屏幕中心
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: 500,
                y: 300,
            }))
            .map_err(|e| format!("设置窗口位置失败: {}", e))?;
    }

    Ok(())
}

// 设置预览窗口属性（Windows特定）
#[cfg(windows)]
fn set_preview_window_properties(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    };

    if let Ok(hwnd) = window.hwnd() {
        let hwnd = HWND(hwnd.0 as isize);

        unsafe {
            // 设置扩展样式：无焦点、工具窗口、置顶
            let ex_style = WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TOPMOST.0;
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style as isize);

            // 设置为最顶层
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE).ok();
        }
    }

    Ok(())
}

// 处理预览窗口滚动
pub fn handle_preview_scroll(direction: &str) -> Result<(), String> {
    if !PREVIEW_WINDOW_VISIBLE.load(Ordering::SeqCst) {
        return Ok(());
    }

    // println!("处理预览窗口滚动: {}", direction);

    // 获取当前数据源的长度
    let data_length = get_current_data_source_length();

    // 如果数据为空，不处理滚动
    if data_length == 0 {
        return Ok(());
    }

    // 更新当前索引（支持循环滚动）
    let current_index = PREVIEW_CURRENT_INDEX.load(Ordering::SeqCst);
    let max_index = data_length.saturating_sub(1);

    let new_index = match direction {
        "up" => {
            if current_index > 0 {
                current_index - 1
            } else {
                // 到达顶部，循环到底部
                max_index
            }
        }
        "down" => {
            if current_index < max_index {
                current_index + 1
            } else {
                // 到达底部，循环到顶部
                0
            }
        }
        _ => current_index,
    };

    if new_index != current_index {
        PREVIEW_CURRENT_INDEX.store(new_index, Ordering::SeqCst);
        // println!("预览索引更新: {} -> {}", current_index, new_index);

        let window_handle = PREVIEW_WINDOW_HANDLE.get().unwrap();
        let window_guard = window_handle.lock().unwrap();

        if let Some(window) = window_guard.as_ref() {
            // 发送滚动事件到前端
            let _ = window.emit(
                "preview-scroll",
                serde_json::json!({
                    "direction": direction,
                    "newIndex": new_index
                }),
            );
        }
    } else {
        println!("预览索引未变化: {}", current_index);
    }

    Ok(())
}

// 获取当前预览索引
pub fn get_preview_index() -> usize {
    PREVIEW_CURRENT_INDEX.load(Ordering::SeqCst)
}

// 设置当前预览索引
pub fn set_preview_index(index: usize) {
    PREVIEW_CURRENT_INDEX.store(index, Ordering::SeqCst);
}

// 更新预览窗口数据源
pub fn update_preview_source(tab: String, group_id: String) -> Result<(), String> {
    // 保存主窗口状态
    let state = MainWindowState {
        tab: tab.clone(),
        group_id: group_id.clone(),
    };

    let state_handle = MAIN_WINDOW_STATE.get_or_init(|| {
        Mutex::new(MainWindowState {
            tab: "clipboard".to_string(),
            group_id: "clipboard".to_string(),
        })
    });

    if let Ok(mut state_guard) = state_handle.lock() {
        *state_guard = state;
    }

    let window_handle = match PREVIEW_WINDOW_HANDLE.get() {
        Some(handle) => handle,
        None => return Ok(()),
    };

    let window_guard = match window_handle.lock() {
        Ok(guard) => guard,
        Err(_) => return Ok(()),
    };

    if let Some(window) = window_guard.as_ref() {
        // 重置索引为0
        PREVIEW_CURRENT_INDEX.store(0, Ordering::SeqCst);

        // 发送数据源更新事件到前端
        let _ = window.emit(
            "preview-source-changed",
            serde_json::json!({
                "tab": tab,
                "groupId": group_id
            }),
        );
    }

    Ok(())
}

// 获取当前数据源的长度
fn get_current_data_source_length() -> usize {
    let state_handle = MAIN_WINDOW_STATE.get_or_init(|| {
        Mutex::new(MainWindowState {
            tab: "clipboard".to_string(),
            group_id: "clipboard".to_string(),
        })
    });

    if let Ok(state_guard) = state_handle.lock() {
        let state = state_guard.clone();

        if state.tab == "clipboard" {
            // 剪贴板历史
            crate::commands::get_clipboard_history().len()
        } else if state.tab == "quick-texts" {
            // 常用文本
            if state.group_id == "all" || state.group_id == "clipboard" || state.group_id == "全部" {
                crate::quick_texts::get_all_quick_texts().len()
            } else {
                crate::quick_texts::get_quick_texts_by_group(&state.group_id).len()
            }
        } else {
            // 默认返回剪贴板历史长度
            crate::commands::get_clipboard_history().len()
        }
    } else {
        // 获取状态失败，返回剪贴板历史长度
        crate::commands::get_clipboard_history().len()
    }
}

// 获取主窗口当前状态
pub fn get_main_window_state() -> Result<serde_json::Value, String> {
    let state_handle = MAIN_WINDOW_STATE.get_or_init(|| {
        Mutex::new(MainWindowState {
            tab: "clipboard".to_string(),
            group_id: "clipboard".to_string(),
        })
    });

    if let Ok(state_guard) = state_handle.lock() {
        let state = state_guard.clone();

        Ok(json!({
            "tab": state.tab,
            "groupId": state.group_id
        }))
    } else {
        Err("获取主窗口状态失败".to_string())
    }
}

// 检查预览窗口是否可见
pub fn is_preview_window_visible() -> bool {
    PREVIEW_WINDOW_VISIBLE.load(Ordering::SeqCst)
}

// 取消预览（不粘贴直接隐藏）
pub async fn cancel_preview() -> Result<(), String> {
    println!("用户取消预览，设置取消标志并隐藏窗口");

    // 设置用户取消标志，防止松开快捷键时自动粘贴
    #[cfg(windows)]
    crate::global_state::PREVIEW_CANCELLED_BY_USER.store(true, std::sync::atomic::Ordering::SeqCst);

    // 隐藏预览窗口
    hide_preview_window().await?;

    Ok(())
}

// 粘贴当前预览项
pub async fn paste_current_preview_item() -> Result<(), String> {
    // 检查自动粘贴设置
    let settings = crate::settings::get_global_settings();
    if !settings.preview_auto_paste {
        println!("自动粘贴已禁用，只隐藏预览窗口");
        hide_preview_window().await?;
        return Ok(());
    }

    let index = get_preview_index();

    // 隐藏预览窗口
    hide_preview_window().await?;

    // 根据当前数据源选择粘贴方式
    let state_handle = MAIN_WINDOW_STATE.get_or_init(|| {
        Mutex::new(MainWindowState {
            tab: "clipboard".to_string(),
            group_id: "clipboard".to_string(),
        })
    });

    if let Ok(state_guard) = state_handle.lock() {
        let state = state_guard.clone();

        if state.tab == "clipboard" {
            // 粘贴剪贴板历史项
            if let Some(main_window) = crate::mouse_hook::MAIN_WINDOW_HANDLE.get() {
                // 获取历史记录内容
                let (content, html_content) = {
                    match crate::database::get_clipboard_history(None) {
                        Ok(items) => {
                            if index < items.len() {
                                let item = &items[index];
                                (Some(item.content.clone()), item.html_content.clone())
                            } else {
                                (None, None)
                            }
                        }
                        Err(_) => (None, None),
                    }
                };

                if let Some(content) = content {
                    // 检查是否为文本内容，如果是则使用带翻译支持的粘贴
                    if !content.starts_with("files:")
                        && !content.starts_with("data:image/")
                        && !content.starts_with("image:")
                    {
                        // 文本内容，使用带HTML和翻译支持的粘贴
                        crate::services::paste_service::paste_text_with_html(
                            content,
                            html_content.clone(),
                            &main_window,
                        )
                        .await?;
                    } else {
                        // 非文本内容，使用普通粘贴
                        let params = crate::services::paste_service::PasteContentParams {
                            content,
                            html_content,
                            quick_text_id: None,
                        };
                        crate::commands::paste_content(params, main_window.clone()).await?;
                    }
                }
            }
        } else if state.tab == "quick-texts" {
            // 粘贴常用文本
            let quick_texts = if state.group_id == "all" || state.group_id == "clipboard" || state.group_id == "全部" {
                crate::quick_texts::get_all_quick_texts()
            } else {
                crate::quick_texts::get_quick_texts_by_group(&state.group_id)
            };

            if index < quick_texts.len() {
                let quick_text = &quick_texts[index];
                if let Some(main_window) = crate::mouse_hook::MAIN_WINDOW_HANDLE.get() {
                    // 使用统一的粘贴命令，支持HTML格式
                    let params = crate::services::paste_service::PasteContentParams {
                        content: quick_text.content.clone(),
                        html_content: quick_text.html_content.clone(),
                        quick_text_id: Some(quick_text.id.clone()),
                    };
                    crate::commands::paste_content(params, main_window.clone()).await?;
                }
            }
        }
    }

    Ok(())
}

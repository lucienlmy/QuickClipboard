use once_cell::sync::OnceCell;
use serde_json::json;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WebviewWindowBuilder};

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

// 预览窗口尺寸配置
struct PreviewWindowSize {
    width: u32,
    height: u32,
}

// 计算预览窗口尺寸
fn calculate_preview_window_size() -> PreviewWindowSize {
    let settings = crate::settings::get_global_settings();
    
    // 根据屏幕DPI调整宽度
    let base_width = 350.0;
    let scale_factor = get_screen_scale_factor();
    let width = ((base_width * scale_factor).round() as u32).clamp(350, 550);
    
    let item_height = 35;
    let item_gap = 4;
    let padding = 16;
    let extra = 10 * (item_height + item_gap);
    
    let height = padding 
        + (settings.preview_items_count * item_height)
        + (settings.preview_items_count.saturating_sub(1) * item_gap)
        + extra;
    
    PreviewWindowSize { width, height }
}

// 获取屏幕缩放因子
fn get_screen_scale_factor() -> f64 {
    #[cfg(windows)]
    {
        use windows::Win32::Graphics::Gdi::{GetDC, GetDeviceCaps, ReleaseDC, LOGPIXELSX};
        use windows::Win32::Foundation::HWND;
        
        unsafe {
            let hdc = GetDC(HWND(0));
            if !hdc.is_invalid() {
                let dpi = GetDeviceCaps(hdc, LOGPIXELSX);
                let _ = ReleaseDC(HWND(0), hdc);
                
                let scale = (dpi as f64 / 96.0).clamp(1.0, 2.5);
                return scale;
            }
        }
    }
    
    #[cfg(not(windows))]
    return 1.0;
    
    1.0
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
    let settings = crate::settings::get_global_settings();
    if !settings.preview_enabled {
        return Ok(());
    }

    // 防止快速连续调用导致的竞态条件
    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;

    let size = calculate_preview_window_size();
    let window_handle = PREVIEW_WINDOW_HANDLE.get().unwrap();
    let mut window_guard = window_handle.lock().unwrap();

    // 获取或创建窗口
    if window_guard.is_none() {
        let window = if let Some(w) = app.get_webview_window("preview") {
            w
        } else {
            create_preview_window(app).await?
        };
        *window_guard = Some(window);
    }

    if let Some(window) = window_guard.as_ref() {
        // 调整窗口尺寸
        window.set_size(tauri::Size::Physical(PhysicalSize {
            width: size.width,
            height: size.height,
        }))
        .map_err(|e| format!("设置窗口尺寸失败: {}", e))?;

        // 定位窗口
        position_preview_window(window)?;

        // 显示窗口
        window.show().map_err(|e| format!("显示预览窗口失败: {}", e))?;

        PREVIEW_WINDOW_VISIBLE.store(true, Ordering::SeqCst);
        PREVIEW_CURRENT_INDEX.store(0, Ordering::SeqCst);

        #[cfg(windows)]
        {
            crate::global_state::PREVIEW_CANCELLED_BY_USER.store(false, std::sync::atomic::Ordering::SeqCst);
            crate::mouse_hook::request_mouse_monitoring("preview_window");
        }

        let _ = window.emit("preview-index-changed", json!({ "index": 0 }));
        let _ = window.emit("clipboard-history-updated", ());

        #[cfg(debug_assertions)]
        window.open_devtools();
    }

    Ok(())
}

// 隐藏预览窗口
pub async fn hide_preview_window() -> Result<(), String> {
    let window_handle = PREVIEW_WINDOW_HANDLE.get().unwrap();
    let window_guard = window_handle.lock().unwrap();

    if let Some(window) = window_guard.as_ref() {
        window.hide().map_err(|e| format!("隐藏预览窗口失败: {}", e))?;
        PREVIEW_WINDOW_VISIBLE.store(false, Ordering::SeqCst);

        #[cfg(windows)]
        crate::mouse_hook::release_mouse_monitoring("preview_window");
    }

    Ok(())
}

// 创建预览窗口
async fn create_preview_window(app: AppHandle) -> Result<WebviewWindow, String> {
    let settings = crate::settings::get_global_settings();
    if !settings.preview_enabled {
        return Err("预览窗口功能已禁用".to_string());
    }

    let size = calculate_preview_window_size();

    let window = WebviewWindowBuilder::new(
        &app,
        "preview",
        tauri::WebviewUrl::App("preview.html".into()),
    )
    .title("快速预览")
    .inner_size(size.width as f64, size.height as f64)
    .min_inner_size(size.width as f64, size.height as f64)
    .max_inner_size(size.width as f64, size.height as f64)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .focusable(false)
    .visible(false)
    .shadow(false)
    .build()
    .map_err(|e| format!("创建预览窗口失败: {}", e))?;
    
    let _ = window.set_focusable(false);
    Ok(window)
}

// 定位预览窗口到鼠标位置
fn position_preview_window(window: &WebviewWindow) -> Result<(), String> {
    // 获取窗口实际尺寸
    let window_size = window.outer_size().map_err(|e| format!("获取窗口尺寸失败: {}", e))?;
    let win_width = window_size.width as i32;
    let win_height = window_size.height as i32;

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

        unsafe {
            let mut cursor = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut cursor).is_err() {
                // 获取失败，使用屏幕中心
                let x = (GetSystemMetrics(SM_CXSCREEN) - win_width) / 2;
                let y = (GetSystemMetrics(SM_CYSCREEN) - win_height) / 2;
                return window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }))
                    .map_err(|e| format!("设置窗口位置失败: {}", e));
            }

            let screen_w = GetSystemMetrics(SM_CXSCREEN);
            let screen_h = GetSystemMetrics(SM_CYSCREEN);
            let margin = 10;

            // 优先在鼠标右侧，垂直居中
            let mut x = cursor.x + margin;
            let mut y = cursor.y - win_height / 2;

            // 水平边界检查：如果右侧放不下，放到左侧
            if x + win_width > screen_w {
                x = cursor.x - win_width - margin;
            }
            
            // 垂直边界检查
            y = y.max(margin).min(screen_h - win_height - margin);

            window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }))
                .map_err(|e| format!("设置窗口位置失败: {}", e))?;
        }
    }

    #[cfg(not(windows))]
    {
        // 非Windows平台：屏幕中心
        window.set_position(tauri::Position::Physical(PhysicalPosition {
            x: 500,
            y: 300,
        }))
        .map_err(|e| format!("设置窗口位置失败: {}", e))?;
    }

    Ok(())
}

// 处理预览窗口滚动
pub fn handle_preview_scroll(direction: &str) -> Result<(), String> {
    if !PREVIEW_WINDOW_VISIBLE.load(Ordering::SeqCst) {
        return Ok(());
    }

    let data_length = get_current_data_source_length();
    if data_length == 0 {
        return Ok(());
    }

    let current_index = PREVIEW_CURRENT_INDEX.load(Ordering::SeqCst);
    let max_index = data_length.saturating_sub(1);

    let new_index = match direction {
        "up" => if current_index > 0 { current_index - 1 } else { max_index },
        "down" => if current_index < max_index { current_index + 1 } else { 0 },
        _ => current_index,
    };

    if new_index != current_index {
        PREVIEW_CURRENT_INDEX.store(new_index, Ordering::SeqCst);

        let window_handle = PREVIEW_WINDOW_HANDLE.get().unwrap();
        let window_guard = window_handle.lock().unwrap();

        if let Some(window) = window_guard.as_ref() {
            let _ = window.emit("preview-scroll", json!({
                "direction": direction,
                "newIndex": new_index
            }));
        }
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
    #[cfg(windows)]
    crate::global_state::PREVIEW_CANCELLED_BY_USER.store(true, std::sync::atomic::Ordering::SeqCst);

    hide_preview_window().await
}

// 粘贴当前预览项
pub async fn paste_current_preview_item() -> Result<(), String> {
    let settings = crate::settings::get_global_settings();
    if !settings.preview_auto_paste {
        return hide_preview_window().await;
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
                // 获取剪贴板历史项ID
                let items = crate::database::get_clipboard_history(None)?;
                if index < items.len() {
                    let params = crate::services::paste_service::PasteContentParams {
                        clipboard_id: Some(items[index].id),
                        quick_text_id: None,
                    };
                    crate::commands::paste_content(params, main_window.clone()).await?;
                } else {
                    return Err(format!("索引 {} 超出范围", index));
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
                    // 使用统一的粘贴命令
                    let params = crate::services::paste_service::PasteContentParams {
                        clipboard_id: None,
                        quick_text_id: Some(quick_text.id.clone()),
                    };
                    crate::commands::paste_content(params, main_window.clone()).await?;
                }
            }
        }
    }

    Ok(())
}

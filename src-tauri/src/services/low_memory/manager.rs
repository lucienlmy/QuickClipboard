use tauri::{AppHandle, Manager};
use super::state::{is_low_memory_mode, set_low_memory_mode};

// 需要销毁的 WebView 窗口列表
const WEBVIEW_LABELS: &[&str] = &[
    "main",
    "quickpaste", 
    "context-menu",
    "settings",
    "text-editor",
    "screenshot",
    "updater",
];

// 进入低占用模式
pub fn enter_low_memory_mode(app: &AppHandle) -> Result<(), String> {
    if is_low_memory_mode() {
        return Ok(());
    }

    set_low_memory_mode(true);

    if let Err(e) = crate::windows::tray::switch_to_native_menu(app) {
        set_low_memory_mode(false);
        return Err(e);
    }

    // 停止边缘监控
    crate::windows::main_window::stop_edge_monitoring();

    // 禁用鼠标监控
    crate::input_monitor::disable_mouse_monitoring();

    // 禁用导航键监听
    crate::input_monitor::disable_navigation_keys();

    destroy_all_webviews(app);

    // 清理内存
    crate::services::memory::cleanup_memory();
    
    let _ = crate::services::notification::show_notification(
        app,
        "低占用模式",
        "已进入低占用模式，所有窗口已关闭。\n使用托盘菜单或使用快捷键可恢复。",
    );
    
    println!("[低占用模式] 已进入");
    Ok(())
}

// 退出低占用模式
pub fn exit_low_memory_mode(app: &AppHandle) -> Result<(), String> {
    if !is_low_memory_mode() {
        return Ok(());
    }

    set_low_memory_mode(false);

    let _ = crate::services::notification::show_notification(
        app,
        "低占用模式",
        "已退出低占用模式，主窗口已恢复。",
    );

    crate::windows::tray::switch_to_webview_menu(app)?;

    // 重建主窗口
    recreate_main_window(app)?;

    let _ = crate::quickpaste::init_quickpaste_window(app);

    println!("[低占用模式] 已退出");
    Ok(())
}

// 销毁所有 WebView 窗口
fn destroy_all_webviews(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with("pin-image-") {
            let _ = window.destroy();
        }
    }

    for label in WEBVIEW_LABELS {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.destroy();
        }
    }
}

// 重建主窗口
fn recreate_main_window(app: &AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if app.get_webview_window("main").is_some() {
        return Ok(());
    }

    let settings = crate::get_settings();

    let (width, height) = if settings.remember_window_size {
        settings.saved_window_size.unwrap_or((360, 520))
    } else {
        (360, 520)
    };
    let window = WebviewWindowBuilder::new(
        app,
        "main",
        WebviewUrl::App("windows/main/index.html".into()),
    )
    .title("快速剪贴板")
    .inner_size(width as f64, height as f64)
    .min_inner_size(350.0, 500.0)
    .max_inner_size(500.0, 800.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false) 
    .resizable(true)
    .maximizable(false)
    .minimizable(false)
    .center()
    .focused(false)
    .visible_on_all_workspaces(true)
    .disable_drag_drop_handler() 
    .build()
    .map_err(|e| format!("重建主窗口失败: {}", e))?;
    
    let _ = window.set_focusable(false);
    
    #[cfg(debug_assertions)]
    let _ = window.open_devtools();

    crate::input_monitor::update_main_window(window.clone());

    crate::init_edge_monitor(window.clone());

    let _ = crate::windows::main_window::restore_edge_snap_on_startup(&window);

    crate::input_monitor::enable_mouse_monitoring();

    Ok(())
}

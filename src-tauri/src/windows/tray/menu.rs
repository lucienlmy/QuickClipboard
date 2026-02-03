use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use crate::windows::plugins::context_menu::window::{MenuItem as CtxMenuItem, ContextMenuOptions, show_menu};

fn get_pin_images_dir() -> Result<PathBuf, String> {
    let data_dir = crate::services::get_data_directory()?;
    Ok(data_dir.join("pin_images"))
}

pub fn get_pin_images_list() -> Vec<(String, String)> {
    let pin_dir = match get_pin_images_dir() {
        Ok(dir) => dir,
        Err(_) => return vec![],
    };
    
    if !pin_dir.exists() {
        return vec![];
    }
    
    let mut images: Vec<(String, String, std::time::SystemTime)> = Vec::new();
    let image_extensions = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico"];
    
    if let Ok(entries) = fs::read_dir(&pin_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if image_extensions.contains(&ext.to_lowercase().as_str()) {
                        let file_name = path.file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("未知")
                            .to_string();
                        let file_path = path.to_string_lossy().to_string();
                        let modified = entry.metadata()
                            .and_then(|m| m.modified())
                            .unwrap_or(std::time::UNIX_EPOCH);
                        images.push((file_name, file_path, modified));
                    }
                }
            }
        }
    }

    images.sort_by(|a, b| b.2.cmp(&a.2));
    images.into_iter().map(|(name, path, _)| (name, path)).collect()
}

const MAX_PIN_IMAGES_DISPLAY: usize = 20;

// 创建分隔线菜单项
fn separator_item() -> CtxMenuItem {
    CtxMenuItem {
        id: String::new(),
        label: String::new(),
        icon: None,
        favicon: None,
        icon_color: None,
        disabled: false,
        separator: true,
        children: None,
        preview_image: None,
    }
}

// 创建普通菜单项
fn menu_item(id: &str, label: &str, icon: Option<&str>) -> CtxMenuItem {
    menu_item_with_state(id, label, icon, false)
}

fn menu_item_with_state(id: &str, label: &str, icon: Option<&str>, disabled: bool) -> CtxMenuItem {
    CtxMenuItem {
        id: id.to_string(),
        label: label.to_string(),
        icon: icon.map(|s| s.to_string()),
        favicon: None,
        icon_color: None,
        disabled,
        separator: false,
        children: None,
        preview_image: None,
    }
}

// 构建贴图子菜单项列表
fn build_pin_images_children() -> Vec<CtxMenuItem> {
    let images = get_pin_images_list();
    let total_count = images.len();
    let mut children = Vec::new();
    
    if images.is_empty() {
        children.push(CtxMenuItem {
            id: "empty".to_string(),
            label: "(暂无贴图)".to_string(),
            icon: None,
            favicon: None,
            icon_color: None,
            disabled: true,
            separator: false,
            children: None,
            preview_image: None,
        });
    } else {
        for (idx, (name, path)) in images.iter().take(MAX_PIN_IMAGES_DISPLAY).enumerate() {
            let display_name = if name.len() > 30 {
                format!("{}...", &name[..27])
            } else {
                name.clone()
            };
            children.push(CtxMenuItem {
                id: format!("pin-image-{}", idx),
                label: display_name,
                icon: Some("ti ti-photo".to_string()),
                favicon: None,
                icon_color: None,
                disabled: false,
                separator: false,
                children: None,
                preview_image: Some(path.clone()),
            });
        }
        
        if total_count > MAX_PIN_IMAGES_DISPLAY {
            children.push(separator_item());
            children.push(CtxMenuItem {
                id: "pin-open-folder".to_string(),
                label: format!("更多... (共{}张)", total_count),
                icon: Some("ti ti-dots".to_string()),
                favicon: None,
                icon_color: None,
                disabled: false,
                separator: false,
                children: None,
                preview_image: None,
            });
        }
    }
    
    children.push(separator_item());
    children.push(menu_item("pin-open-folder", "打开贴图目录", Some("ti ti-folder")));
    
    children
}

// 托盘菜单
pub async fn show_tray_menu(app: AppHandle) -> Result<(), String> {
    let settings = crate::get_settings();
    let is_force_update = crate::windows::updater_window::is_force_update_mode();
    
    let hotkeys_label = if settings.hotkeys_enabled { "禁用快捷键" } else { "启用快捷键" };
    let monitor_label = if settings.clipboard_monitor { "禁用剪贴板监听" } else { "启用剪贴板监听" };
    
    let items = vec![
        menu_item_with_state("toggle", "显示/隐藏", Some("ti ti-app-window"), is_force_update),
        separator_item(),
        menu_item_with_state("settings", "设置", Some("ti ti-settings"), is_force_update),
        menu_item_with_state("screenshot", "截屏", Some("ti ti-screenshot"), is_force_update),
        CtxMenuItem {
            id: "pin-images".to_string(),
            label: "贴图".to_string(),
            icon: Some("ti ti-pinned".to_string()),
            favicon: None,
            icon_color: None,
            disabled: is_force_update,
            separator: false,
            children: Some(build_pin_images_children()),
            preview_image: None,
        },
        separator_item(),
        menu_item_with_state("toggle-hotkeys", hotkeys_label, Some("ti ti-keyboard"), is_force_update),
        menu_item_with_state("toggle-clipboard-monitor", monitor_label, Some("ti ti-clipboard"), is_force_update),
        separator_item(),
        menu_item_with_state("low-memory-mode", "进入低占用模式", Some("ti ti-leaf"), is_force_update),
        separator_item(),
        menu_item("restart", "重启程序", Some("ti ti-refresh")),
        menu_item("quit", "退出", Some("ti ti-power")),
    ];
    
    let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
    let theme = if settings.theme.is_empty() { "auto".to_string() } else { settings.theme };
    
    let (logical_x, logical_y) = if let Ok(monitor) = crate::screen::ScreenUtils::get_monitor_at_cursor(&app) {
        let scale = monitor.scale_factor();
        let pos = monitor.position();
        let monitor_x = pos.x as f64;
        let monitor_y = pos.y as f64;
        
        let relative_x = cursor_x as f64 - monitor_x;
        let relative_y = cursor_y as f64 - monitor_y;
        (
            (monitor_x / scale + relative_x / scale) as i32,
            (monitor_y / scale + relative_y / scale) as i32,
        )
    } else {
        (cursor_x, cursor_y)
    };
    
    let options = ContextMenuOptions {
        items,
        x: logical_x,
        y: logical_y,
        cursor_x: logical_x,
        cursor_y: logical_y,
        width: Some(200),
        theme: Some(theme),
        session_id: 0,
        monitor_x: 0.0,
        monitor_y: 0.0,
        monitor_width: 0.0,
        monitor_height: 0.0,
        is_tray_menu: true,
        force_focus: false,
    };
    
    if let Ok(Some(selected_id)) = show_menu(app.clone(), options).await {
        handle_tray_menu_selection(&app, &selected_id);
    }
    
    Ok(())
}

// 处理托盘菜单选择
fn handle_tray_menu_selection(app: &AppHandle, selected_id: &str) {
    match selected_id {
        "toggle" => {
            crate::toggle_main_window_visibility(app);
        }
        "settings" => {
            let _ = crate::windows::settings_window::open_settings_window(app);
        }
        "screenshot" => {
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(150));
                #[cfg(feature = "screenshot-suite")]
                {
                    screenshot_suite::windows::screenshot_window::auto_selection::clear_auto_selection_cache();
                    if let Err(e) = screenshot_suite::start_screenshot(&app) {
                        eprintln!("启动截图窗口失败: {}", e);
                    }
                }
                #[cfg(not(feature = "screenshot-suite"))]
                {
                    let _ = app;
                }
            });
        }
        "toggle-hotkeys" => {
            toggle_hotkeys(app);
        }
        "toggle-clipboard-monitor" => {
            if let Err(e) = crate::commands::settings::toggle_clipboard_monitor(app) {
                eprintln!("切换剪贴板监听状态失败: {}", e);
            }
        }
        "low-memory-mode" => {
            if let Err(e) = crate::services::low_memory::enter_low_memory_mode(app) {
                eprintln!("进入低占用模式失败: {}", e);
            }
        }
        "restart" => {
            app.restart();
        }
        "quit" => {
            app.exit(0);
        }
        "pin-open-folder" => {
            open_pin_images_folder();
        }
        id if id.starts_with("pin-image-") => {
            if let Some(idx_str) = id.strip_prefix("pin-image-") {
                if let Ok(idx) = idx_str.parse::<usize>() {
                    let images = get_pin_images_list();
                    if let Some((_, file_path)) = images.get(idx) {
                        let app = app.clone();
                        let file_path = file_path.clone();
                        #[cfg(feature = "gpu-image-viewer")]
                        if let Err(e) = crate::windows::native_pin_window::create_native_pin_from_file(
                            app.clone(), file_path.clone(),
                        ) {
                            eprintln!("原生贴图窗口失败，尝试tauri版: {}", e);
                            tauri::async_runtime::spawn(async move {
                                if let Err(e2) = crate::windows::pin_image_window::pin_image_from_file(
                                    app, file_path, None, None, None, None, None, None, None, None, None, None, None,
                                ).await {
                                    eprintln!("tauri版贴图窗口也失败: {}", e2);
                                }
                            });
                        }
                        #[cfg(not(feature = "gpu-image-viewer"))]
                        {
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = crate::windows::pin_image_window::pin_image_from_file(
                                    app, file_path, None, None, None, None, None, None, None, None, None, None, None,
                                ).await {
                                    eprintln!("创建贴图窗口失败: {}", e);
                                }
                            });
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

// 切换快捷键状态
fn toggle_hotkeys(app: &AppHandle) {
    let mut settings = crate::get_settings();
    settings.hotkeys_enabled = !settings.hotkeys_enabled;
    let enabled = settings.hotkeys_enabled;
    
    if let Err(e) = crate::update_settings(settings.clone()) {
        eprintln!("更新快捷键设置失败: {}", e);
        return;
    }
    
    if enabled {
        if let Err(e) = crate::hotkey::reload_from_settings() {
            eprintln!("重新加载快捷键失败: {}", e);
        }
    } else {
        crate::hotkey::unregister_all();
    }

    let message = if enabled { "快捷键已启用" } else { "快捷键已禁用" };
    let _ = crate::services::notification::show_notification(app, "QuickClipboard", message);
}

// 打开贴图目录
fn open_pin_images_folder() {
    if let Ok(data_dir) = crate::services::get_data_directory() {
        let pin_images_dir = data_dir.join("pin_images");
        if !pin_images_dir.exists() {
            let _ = std::fs::create_dir_all(&pin_images_dir);
        }
        let _ = tauri_plugin_opener::open_path(&pin_images_dir, None::<&str>);
    }
}

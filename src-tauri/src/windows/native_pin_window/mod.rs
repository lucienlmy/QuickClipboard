// 原生贴图窗口管理

use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tauri::{AppHandle, Listener};
use crate::windows::plugins::context_menu::window::{MenuItem, ContextMenuOptions, show_menu};
use crate::services::store;

// 默认缩略图大小
const DEFAULT_THUMBNAIL_SIZE: u32 = 100;

// 存储键
const STORE_KEY_DEFAULT_SHADOW: &str = "native_pin.default_shadow_enabled";
const STORE_KEY_DEFAULT_ALWAYS_ON_TOP: &str = "native_pin.default_always_on_top";
const STORE_KEY_DEFAULT_LOCKED: &str = "native_pin.default_locked";
const STORE_KEY_DEFAULT_OPACITY: &str = "native_pin.default_opacity";
const STORE_KEY_DEFAULT_PIXEL_RENDER: &str = "native_pin.default_pixel_render";
const STORE_KEY_DEFAULT_PRIVACY_MODE: &str = "native_pin.default_privacy_mode";

// 窗口数据
#[derive(Debug, Clone)]
pub struct NativePinData {
    pub file_path: String,
    pub always_on_top: bool,
    pub shadow_enabled: bool,
    pub locked: bool,
    pub opacity: f32,
    pub pixel_render: bool,
    pub original_image_path: Option<String>,
    pub edit_data: Option<String>,
    pub privacy_mode: u8, // 0=关闭, 1=模糊, 2=马赛克
}

// 窗口数据存储
static WINDOW_DATA: Lazy<Mutex<HashMap<u64, NativePinData>>> = Lazy::new(|| Mutex::new(HashMap::new()));

// ============ 默认值读取/保存 ============

fn get_default_shadow_enabled() -> bool {
    store::get::<bool>(STORE_KEY_DEFAULT_SHADOW).unwrap_or(false)
}

fn save_default_shadow_enabled(enabled: bool) {
    let _ = store::set(STORE_KEY_DEFAULT_SHADOW, &enabled);
}

fn get_default_always_on_top() -> bool {
    store::get::<bool>(STORE_KEY_DEFAULT_ALWAYS_ON_TOP).unwrap_or(true)
}

fn save_default_always_on_top(enabled: bool) {
    let _ = store::set(STORE_KEY_DEFAULT_ALWAYS_ON_TOP, &enabled);
}

fn get_default_locked() -> bool {
    store::get::<bool>(STORE_KEY_DEFAULT_LOCKED).unwrap_or(false)
}

fn save_default_locked(enabled: bool) {
    let _ = store::set(STORE_KEY_DEFAULT_LOCKED, &enabled);
}

fn get_default_opacity() -> f32 {
    store::get::<f32>(STORE_KEY_DEFAULT_OPACITY).unwrap_or(1.0)
}

fn save_default_opacity(opacity: f32) {
    let _ = store::set(STORE_KEY_DEFAULT_OPACITY, &opacity);
}

fn get_default_pixel_render() -> bool {
    store::get::<bool>(STORE_KEY_DEFAULT_PIXEL_RENDER).unwrap_or(false)
}

fn save_default_pixel_render(enabled: bool) {
    let _ = store::set(STORE_KEY_DEFAULT_PIXEL_RENDER, &enabled);
}

fn get_default_privacy_mode() -> u8 {
    store::get::<u8>(STORE_KEY_DEFAULT_PRIVACY_MODE).unwrap_or(0)
}

fn save_default_privacy_mode(mode: u8) {
    let _ = store::set(STORE_KEY_DEFAULT_PRIVACY_MODE, &mode);
}

// 创建原生贴图窗口
#[tauri::command]
pub fn create_native_pin_window(
    file_path: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
    original_image_path: Option<String>,
    edit_data: Option<String>,
) -> Result<u64, String> {
    let default_shadow = get_default_shadow_enabled();
    let default_always_on_top = get_default_always_on_top();
    let default_locked = get_default_locked();
    let default_opacity = get_default_opacity();
    let default_pixel_render = get_default_pixel_render();
    let default_privacy_mode = get_default_privacy_mode();
    
    let shadow = if default_shadow {
        Some(gpu_image_viewer::window::ShadowStyle::default())
    } else {
        None
    };
    
    let window_id = gpu_image_viewer::window::create(
        gpu_image_viewer::window::WindowOptions {
            file_path: file_path.clone(),
            x,
            y,
            width: Some(width),
            height: Some(height),
            scale_factor: Some(scale_factor),
            draggable: !default_locked,
            zoomable: true,
            always_on_top: default_always_on_top,
            hover_style: Some(gpu_image_viewer::window::HoverStyle::default()),
            double_click_close: true,
            ignore_cursor_events: false,
            shadow,
            skip_shadow: false,
            is_preview: false,
            opacity: Some(default_opacity),
            pixel_render: Some(default_pixel_render),
            privacy_mode: Some(default_privacy_mode),
            center_position: false,
        }
    )?;
    
    register_window(window_id, file_path, original_image_path, edit_data);
    Ok(window_id)
}

fn register_window(
    id: u64, 
    file_path: String,
    original_image_path: Option<String>,
    edit_data: Option<String>,
) {
    let default_shadow = get_default_shadow_enabled();
    let default_always_on_top = get_default_always_on_top();
    let default_locked = get_default_locked();
    let default_opacity = get_default_opacity();
    let default_pixel_render = get_default_pixel_render();
    let default_privacy_mode = get_default_privacy_mode();
    
    let mut map = WINDOW_DATA.lock().unwrap();
    map.insert(id, NativePinData {
        file_path,
        always_on_top: default_always_on_top,
        shadow_enabled: default_shadow,
        locked: default_locked,
        opacity: default_opacity,
        pixel_render: default_pixel_render,
        original_image_path,
        edit_data,
        privacy_mode: default_privacy_mode,
    });
}

pub fn unregister_window(id: u64) {
    let mut map = WINDOW_DATA.lock().unwrap();
    if let Some(data) = map.remove(&id) {
        let is_same_as_original = data.original_image_path.as_ref() == Some(&data.file_path);
        if !is_same_as_original {
            let _ = std::fs::remove_file(&data.file_path);
        }
    }
}

pub fn get_window_data(id: u64) -> Option<NativePinData> {
    let map = WINDOW_DATA.lock().unwrap();
    map.get(&id).cloned()
}

pub fn set_always_on_top(id: u64, always_on_top: bool) {
    let mut map = WINDOW_DATA.lock().unwrap();
    if let Some(data) = map.get_mut(&id) {
        data.always_on_top = always_on_top;
    }
    save_default_always_on_top(always_on_top);
}

pub fn set_shadow_enabled(id: u64, enabled: bool) {
    let mut map = WINDOW_DATA.lock().unwrap();
    if let Some(data) = map.get_mut(&id) {
        data.shadow_enabled = enabled;
    }
    save_default_shadow_enabled(enabled);
}

pub fn set_locked(id: u64, locked: bool) {
    let mut map = WINDOW_DATA.lock().unwrap();
    if let Some(data) = map.get_mut(&id) {
        data.locked = locked;
    }
    save_default_locked(locked);
}

pub fn set_opacity(id: u64, opacity: f32) {
    let mut map = WINDOW_DATA.lock().unwrap();
    if let Some(data) = map.get_mut(&id) {
        data.opacity = opacity;
    }
    save_default_opacity(opacity);
}

pub fn set_pixel_render(id: u64, enabled: bool) {
    let mut map = WINDOW_DATA.lock().unwrap();
    if let Some(data) = map.get_mut(&id) {
        data.pixel_render = enabled;
    }
    save_default_pixel_render(enabled);
}

pub fn set_privacy_mode(id: u64, mode: u8) {
    let mut map = WINDOW_DATA.lock().unwrap();
    if let Some(data) = map.get_mut(&id) {
        data.privacy_mode = mode;
    }
    save_default_privacy_mode(mode);
}

fn separator_item() -> MenuItem {
    MenuItem {
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

fn menu_item(id: &str, label: &str, icon: Option<&str>) -> MenuItem {
    MenuItem {
        id: id.to_string(),
        label: label.to_string(),
        icon: icon.map(|s| s.to_string()),
        favicon: None,
        icon_color: None,
        disabled: false,
        separator: false,
        children: None,
        preview_image: None,
    }
}

fn menu_item_checked(id: &str, label: &str, checked: bool) -> MenuItem {
    MenuItem {
        id: id.to_string(),
        label: label.to_string(),
        icon: if checked { Some("ti ti-check".to_string()) } else { None },
        favicon: None,
        icon_color: None,
        disabled: false,
        separator: false,
        children: None,
        preview_image: None,
    }
}

fn menu_item_disabled(id: &str, label: &str, icon: Option<&str>, disabled: bool) -> MenuItem {
    MenuItem {
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

// 事件监听
pub fn setup_event_listener(app: &AppHandle) {
    let app_handle = app.clone();
    
    app.listen("gpu-image-viewer-event", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            let event_type = payload.get("type").and_then(|v| v.as_str());
            
            match event_type {
                Some("ContextMenu") => {
                    let id = payload.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                    let x = payload.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let y = payload.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    
                    let app = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = show_context_menu(&app, id, x, y).await {
                            eprintln!("[NativePinWindow] show context menu failed: {}", e);
                        }
                    });
                }
                Some("Closed") => {
                    let id = payload.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                    unregister_window(id);
                }
                _ => {}
            }
        }
    });
}

async fn show_context_menu(app: &AppHandle, window_id: u64, cursor_x: f64, cursor_y: f64) -> Result<(), String> {
    let window_info = gpu_image_viewer::window::get_info(window_id)?;
    let window_data = get_window_data(window_id);
    let always_on_top = window_data.as_ref().map(|d| d.always_on_top).unwrap_or(true);
    let shadow_enabled = window_data.as_ref().map(|d| d.shadow_enabled).unwrap_or(false);
    let locked = window_data.as_ref().map(|d| d.locked).unwrap_or(false);
    let opacity = window_data.as_ref().map(|d| d.opacity).unwrap_or(1.0);
    let pixel_render = window_data.as_ref().map(|d| d.pixel_render).unwrap_or(false);
    let privacy_mode = window_data.as_ref().map(|d| d.privacy_mode).unwrap_or(0);
    let is_thumbnail = window_info.thumbnail_mode;
    
    let screen_x = window_info.x + cursor_x as i32;
    let screen_y = window_info.y + cursor_y as i32;
    
    let settings = crate::get_settings();
    let theme = if settings.theme.is_empty() { "auto".to_string() } else { settings.theme };
    
    let opacity_percent = (opacity * 100.0).round() as i32;
    let opacity_presets = [100, 90, 80, 70, 60, 50];
    let is_custom_opacity = !opacity_presets.contains(&opacity_percent);
    
    let mut opacity_items: Vec<MenuItem> = opacity_presets.iter().map(|&p| {
        menu_item_checked(
            &format!("native-pin-opacity-{}-{}", p, window_id),
            &format!("{}%", p),
            opacity_percent == p
        )
    }).collect();
    opacity_items.push(separator_item());
    opacity_items.push(MenuItem {
        id: format!("native-pin-opacity-custom-{}", window_id),
        label: "自定义...".to_string(),
        icon: if is_custom_opacity { Some("ti ti-check".to_string()) } else { None },
        favicon: None,
        icon_color: None,
        disabled: false,
        separator: false,
        children: None,
        preview_image: None,
    });
    
    // 隐私模式子菜单
    let privacy_items = vec![
        menu_item_checked(&format!("native-pin-privacy-0-{}", window_id), "关闭", privacy_mode == 0),
        menu_item_checked(&format!("native-pin-privacy-1-{}", window_id), "模糊", privacy_mode == 1),
        menu_item_checked(&format!("native-pin-privacy-2-{}", window_id), "马赛克", privacy_mode == 2),
    ];
    
    let items = vec![
        menu_item_checked(&format!("native-pin-toggle-top-{}", window_id), "窗口置顶", always_on_top),
        menu_item_checked(&format!("native-pin-toggle-shadow-{}", window_id), "窗口阴影", shadow_enabled),
        menu_item_checked(&format!("native-pin-toggle-lock-{}", window_id), "锁定位置", locked),
        menu_item_checked(&format!("native-pin-toggle-pixel-{}", window_id), "像素级显示", pixel_render),
        menu_item_checked(&format!("native-pin-toggle-thumbnail-{}", window_id), "缩略图模式", is_thumbnail),
        MenuItem {
            id: format!("native-pin-opacity-submenu-{}", window_id),
            label: "透明度".to_string(),
            icon: Some("ti ti-droplet-half".to_string()),
            favicon: None,
            icon_color: None,
            disabled: false,
            separator: false,
            children: Some(opacity_items),
            preview_image: None,
        },
        MenuItem {
            id: format!("native-pin-privacy-submenu-{}", window_id),
            label: "隐私模式".to_string(),
            icon: Some("ti ti-eye-off".to_string()),
            favicon: None,
            icon_color: None,
            disabled: false,
            separator: false,
            children: Some(privacy_items),
            preview_image: None,
        },
        separator_item(),
        menu_item_disabled(&format!("native-pin-edit-{}", window_id), "编辑", Some("ti ti-pencil"), is_thumbnail),
        separator_item(),
        menu_item(&format!("native-pin-copy-{}", window_id), "复制到剪贴板", Some("ti ti-copy")),
        menu_item(&format!("native-pin-save-{}", window_id), "图像另存为...", Some("ti ti-device-floppy")),
        separator_item(),
        menu_item(&format!("native-pin-close-{}", window_id), "关闭窗口", Some("ti ti-x")),
    ];
    
    let options = ContextMenuOptions {
        items,
        x: screen_x,
        y: screen_y,
        cursor_x: 0,
        cursor_y: 0,
        width: None,
        theme: Some(theme),
        session_id: 0,
        monitor_x: 0.0,
        monitor_y: 0.0,
        monitor_width: 0.0,
        monitor_height: 0.0,
        is_tray_menu: false,
        force_focus: true,
    };
    
    if let Ok(Some(action)) = show_menu(app.clone(), options).await {
        handle_menu_action(app, &action)?;
    }
    
    Ok(())
}

fn handle_menu_action(app: &AppHandle, action: &str) -> Result<(), String> {
    let parts: Vec<&str> = action.rsplitn(2, '-').collect();
    if parts.len() < 2 {
        return Ok(());
    }
    
    let window_id: u64 = parts[0].parse().map_err(|_| "invalid window ID")?;
    let action_part = parts[1];
    
    if action_part.ends_with("toggle-top") {
        let current = get_window_data(window_id).map(|d| d.always_on_top).unwrap_or(true);
        let new_state = !current;
        gpu_image_viewer::window::set_always_on_top(window_id, new_state)?;
        set_always_on_top(window_id, new_state);
    } else if action_part.ends_with("toggle-shadow") {
        let current = get_window_data(window_id).map(|d| d.shadow_enabled).unwrap_or(false);
        let new_state = !current;
        gpu_image_viewer::window::set_shadow(window_id, new_state)?;
        set_shadow_enabled(window_id, new_state);
    } else if action_part.ends_with("toggle-lock") {
        let current = get_window_data(window_id).map(|d| d.locked).unwrap_or(false);
        let new_state = !current;
        gpu_image_viewer::window::set_draggable(window_id, !new_state)?;
        set_locked(window_id, new_state);
    } else if action_part.ends_with("toggle-pixel") {
        let current = get_window_data(window_id).map(|d| d.pixel_render).unwrap_or(false);
        let new_state = !current;
        gpu_image_viewer::window::set_pixel_render(window_id, new_state)?;
        set_pixel_render(window_id, new_state);
    } else if action_part.contains("privacy-") && !action_part.contains("submenu") {
        if let Some(mode_str) = action_part.strip_prefix("native-pin-privacy-") {
            if let Ok(mode) = mode_str.parse::<u8>() {
                gpu_image_viewer::window::set_privacy_mode(window_id, mode)?;
                set_privacy_mode(window_id, mode);
            }
        }
    } else if action_part.ends_with("toggle-thumbnail") {
        gpu_image_viewer::window::toggle_thumbnail(window_id, DEFAULT_THUMBNAIL_SIZE, None, None)?;
    } else if action_part.ends_with("opacity-custom") {
        let app_clone = app.clone();
        let current_opacity = get_window_data(window_id).map(|d| d.opacity).unwrap_or(1.0);
        let current_percent = (current_opacity * 100.0).round() as i32;
        tauri::async_runtime::spawn(async move {
            if let Ok(input) = crate::windows::plugins::input_dialog::window::show_dialog(
                app_clone.clone(),
                crate::windows::plugins::input_dialog::window::InputDialogOptions {
                    title: "自定义透明度".to_string(),
                    message: "请输入透明度:".to_string(),
                    placeholder: Some("0-100".to_string()),
                    default_value: Some(current_percent.to_string()),
                    input_type: crate::windows::plugins::input_dialog::window::InputType::Number,
                    min_value: Some(0),
                    max_value: Some(100),
                },
            ).await {
                if let Some(value_str) = input {
                    if let Ok(value) = value_str.parse::<i32>() {
                        let opacity = (value as f32 / 100.0).clamp(0.0, 1.0);
                        let _ = gpu_image_viewer::window::set_opacity(window_id, opacity);
                        set_opacity(window_id, opacity);
                    }
                }
            }
        });
    } else if action_part.contains("opacity-") {
        if let Some(opacity_str) = action_part.strip_prefix("native-pin-opacity-") {
            if let Ok(percent) = opacity_str.parse::<i32>() {
                let opacity = (percent as f32 / 100.0).clamp(0.0, 1.0);
                gpu_image_viewer::window::set_opacity(window_id, opacity)?;
                set_opacity(window_id, opacity);
            }
        }
    } else if action_part.ends_with("edit") {
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = start_edit_mode(&app_clone, window_id).await {
                eprintln!("[NativePinWindow] start edit mode failed: {}", e);
            }
        });
    } else if action_part.ends_with("copy") {
        if let Some(data) = get_window_data(window_id) {
            crate::commands::copy_image_to_clipboard(data.file_path)?;
        }
    } else if action_part.ends_with("save") {
        if let Some(data) = get_window_data(window_id) {
            let app_clone = app.clone();
            let file_path = data.file_path.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::commands::save_image_from_path(file_path, app_clone).await;
            });
        }
    } else if action_part.ends_with("close") {
        gpu_image_viewer::window::close(window_id)?;
        unregister_window(window_id);
    }
    
    Ok(())
}

// 编辑功能
static EDITING_WINDOW_ID: Lazy<Mutex<Option<u64>>> = Lazy::new(|| Mutex::new(None));

async fn start_edit_mode(app: &AppHandle, window_id: u64) -> Result<(), String> {
    let window_info = gpu_image_viewer::window::get_info(window_id)?;
    let window_data = get_window_data(window_id).ok_or("window data not found")?;
    
    let scale_factor = crate::utils::screen::ScreenUtils::get_scale_factor_at_point(
        app, 
        window_info.x, 
        window_info.y
    );
    
    const SHADOW_PADDING: i32 = 12;
    
    let image_x = window_info.x + SHADOW_PADDING;
    let image_y = window_info.y + SHADOW_PADDING;
    let image_width = window_info.width.saturating_sub(SHADOW_PADDING as u32 * 2);
    let image_height = window_info.height.saturating_sub(SHADOW_PADDING as u32 * 2);
    
    let logical_width = (image_width as f64 / scale_factor).round() as u32;
    let logical_height = (image_height as f64 / scale_factor).round() as u32;
    
    {
        let mut editing = EDITING_WINDOW_ID.lock().unwrap();
        *editing = Some(window_id);
    }
    
    gpu_image_viewer::window::set_visible(window_id, false)?;
    
    crate::windows::screenshot_window::start_pin_edit_mode(
        app,
        window_data.file_path.clone(),
        image_x,
        image_y,
        image_width,
        image_height,
        logical_width,
        logical_height,
        scale_factor,
        format!("native-pin-{}", window_id),
        image_x,
        image_y,
        logical_width as f64,
        logical_height as f64,
        window_data.original_image_path.or(Some(window_data.file_path)),
        window_data.edit_data,
    )?;
    
    Ok(())
}

#[tauri::command]
pub fn confirm_native_pin_edit(
    _app: AppHandle,
    window_id: u64,
    new_file_path: String,
    original_image_path: Option<String>,
    edit_data: Option<String>,
) -> Result<(), String> {
    {
        let mut editing = EDITING_WINDOW_ID.lock().unwrap();
        *editing = None;
    }
    
    if let Some(old_data) = get_window_data(window_id) {
        let is_old_same_as_original = old_data.original_image_path.as_ref() == Some(&old_data.file_path);
        if old_data.file_path != new_file_path && !is_old_same_as_original {
            let _ = std::fs::remove_file(&old_data.file_path);
        }
    }
    
    gpu_image_viewer::window::update_image(window_id, new_file_path.clone())?;
    gpu_image_viewer::window::set_visible(window_id, true)?;
    
    {
        let mut map = WINDOW_DATA.lock().unwrap();
        if let Some(data) = map.get_mut(&window_id) {
            data.file_path = new_file_path;
            data.original_image_path = original_image_path;
            data.edit_data = edit_data;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn cancel_native_pin_edit(
    _app: AppHandle,
    window_id: u64,
) -> Result<(), String> {
    {
        let mut editing = EDITING_WINDOW_ID.lock().unwrap();
        *editing = None;
    }
    
    gpu_image_viewer::window::set_visible(window_id, true)?;
    Ok(())
}

pub fn is_native_pin_edit(window_label: &str) -> bool {
    window_label.starts_with("native-pin-")
}

pub fn parse_native_pin_id(window_label: &str) -> Option<u64> {
    if window_label.starts_with("native-pin-") {
        window_label.strip_prefix("native-pin-")?.parse().ok()
    } else {
        None
    }
}

// 从文件创建贴图
#[tauri::command]
pub fn create_native_pin_from_file(app: AppHandle, file_path: String) -> Result<(), String> {
    let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
    let scale_factor = crate::utils::screen::ScreenUtils::get_monitor_at_cursor(&app)
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    
    let default_shadow = get_default_shadow_enabled();
    let default_always_on_top = get_default_always_on_top();
    let default_locked = get_default_locked();
    let default_opacity = get_default_opacity();
    let default_pixel_render = get_default_pixel_render();
    let default_privacy_mode = get_default_privacy_mode();
    
    let shadow = if default_shadow {
        Some(gpu_image_viewer::window::ShadowStyle::default())
    } else {
        None
    };
    
    let window_id = gpu_image_viewer::window::create(
        gpu_image_viewer::window::WindowOptions {
            file_path: file_path.clone(),
            x: cursor_x,
            y: cursor_y,
            width: None,
            height: None,
            scale_factor: Some(scale_factor),
            draggable: !default_locked,
            zoomable: true,
            always_on_top: default_always_on_top,
            hover_style: Some(gpu_image_viewer::window::HoverStyle::default()),
            double_click_close: true,
            ignore_cursor_events: false,
            shadow,
            skip_shadow: false,
            is_preview: false,
            opacity: Some(default_opacity),
            pixel_render: Some(default_pixel_render),
            privacy_mode: Some(default_privacy_mode),
            center_position: true,
        }
    )?;
    
    register_window(window_id, file_path.clone(), Some(file_path), None);
    Ok(())
}

// 预览窗口

static PREVIEW_WINDOW_ID: Lazy<Mutex<Option<u64>>> = Lazy::new(|| Mutex::new(None));

const DEFAULT_PREVIEW_SIZE: u32 = 600;

#[tauri::command]
pub fn show_native_image_preview(app: AppHandle, file_path: String) -> Result<(), String> {
    close_native_image_preview()?;
    
    let (img_width, img_height) = image::image_dimensions(&file_path)
        .map_err(|e| format!("failed to read image dimensions: {}", e))?;
    
    let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
    let (mon_x, mon_y, mon_right, mon_bottom, scale_factor) = crate::utils::screen::ScreenUtils::get_monitor_at_cursor(&app)
        .map(|m| {
            let pos = m.position();
            let size = m.size();
            (pos.x, pos.y, pos.x + size.width as i32, pos.y + size.height as i32, m.scale_factor())
        })
        .unwrap_or((0, 0, 1920, 1080, 1.0));
    
    let preview_max = ((mon_bottom - mon_y) as f64 / scale_factor / 2.0) as u32;
    let preview_size = preview_max.min(DEFAULT_PREVIEW_SIZE);
    
    let (preview_w, preview_h) = {
        let max_side = img_width.max(img_height);
        if max_side == 0 {
            (preview_size, preview_size)
        } else {
            let scale = preview_size as f64 / max_side as f64;
            let w = ((img_width as f64 * scale).round() as u32).max(1);
            let h = ((img_height as f64 * scale).round() as u32).max(1);
            (w, h)
        }
    };
    
    let phys_w = (preview_w as f64 * scale_factor).round() as u32;
    let phys_h = (preview_h as f64 * scale_factor).round() as u32;
    
    const CURSOR_OFFSET: i32 = 15;
    
    let pos_x = if mon_right - cursor_x >= phys_w as i32 + CURSOR_OFFSET { 
        cursor_x + CURSOR_OFFSET 
    } else { 
        cursor_x - phys_w as i32 - CURSOR_OFFSET
    }.max(mon_x);
    
    let pos_y = if mon_bottom - cursor_y >= phys_h as i32 + CURSOR_OFFSET { 
        cursor_y + CURSOR_OFFSET
    } else { 
        cursor_y - phys_h as i32 - CURSOR_OFFSET
    }.max(mon_y);
    
    let window_id = gpu_image_viewer::window::create(
        gpu_image_viewer::window::WindowOptions {
            file_path: file_path.clone(),
            x: pos_x,
            y: pos_y,
            width: Some(phys_w),
            height: Some(phys_h),
            scale_factor: Some(scale_factor),
            draggable: false,
            zoomable: false,
            always_on_top: true,
            hover_style: None,
            double_click_close: false,
            ignore_cursor_events: true,
            shadow: None,
            skip_shadow: true,
            is_preview: true,
            opacity: None,
            pixel_render: None,
            privacy_mode: None,
            center_position: false,
        }
    )?;
    
    {
        let mut preview = PREVIEW_WINDOW_ID.lock().unwrap();
        *preview = Some(window_id);
    }
    
    Ok(())
}

#[tauri::command]
pub fn close_native_image_preview() -> Result<(), String> {
    let window_id = {
        let mut preview = PREVIEW_WINDOW_ID.lock().unwrap();
        preview.take()
    };
    
    if let Some(id) = window_id {
        let _ = gpu_image_viewer::window::close(id);
    }
    
    Ok(())
}

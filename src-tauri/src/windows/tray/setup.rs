use image::GenericImageView;
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    AppHandle,
};

use super::{create_tray_menu, create_click_handler, handle_menu_event};

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = create_tray_menu(app)?;

    let icon = {
        let icon_data = include_bytes!("../../../icons/icon64.png");
        let img = image::load_from_memory(icon_data)?;
        let rgba = img.to_rgba8();
        let (width, height) = img.dimensions();
        tauri::image::Image::new_owned(rgba.into_raw(), width, height)
    };

    let app_handle = app.clone();
    let click_handler = create_click_handler(app_handle);
    
    let _tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .tooltip("快速剪贴板")
        .icon(icon)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |_tray, event| {
            match event {
                TrayIconEvent::Click { button, button_state, .. } => {
                    if button == MouseButton::Left && button_state == MouseButtonState::Up {
                        click_handler();
                    }
                }
                TrayIconEvent::Enter { .. } => {
                    crate::input_monitor::set_tray_hovered(true);
                }
                TrayIconEvent::Leave { .. } => {
                    crate::input_monitor::set_tray_hovered(false);
                }
                _ => {}
            }
        })
        .on_menu_event(handle_menu_event)
        .build(app)?;

    Ok(())
}


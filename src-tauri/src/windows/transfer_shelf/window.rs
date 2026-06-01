use std::path::PathBuf;

use tauri::{
    AppHandle, DragDropEvent, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use super::types::{
    id_from_label, label_for, DROP_ACTIVE_EVENT, FILES_DROPPED_EVENT, ShelfDropActivePayload,
    ShelfDroppedFilesPayload,
};

pub const DEFAULT_WIDTH: u32 = 360;
pub const DEFAULT_HEIGHT: u32 = 480;
pub const MIN_WIDTH: u32 = 280;
pub const MIN_HEIGHT: u32 = 320;
pub const STAGGER_OFFSET: i32 = 24;

/// 创建一个 shelf 窗口实例。
///
/// `id` 由 manager 提供，最终窗口 label 为 `transfer-shelf-{id}`。
/// `title` 仅作为窗口标题展示，前端通过 url query 获取 `shelfId`。
pub fn create_shelf_window(
    app: &AppHandle,
    id: &str,
    title: &str,
    stagger_index: u32,
) -> Result<WebviewWindow, String> {
    let label = label_for(id);

    if let Some(existing) = app.get_webview_window(&label) {
        return Ok(existing);
    }

    let scale_factor = crate::utils::screen::ScreenUtils::get_monitor_at_cursor(app)
        .map(|monitor| monitor.scale_factor())
        .unwrap_or(1.0)
        .max(0.1);
    let logical_width = DEFAULT_WIDTH as f64 / scale_factor;
    let logical_height = DEFAULT_HEIGHT as f64 / scale_factor;
    let logical_min_width = MIN_WIDTH as f64 / scale_factor;
    let logical_min_height = MIN_HEIGHT as f64 / scale_factor;

    let url = format!("windows/transferShelf/index.html?shelfId={}", id);

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(logical_width, logical_height)
        .min_inner_size(logical_min_width, logical_min_height)
        .resizable(true)
        .maximizable(false)
        .minimizable(true)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(false)
        .focused(true)
        .visible(false)
        .drag_and_drop(true)
        .build()
        .map_err(|e| format!("创建文件盒窗口失败: {}", e))?;

    place_initial_position(app, &window, stagger_index);
    bind_drop_events(&window, app.clone());

    let _ = window.show();
    let _ = window.set_focus();

    #[cfg(debug_assertions)]
    let _ = window.open_devtools();

    Ok(window)
}

fn place_initial_position(app: &AppHandle, window: &WebviewWindow, stagger_index: u32) {
    let monitor = match crate::utils::screen::ScreenUtils::get_monitor_at_cursor(app) {
        Ok(monitor) => monitor,
        Err(_) => return,
    };
    let work_area = monitor.work_area();

    let outer_size = match window.outer_size() {
        Ok(size) => size,
        Err(_) => return,
    };

    let stagger = STAGGER_OFFSET.saturating_mul(stagger_index as i32);
    let margin = 24_i32;

    let base_x = work_area
        .position
        .x
        .saturating_add(work_area.size.width as i32)
        .saturating_sub(outer_size.width as i32)
        .saturating_sub(margin);
    let base_y = work_area
        .position
        .y
        .saturating_add(work_area.size.height as i32)
        .saturating_sub(outer_size.height as i32)
        .saturating_sub(margin);

    let target_x = base_x.saturating_sub(stagger);
    let target_y = base_y.saturating_sub(stagger);

    let _ = window.set_position(PhysicalPosition::new(target_x.max(work_area.position.x), target_y.max(work_area.position.y)));
}

fn bind_drop_events(window: &WebviewWindow, app: AppHandle) {
    let label = window.label().to_string();
    window.on_window_event(move |event| {
        if let WindowEvent::DragDrop(drag_event) = event {
            let shelf_id = match id_from_label(&label) {
                Some(value) => value.to_string(),
                None => return,
            };

            match drag_event {
                DragDropEvent::Enter { .. } | DragDropEvent::Over { .. } => {
                    emit_drop_active(&app, &shelf_id, true);
                }
                DragDropEvent::Drop { paths, .. } => {
                    emit_drop_active(&app, &shelf_id, false);
                    let strings = paths_to_strings(paths);
                    if strings.is_empty() {
                        return;
                    }
                    if let Some(window) = app.get_webview_window(&label) {
                        let _ = window.emit(
                            FILES_DROPPED_EVENT,
                            ShelfDroppedFilesPayload {
                                shelf_id: shelf_id.clone(),
                                paths: strings,
                            },
                        );
                    }
                }
                DragDropEvent::Leave => {
                    emit_drop_active(&app, &shelf_id, false);
                }
                _ => {}
            }
        }
    });
}

fn emit_drop_active(app: &AppHandle, shelf_id: &str, active: bool) {
    if let Some(window) = app.get_webview_window(&label_for(shelf_id)) {
        let _ = window.emit(
            DROP_ACTIVE_EVENT,
            ShelfDropActivePayload {
                shelf_id: shelf_id.to_string(),
                active,
            },
        );
    }
}

fn paths_to_strings(paths: &[PathBuf]) -> Vec<String> {
    paths
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

use tauri::{PhysicalPosition, WebviewWindow, Monitor};

// 将窗口定位到鼠标位置
pub fn position_at_cursor(window: &WebviewWindow) -> Result<(), String> {
    let monitor = crate::screen::ScreenUtils::get_monitor_at_cursor(window)?;
    let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
    let window_size = window.outer_size().map_err(|e| e.to_string())?;
    
    let best_pos = calculate_best_position(
        PhysicalPosition::new(cursor_x, cursor_y),
        window_size,
        &monitor,
    );
    
    window.set_position(best_pos).map_err(|e| e.to_string())
}

fn calculate_best_position(
    cursor: PhysicalPosition<i32>,
    window_size: tauri::PhysicalSize<u32>,
    monitor: &Monitor,
) -> PhysicalPosition<i32> {
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    
    let margin = 12;
    let w = window_size.width as i32;
    let h = window_size.height as i32;
    
    let work_x = monitor_pos.x;
    let work_y = monitor_pos.y;
    let work_w = monitor_size.width as i32;
    let work_h = monitor_size.height as i32;
    
    // 默认位置：鼠标右下方
    let mut x = cursor.x + margin;
    let mut y = cursor.y + margin;
    
    // 如果右边超出，移到左边
    if x + w > work_x + work_w {
        x = cursor.x - w - margin;
    }
    
    // 如果下边超出，移到上边
    if y + h > work_y + work_h {
        y = cursor.y - h - margin;
    }
    
    x = x.max(work_x).min(work_x + work_w - w);
    y = y.max(work_y).min(work_y + work_h - h);
    
    PhysicalPosition::new(x, y)
}

// 将窗口居中显示
pub fn center_window(window: &WebviewWindow) -> Result<(), String> {
    window.center().map_err(|e| e.to_string())
}

// 获取窗口边界
pub fn get_window_bounds(window: &WebviewWindow) -> Result<(i32, i32, u32, u32), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y, size.width, size.height))
}


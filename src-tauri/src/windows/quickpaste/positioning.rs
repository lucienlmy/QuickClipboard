use tauri::{PhysicalPosition, WebviewWindow, Monitor};

/// 定位窗口到鼠标位置
pub fn position_at_cursor(window: &WebviewWindow) -> Result<(), String> {
    let monitor = get_monitor_at_cursor(window)?;
    let cursor_pos = get_cursor_position()?;
    let window_size = window.outer_size().map_err(|e| e.to_string())?;
    
    let best_pos = calculate_best_position(
        cursor_pos,
        window_size,
        &monitor,
    );
    
    window.set_position(best_pos).map_err(|e| e.to_string())
}

/// 获取鼠标所在的显示器
fn get_monitor_at_cursor(window: &WebviewWindow) -> Result<Monitor, String> {
    window.current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("无法获取当前显示器".to_string())
}

/// 获取鼠标位置
fn get_cursor_position() -> Result<PhysicalPosition<i32>, String> {
    let (x, y) = crate::utils::mouse::get_cursor_position()?;
    Ok(PhysicalPosition::new(x, y))
}

/// 计算最佳窗口位置
fn calculate_best_position(
    cursor: PhysicalPosition<i32>,
    window_size: tauri::PhysicalSize<u32>,
    monitor: &Monitor,
) -> PhysicalPosition<i32> {
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();
    
    let margin = 10;
    let w = window_size.width as i32;
    let h = window_size.height as i32;
    
    let work_x = monitor_pos.x;
    let work_y = monitor_pos.y;
    let work_w = monitor_size.width as i32;
    let work_h = monitor_size.height as i32;
    
    let mut x = cursor.x + margin;
    let mut y = cursor.y - h / 2;
    
    if x + w > work_x + work_w {
        x = cursor.x - w - margin;
    }
    
    if x < work_x {
        x = work_x + margin;
    }
    
    y = y.max(work_y + margin).min(work_y + work_h - h - margin);
    
    PhysicalPosition::new(x, y)
}

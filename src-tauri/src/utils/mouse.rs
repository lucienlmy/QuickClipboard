use once_cell::sync::Lazy;
use parking_lot::Mutex;

static MOUSE_POSITION: Lazy<Mutex<(f64, f64)>> = Lazy::new(|| Mutex::new((0.0, 0.0)));

// 获取鼠标位置
pub fn get_cursor_position() -> (i32, i32) {
    let pos = MOUSE_POSITION.lock();
    (pos.0 as i32, pos.1 as i32)
}

// 更新鼠标位置
pub fn update_cursor_position(x: f64, y: f64) {
    let mut pos = MOUSE_POSITION.lock();
    *pos = (x, y);
}

// 设置鼠标位置
pub fn set_cursor_position(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Enigo, Mouse, Settings};
    
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("初始化输入控制器失败: {}", e))?;
    
    enigo.move_mouse(x, y, enigo::Coordinate::Abs)
        .map_err(|e| format!("设置鼠标位置失败: {}", e))?;
    
    update_cursor_position(x as f64, y as f64);
    Ok(())
}


use enigo::{Enigo, Direction, Key, Keyboard, Settings};
use crate::services::system::input_monitor::get_modifier_keys_state;

// 模拟粘贴操作（Ctrl+V），如果 Ctrl 已按下则只按 V 键
pub fn simulate_paste() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("创建键盘模拟器失败: {}", e))?;
    
    let ctrl_pressed = get_modifier_keys_state().0;
    
    if !ctrl_pressed {
        enigo.key(Key::Control, Direction::Press)
            .map_err(|e| format!("按下Ctrl失败: {}", e))?;
    }
    
    enigo.key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| format!("按下V失败: {}", e))?;
    
    if !ctrl_pressed {
        enigo.key(Key::Control, Direction::Release)
            .map_err(|e| format!("释放Ctrl失败: {}", e))?;
    }
    
    Ok(())
}


use enigo::{Enigo, Direction, Key, Keyboard, Settings};
use crate::services::system::input_monitor::get_modifier_keys_state;

// 释放所有修饰键（Alt、Ctrl、Shift、Win）
pub fn release_modifier_keys() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("创建键盘模拟器失败: {}", e))?;
    
    let (ctrl, shift, alt, win) = get_modifier_keys_state();
    
    // 释放 Alt 键
    if alt {
        enigo.key(Key::Alt, Direction::Release)
            .map_err(|e| format!("释放Alt失败: {}", e))?;
    }
    
    // 释放 Ctrl 键
    if ctrl {
        enigo.key(Key::Control, Direction::Release)
            .map_err(|e| format!("释放Ctrl失败: {}", e))?;
    }
    
    // 释放 Shift 键
    if shift {
        enigo.key(Key::Shift, Direction::Release)
            .map_err(|e| format!("释放Shift失败: {}", e))?;
    }
    
    // 释放 Win 键
    if win {
        enigo.key(Key::Meta, Direction::Release)
            .map_err(|e| format!("释放Win失败: {}", e))?;
    }
    
    Ok(())
}

// 模拟粘贴
pub fn simulate_paste() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("创建键盘模拟器失败: {}", e))?;
    
    let (ctrl_pressed, _, _, _) = get_modifier_keys_state();
    
    if !ctrl_pressed {
        enigo.key(Key::Control, Direction::Press)
            .map_err(|e| format!("按下Ctrl失败: {}", e))?;
    }
    
    enigo.key(Key::Unicode('v'), Direction::Press)
        .map_err(|e| format!("按下V失败: {}", e))?;
    
    std::thread::sleep(std::time::Duration::from_millis(8));
    
    enigo.key(Key::Unicode('v'), Direction::Release)
        .map_err(|e| format!("释放V失败: {}", e))?;
    
    if !ctrl_pressed {
        enigo.key(Key::Control, Direction::Release)
            .map_err(|e| format!("释放Ctrl失败: {}", e))?;
    }
    
    Ok(())
}


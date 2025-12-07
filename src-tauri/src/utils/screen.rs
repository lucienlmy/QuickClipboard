use tauri::{AppHandle, WebviewWindow, Manager};
use once_cell::sync::OnceCell;

static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();

// 初始化屏幕工具
pub fn init_screen_utils(app_handle: AppHandle) {
    let _ = APP_HANDLE.set(app_handle);
}

pub struct ScreenUtils;

impl ScreenUtils {
    // 获取虚拟桌面尺寸（多显示器总边界）
    pub fn get_virtual_screen_size() -> Result<(i32, i32, i32, i32), String> {
        // 尝试从任意窗口获取显示器信息
        if let Some(app_handle) = APP_HANDLE.get() {
            if let Some(window) = app_handle.get_webview_window("main") {
                return Self::get_virtual_screen_size_from_window(&window);
            }
        }
        Ok((0, 0, 1920, 1080))
    }
    
    // 从窗口上下文获取虚拟屏幕尺寸
    pub fn get_virtual_screen_size_from_window(window: &WebviewWindow) -> Result<(i32, i32, i32, i32), String> {
        let monitors: Vec<_> = window
            .available_monitors()
            .map_err(|e| format!("获取显示器列表失败: {}", e))?
            .into_iter()
            .map(|m| {
                let pos = m.position();
                let size = m.size();
                (pos.x, pos.y, size.width as i32, size.height as i32)
            })
            .collect();
        
        if monitors.is_empty() {
            return Ok((0, 0, 1920, 1080));
        }
        
        // 计算所有显示器的边界框
        let min_x = monitors.iter().map(|(x, _, _, _)| *x).min().unwrap_or(0);
        let min_y = monitors.iter().map(|(_, y, _, _)| *y).min().unwrap_or(0);
        let max_x = monitors.iter().map(|(x, _, w, _)| x + w).max().unwrap_or(1920);
        let max_y = monitors.iter().map(|(_, y, _, h)| y + h).max().unwrap_or(1080);
        
        Ok((min_x, min_y, max_x - min_x, max_y - min_y))
    }

    // 获取当前显示器边界
    pub fn get_monitor_bounds(window: &WebviewWindow) -> Result<(i32, i32, i32, i32), String> {
        let monitor = window
            .current_monitor()
            .map_err(|e| format!("获取当前显示器失败: {}", e))?
            .ok_or_else(|| "当前显示器不存在".to_string())?;

        let position = monitor.position();
        let size = monitor.size();

        Ok((position.x, position.y, size.width as i32, size.height as i32))
    }
    
    pub fn get_monitor_at_cursor(window: &WebviewWindow) -> Result<tauri::Monitor, String> {
        let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();
        
        let monitors = window
            .available_monitors()
            .map_err(|e| format!("获取显示器列表失败: {}", e))?;
        
        for monitor in monitors {
            let pos = monitor.position();
            let size = monitor.size();
            let right = pos.x + size.width as i32;
            let bottom = pos.y + size.height as i32;
            
            if cursor_x >= pos.x && cursor_x < right && cursor_y >= pos.y && cursor_y < bottom {
                return Ok(monitor);
            }
        }
        
        window.primary_monitor()
            .map_err(|e| format!("获取主显示器失败: {}", e))?
            .ok_or_else(|| "主显示器不存在".to_string())
    }

    // 获取当前显示器的真实边缘 (left, right, top, bottom)
    pub fn get_real_edges(window: &WebviewWindow) -> Result<(bool, bool, bool, bool), String> {
        let current_monitor = window
            .current_monitor()
            .map_err(|e| format!("获取当前显示器失败: {}", e))?
            .ok_or_else(|| "当前显示器不存在".to_string())?;

        let cur_pos = current_monitor.position();
        let cur_size = current_monitor.size();
        
        let all_monitors = Self::get_all_monitors_with_edges(window)?;
        
        for (mx, my, mw, mh, left, right, top, bottom) in all_monitors {
            if mx == cur_pos.x && my == cur_pos.y 
                && mw == cur_size.width as i32 && mh == cur_size.height as i32 {
                return Ok((left, right, top, bottom));
            }
        }
        
        Ok((true, true, true, true))
    }
    
    // 获取所有显示器及其真实边缘 (x, y, w, h, left, right, top, bottom)
    pub fn get_all_monitors_with_edges(window: &WebviewWindow) -> Result<Vec<(i32, i32, i32, i32, bool, bool, bool, bool)>, String> {
        let raw_monitors: Vec<_> = window
            .available_monitors()
            .map_err(|e| format!("获取显示器列表失败: {}", e))?
            .into_iter()
            .map(|m| {
                let pos = m.position();
                let size = m.size();
                (pos.x, pos.y, size.width as i32, size.height as i32)
            })
            .collect();
        
        const TOLERANCE: i32 = 5;
        
        let monitors_with_edges: Vec<_> = raw_monitors.iter().map(|&(mx, my, mw, mh)| {
            let m_right = mx + mw;
            let m_bottom = my + mh;
            
            let mut left_is_edge = true;
            let mut right_is_edge = true;
            let mut top_is_edge = true;
            let mut bottom_is_edge = true;
            
            for &(ox, oy, ow, oh) in &raw_monitors {
                let o_right = ox + ow;
                let o_bottom = oy + oh;
                
                if ox == mx && oy == my && ow == mw && oh == mh {
                    continue;
                }
                
                if (o_right - mx).abs() <= TOLERANCE && oy < m_bottom && o_bottom > my {
                    left_is_edge = false;
                }
                if (ox - m_right).abs() <= TOLERANCE && oy < m_bottom && o_bottom > my {
                    right_is_edge = false;
                }
                if (o_bottom - my).abs() <= TOLERANCE && ox < m_right && o_right > mx {
                    top_is_edge = false;
                }
                if (oy - m_bottom).abs() <= TOLERANCE && ox < m_right && o_right > mx {
                    bottom_is_edge = false;
                }
            }
            
            (mx, my, mw, mh, left_is_edge, right_is_edge, top_is_edge, bottom_is_edge)
        }).collect();
        
        Ok(monitors_with_edges)
    }

    // 约束窗口位置到屏幕边界内
    pub fn constrain_to_physical_bounds(
        x: i32,
        y: i32,
        width: i32,
        height: i32,
        window: &WebviewWindow,
    ) -> Result<(i32, i32), String> {
        let monitors: Vec<_> = window
            .available_monitors()
            .map_err(|e| format!("获取显示器列表失败: {}", e))?
            .into_iter()
            .map(|m| {
                let pos = m.position();
                let size = m.size();
                (pos.x, pos.y, size.width as i32, size.height as i32)
            })
            .collect();

        if monitors.is_empty() {
            return Ok((x.max(0), y.max(0)));
        }

        // 检查与哪些显示器重叠
        let selection_right = x + width;
        let selection_bottom = y + height;

        let overlapping_monitors: Vec<_> = monitors
            .iter()
            .filter(|(mx, my, mw, mh)| {
                let monitor_right = mx + mw;
                let monitor_bottom = my + mh;

                x < monitor_right && selection_right > *mx && y < monitor_bottom && selection_bottom > *my
            })
            .collect();

        if overlapping_monitors.len() > 1 {
            // 跨多个显示器，使用虚拟桌面约束
            let (vx, vy, vw, vh) = Self::get_virtual_screen_size()?;
            let constrained_x = x.max(vx).min(vx + vw - width);
            let constrained_y = y.max(vy).min(vy + vh - height);
            Ok((constrained_x, constrained_y))
        } else if overlapping_monitors.len() == 1 {
            // 在单个显示器内
            let (mx, my, mw, mh) = overlapping_monitors[0];
            let monitor_right = mx + mw;
            let monitor_bottom = my + mh;
            let constrained_x = x.max(*mx).min(monitor_right - width);
            let constrained_y = y.max(*my).min(monitor_bottom - height);
            Ok((constrained_x, constrained_y))
        } else {
            // 不在任何显示器内，找最近的显示器
            let mut best_x = x;
            let mut best_y = y;
            let mut min_distance = i32::MAX as f64;

            for (mx, my, mw, mh) in &monitors {
                let monitor_right = mx + mw;
                let monitor_bottom = my + mh;
                let clamped_x = x.max(*mx).min(monitor_right - width);
                let clamped_y = y.max(*my).min(monitor_bottom - height);
                let distance = ((clamped_x - x).pow(2) + (clamped_y - y).pow(2)) as f64;

                if distance < min_distance {
                    min_distance = distance;
                    best_x = clamped_x;
                    best_y = clamped_y;
                }
            }
            Ok((best_x, best_y))
        }
    }
}


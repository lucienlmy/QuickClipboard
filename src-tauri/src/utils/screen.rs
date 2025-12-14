use once_cell::sync::OnceCell;
use tauri::AppHandle;

static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();

pub fn init_screen_utils(app_handle: AppHandle) {
    let _ = APP_HANDLE.set(app_handle);
}

pub fn get_app_handle() -> Option<&'static AppHandle> {
    APP_HANDLE.get()
}

pub struct ScreenUtils;

impl ScreenUtils {
    // 获取所有显示器信息 (x, y, w, h, scale_factor)
    pub fn get_all_monitors(app: &AppHandle) -> Result<Vec<(i32, i32, i32, i32, f64)>, String> {
        let monitors = app
            .available_monitors()
            .map_err(|e| format!("获取显示器列表失败: {}", e))?;

        Ok(monitors
            .into_iter()
            .map(|m| {
                let pos = m.position();
                let size = m.size();
                (pos.x, pos.y, size.width as i32, size.height as i32, m.scale_factor())
            })
            .collect())
    }

    // 获取虚拟桌面尺寸（多显示器总边界）
    pub fn get_virtual_screen_size() -> Result<(i32, i32, i32, i32), String> {
        let app = APP_HANDLE.get().ok_or("APP_HANDLE 未初始化")?;
        Self::get_virtual_screen_size_by_app(app)
    }

    // 获取虚拟桌面尺寸
    pub fn get_virtual_screen_size_by_app(app: &AppHandle) -> Result<(i32, i32, i32, i32), String> {
        let monitors = Self::get_all_monitors(app)?;

        if monitors.is_empty() {
            return Ok((0, 0, 1920, 1080));
        }

        let min_x = monitors.iter().map(|(x, _, _, _, _)| *x).min().unwrap_or(0);
        let min_y = monitors.iter().map(|(_, y, _, _, _)| *y).min().unwrap_or(0);
        let max_x = monitors.iter().map(|(x, _, w, _, _)| x + w).max().unwrap_or(1920);
        let max_y = monitors.iter().map(|(_, y, _, h, _)| y + h).max().unwrap_or(1080);

        Ok((min_x, min_y, max_x - min_x, max_y - min_y))
    }

    // 获取光标所在的显示器
    pub fn get_monitor_at_cursor(app: &AppHandle) -> Result<tauri::Monitor, String> {
        let (cursor_x, cursor_y) = crate::mouse::get_cursor_position();

        let monitors = app
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

        app.primary_monitor()
            .map_err(|e| format!("获取主显示器失败: {}", e))?
            .ok_or_else(|| "主显示器不存在".to_string())
    }

    // 获取光标所在的显示器
    pub fn get_monitor_at_cursor_global() -> Result<tauri::Monitor, String> {
        let app = APP_HANDLE.get().ok_or("APP_HANDLE 未初始化")?;
        Self::get_monitor_at_cursor(app)
    }

    // 根据坐标点获取所在的显示器边界
    pub fn get_monitor_at_point(app: &AppHandle, x: i32, y: i32) -> Result<(i32, i32, i32, i32), String> {
        let monitors = Self::get_all_monitors(app)?;

        for (mx, my, mw, mh, _) in &monitors {
            let right = mx + mw;
            let bottom = my + mh;
            if x >= *mx && x < right && y >= *my && y < bottom {
                return Ok((*mx, *my, *mw, *mh));
            }
        }

        monitors.first()
            .map(|(mx, my, mw, mh, _)| (*mx, *my, *mw, *mh))
            .ok_or_else(|| "没有可用的显示器".to_string())
    }

    // 根据坐标点获取所在显示器的 scaleFactor
    pub fn get_scale_factor_at_point(app: &AppHandle, x: i32, y: i32) -> f64 {
        app.available_monitors()
            .ok()
            .and_then(|monitors| {
                monitors.into_iter().find(|m| {
                    let pos = m.position();
                    let size = m.size();
                    x >= pos.x && x < pos.x + size.width as i32 &&
                    y >= pos.y && y < pos.y + size.height as i32
                })
            })
            .map(|m| m.scale_factor())
            .unwrap_or(1.0)
    }

    // 获取指定坐标点所在显示器的真实边缘 (left, right, top, bottom)
    pub fn get_real_edges_at_point(app: &AppHandle, x: i32, y: i32) -> Result<(bool, bool, bool, bool), String> {
        let all_monitors = Self::get_all_monitors_with_edges(app)?;

        for (mx, my, mw, mh, left, right, top, bottom) in &all_monitors {
            let m_right = mx + mw;
            let m_bottom = my + mh;
            if x >= *mx && x < m_right && y >= *my && y < m_bottom {
                return Ok((*left, *right, *top, *bottom));
            }
        }

        Ok((true, true, true, true))
    }

    // 获取所有显示器及其真实边缘 (x, y, w, h, left, right, top, bottom)
    pub fn get_all_monitors_with_edges(app: &AppHandle) -> Result<Vec<(i32, i32, i32, i32, bool, bool, bool, bool)>, String> {
        let raw_monitors = Self::get_all_monitors(app)?;

        const TOLERANCE: i32 = 5;

        let monitors_with_edges: Vec<_> = raw_monitors
            .iter()
            .map(|&(mx, my, mw, mh, _)| {
                let m_right = mx + mw;
                let m_bottom = my + mh;

                let mut left_is_edge = true;
                let mut right_is_edge = true;
                let mut top_is_edge = true;
                let mut bottom_is_edge = true;

                for &(ox, oy, ow, oh, _) in &raw_monitors {
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
            })
            .collect();

        Ok(monitors_with_edges)
    }

    // 获取所有显示器及其真实边缘
    pub fn get_all_monitors_with_edges_global() -> Result<Vec<(i32, i32, i32, i32, bool, bool, bool, bool)>, String> {
        let app = APP_HANDLE.get().ok_or("APP_HANDLE 未初始化")?;
        Self::get_all_monitors_with_edges(app)
    }

    // 约束位置到屏幕边界内
    pub fn constrain_to_physical_bounds(
        app: &AppHandle,
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    ) -> Result<(i32, i32), String> {
        let monitors = Self::get_all_monitors(app)?;

        if monitors.is_empty() {
            return Ok((x.max(0), y.max(0)));
        }

        let selection_right = x + width;
        let selection_bottom = y + height;

        let overlapping_monitors: Vec<_> = monitors
            .iter()
            .filter(|(mx, my, mw, mh, _)| {
                let monitor_right = mx + mw;
                let monitor_bottom = my + mh;
                x < monitor_right && selection_right > *mx && y < monitor_bottom && selection_bottom > *my
            })
            .collect();

        if overlapping_monitors.len() > 1 {
            let (vx, vy, vw, vh) = Self::get_virtual_screen_size_by_app(app)?;
            let constrained_x = x.max(vx).min(vx + vw - width);
            let constrained_y = y.max(vy).min(vy + vh - height);
            Ok((constrained_x, constrained_y))
        } else if overlapping_monitors.len() == 1 {
            let (mx, my, mw, mh, _) = overlapping_monitors[0];
            let monitor_right = mx + mw;
            let monitor_bottom = my + mh;
            let constrained_x = x.max(*mx).min(monitor_right - width);
            let constrained_y = y.max(*my).min(monitor_bottom - height);
            Ok((constrained_x, constrained_y))
        } else {
            let mut best_x = x;
            let mut best_y = y;
            let mut min_distance = i32::MAX as f64;

            for (mx, my, mw, mh, _) in &monitors {
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

// 获取所有屏幕信息
#[tauri::command]
pub fn get_all_screens() -> Result<Vec<(i32, i32, i32, i32, f64)>, String> {
    let app = APP_HANDLE.get().ok_or("APP_HANDLE 未初始化")?;
    ScreenUtils::get_all_monitors(app)
}

use tauri::WebviewWindow;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, HMONITOR, HDC, MONITORINFO, MONITOR_DEFAULTTONEAREST, EnumDisplayMonitors};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, 
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN
};
use windows::Win32::Foundation::{BOOL, LPARAM, RECT};
use std::mem;

/// 显示器信息结构
#[derive(Clone, serde::Serialize, Debug)]
pub struct MonitorInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// CSS像素坐标的显示器信息（用于前端显示）
#[derive(Clone, serde::Serialize, Debug)]
pub struct CssMonitorInfo {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub is_primary: bool,
}

/// 屏幕管理工具
pub struct ScreenUtils;

impl ScreenUtils {
    /// 将物理像素转换为CSS像素
    pub fn physical_to_css(physical: f64, scale_factor: f64) -> f64 {
        physical / scale_factor
    }

    /// 将CSS像素转换为物理像素
    pub fn css_to_physical(css: f64, scale_factor: f64) -> f64 {
        css * scale_factor
    }

    /// 获取CSS像素格式的显示器信息（用于前端显示）
    pub fn get_css_monitors(scale_factor: f64) -> Result<Vec<CssMonitorInfo>, String> {
        let physical_monitors = Self::get_all_monitors()?;
        let css_monitors = physical_monitors.into_iter().map(|monitor| {
            CssMonitorInfo {
                x: Self::physical_to_css(monitor.x as f64, scale_factor),
                y: Self::physical_to_css(monitor.y as f64, scale_factor),
                width: Self::physical_to_css(monitor.width as f64, scale_factor),
                height: Self::physical_to_css(monitor.height as f64, scale_factor),
                is_primary: monitor.is_primary,
            }
        }).collect();
        Ok(css_monitors)
    }

    /// 计算虚拟屏幕的CSS像素尺寸
    pub fn get_css_virtual_screen_size(scale_factor: f64) -> Result<(f64, f64, f64, f64), String> {
        let (x, y, width, height) = Self::get_virtual_screen_size()?;
        Ok((
            Self::physical_to_css(x as f64, scale_factor),
            Self::physical_to_css(y as f64, scale_factor),
            Self::physical_to_css(width as f64, scale_factor),
            Self::physical_to_css(height as f64, scale_factor),
        ))
    }

    /// 通用边界约束函数（智能多显示器边界约束）
    pub fn constrain_to_physical_bounds(
        x: i32, y: i32, width: i32, height: i32,
        _window: &tauri::WebviewWindow
    ) -> Result<(i32, i32), String> {
        let monitors = Self::get_all_monitors()?;
        if monitors.is_empty() {
            return Ok((x.max(0), y.max(0)));
        }

        // 检查选区与哪些显示器有重叠
        let selection_right = x + width;
        let selection_bottom = y + height;
        
        let overlapping_monitors: Vec<_> = monitors.iter().filter(|monitor| {
            let monitor_right = monitor.x + monitor.width as i32;
            let monitor_bottom = monitor.y + monitor.height as i32;
            
            x < monitor_right && selection_right > monitor.x &&
            y < monitor_bottom && selection_bottom > monitor.y
        }).collect();

        if overlapping_monitors.len() > 1 {
            // 跨越多个显示器：只限制在虚拟桌面边界内
            let virtual_screen = Self::get_virtual_screen_size()?;
            let (vx, vy, vw, vh) = virtual_screen;
            
            let constrained_x = x.max(vx).min(vx + vw - width);
            let constrained_y = y.max(vy).min(vy + vh - height);
            Ok((constrained_x, constrained_y))
        } else if overlapping_monitors.len() == 1 {
            // 单个显示器内：应用该显示器的边界
            let monitor = overlapping_monitors[0];
            let monitor_right = monitor.x + (monitor.width as i32);
            let monitor_bottom = monitor.y + (monitor.height as i32);
            let constrained_x = x.max(monitor.x).min(monitor_right - width);
            let constrained_y = y.max(monitor.y).min(monitor_bottom - height);
            Ok((constrained_x, constrained_y))
        } else {
            // 在空白区域：移动到最近的显示器
            let mut best_x = x;
            let mut best_y = y;
            let mut min_distance = i32::MAX as f64;

            for monitor in &monitors {
                let monitor_right = monitor.x + (monitor.width as i32);
                let monitor_bottom = monitor.y + (monitor.height as i32);
                let clamped_x = x.max(monitor.x).min(monitor_right - width);
                let clamped_y = y.max(monitor.y).min(monitor_bottom - height);
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

    /// 获取所有显示器信息
    #[cfg(windows)]
    pub fn get_all_monitors() -> Result<Vec<MonitorInfo>, String> {
        use std::sync::OnceLock;
        static MONITORS: OnceLock<Vec<MonitorInfo>> = OnceLock::new();
        
        let monitors = MONITORS.get_or_init(|| {
            let mut monitors = Vec::new();
            
            unsafe extern "system" fn enum_monitor_proc(
                hmonitor: HMONITOR,
                _hdc: HDC,
                _rect: *mut RECT,
                lparam: LPARAM,
            ) -> BOOL {
                let monitors = lparam.0 as *mut Vec<MonitorInfo>;
                
                let mut monitor_info: MONITORINFO = mem::zeroed();
                monitor_info.cbSize = mem::size_of::<MONITORINFO>() as u32;
                
                if GetMonitorInfoW(hmonitor, &mut monitor_info).as_bool() {
                    let monitor = MonitorInfo {
                        x: monitor_info.rcMonitor.left,
                        y: monitor_info.rcMonitor.top,
                        width: (monitor_info.rcMonitor.right - monitor_info.rcMonitor.left) as u32,
                        height: (monitor_info.rcMonitor.bottom - monitor_info.rcMonitor.top) as u32,
                        is_primary: (monitor_info.dwFlags & 1) == 1, // MONITORINFOF_PRIMARY
                    };
                    
                    unsafe { (*monitors).push(monitor); }
                }
                
                BOOL::from(true)
            }
            
            unsafe {
                let _ = EnumDisplayMonitors(
                    HDC::default(), 
                    None, 
                    Some(enum_monitor_proc), 
                    LPARAM(&mut monitors as *mut _ as isize)
                );
            }
            
            monitors
        });
        
        Ok(monitors.clone())
    }

    #[cfg(not(windows))]
    pub fn get_all_monitors() -> Result<Vec<MonitorInfo>, String> {
        Ok(vec![MonitorInfo {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_primary: true,
        }])
    }


    /// 兼容性函数：返回 (x, y, width, height) 格式
    pub fn get_virtual_screen_size() -> Result<(i32, i32, i32, i32), String> {
        #[cfg(windows)]
        {
            unsafe {
                let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
                let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
                let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                Ok((x, y, width, height))
            }
        }
        #[cfg(not(windows))]
        {
            Ok((0, 0, 1920, 1080))
        }
    }

    /// 兼容性函数：返回 (x, y, width, height) 格式
    pub fn get_monitor_bounds(window: &WebviewWindow) -> Result<(i32, i32, i32, i32), String> {
        #[cfg(windows)]
        {
            let hwnd = HWND(
                window
                    .hwnd()
                    .map_err(|e| format!("获取窗口句柄失败: {}", e))?
                    .0 as isize,
            );

            unsafe {
                let hmonitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                let mut monitor_info = MONITORINFO {
                    cbSize: mem::size_of::<MONITORINFO>() as u32,
                    rcMonitor: RECT::default(),
                    rcWork: RECT::default(),
                    dwFlags: 0,
                };

                if GetMonitorInfoW(hmonitor, &mut monitor_info).as_bool() {
                    let monitor_rect = monitor_info.rcMonitor;
                    Ok((
                        monitor_rect.left,
                        monitor_rect.top,
                        monitor_rect.right - monitor_rect.left,
                        monitor_rect.bottom - monitor_rect.top,
                    ))
                } else {
                    Err("获取显示器信息失败".to_string())
                }
            }
        }
        #[cfg(not(windows))]
        {
            Ok((0, 0, 1920, 1080))
        }
    }
}

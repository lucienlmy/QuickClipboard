use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use std::collections::HashMap;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::{POINT, HWND, RECT, BOOL, LPARAM};
use windows::Win32::UI::Accessibility::{
    IUIAutomation,
    CUIAutomation, TreeScope_Subtree,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, EnumWindows, IsWindowVisible, IsIconic,
    GetWindowRect,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CLSCTX_INPROC_SERVER,
};
use serde::Serialize;

/// 元素检测模式
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DetectionMode {
    None,     // 不检测
    Window,   // 仅窗口
    All,      // 全部元素
}

impl DetectionMode {
    pub fn from_string(s: &str) -> Self {
        match s {
            "none" => DetectionMode::None,
            "window" => DetectionMode::Window,
            "all" => DetectionMode::All,
            _ => DetectionMode::All, // 默认
        }
    }
}

/// 自动选区管理器
pub struct AutoSelectionManager {
    is_active: Arc<AtomicBool>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    screenshot_hwnd: Arc<Mutex<Option<isize>>>,
}

/// 元素边界信息
#[derive(Debug, Clone, Serialize)]
pub struct ElementBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 元素层级信息（包含完整的祖先链）
#[derive(Debug, Clone, Serialize)]
pub struct ElementHierarchy {
    pub hierarchy: Vec<ElementBounds>, // 从最小元素到最大元素（窗口）
    pub current_index: usize, // 当前选中的索引（默认为0，即最小元素）
}

/// 缓存的元素信息
#[derive(Debug, Clone)]
struct CachedElement {
    rect: RECT,
    area: i32,
}

impl AutoSelectionManager {
    pub fn new() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
            app_handle: Arc::new(Mutex::new(None)),
            screenshot_hwnd: Arc::new(Mutex::new(None)),
        }
    }

    /// 启动自动选区检测
    pub fn start(&self, app: AppHandle) -> Result<(), String> {
        if self.is_active.load(Ordering::Relaxed) {
            return Ok(());
        }

        // 获取截屏窗口的HWND
        let screenshot_hwnd = if let Some(window) = app.get_webview_window("screenshot") {
            window.hwnd().ok().map(|h| h.0 as isize)
        } else {
            None
        };

        *self.screenshot_hwnd.lock() = screenshot_hwnd;
        *self.app_handle.lock() = Some(app);
        self.is_active.store(true, Ordering::Relaxed);

        let is_active = Arc::clone(&self.is_active);
        let app_handle = Arc::clone(&self.app_handle);
        let screenshot_hwnd = Arc::clone(&self.screenshot_hwnd);

        // 启动检测线程
        thread::spawn(move || {
            let _ = Self::detection_loop(is_active, app_handle, screenshot_hwnd);
        });

        Ok(())
    }

    /// 停止自动选区检测
    pub fn stop(&self) {
        self.is_active.store(false, Ordering::Relaxed);
        *self.app_handle.lock() = None;
        *self.screenshot_hwnd.lock() = None;
    }

    /// 检测循环
    fn detection_loop(
        is_active: Arc<AtomicBool>,
        app_handle: Arc<Mutex<Option<AppHandle>>>,
        screenshot_hwnd: Arc<Mutex<Option<isize>>>,
    ) -> Result<(), String> {
        // 初始化COM
        unsafe {
            windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
            )
            .ok();
        }

        // 创建UI Automation实例
        let automation: IUIAutomation = unsafe {
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("创建UI Automation失败: {}", e))?
        };

        let mut last_bounds: Option<ElementBounds> = None;
        let mut cache: HashMap<isize, Vec<CachedElement>> = HashMap::new();
        let mut last_hwnd: Option<isize> = None;

        while is_active.load(Ordering::Relaxed) {
            // 从全局设置读取检测模式
            let settings = crate::settings::get_global_settings();
            let current_mode = DetectionMode::from_string(&settings.screenshot_element_detection);
            
            // 如果模式为 None，清除选区并跳过检测
            if current_mode == DetectionMode::None {
                if last_bounds.is_some() {
                    last_bounds = None;
                    if let Some(app) = app_handle.lock().as_ref() {
                        if let Some(window) = app.get_webview_window("screenshot") {
                            let _ = window.emit("auto-selection-clear", ());
                        }
                    }
                }
                thread::sleep(Duration::from_millis(50));
                continue;
            }
            
            // 获取鼠标位置
            let mut cursor_pos = POINT { x: 0, y: 0 };
            if unsafe { GetCursorPos(&mut cursor_pos) }.is_err() {
                thread::sleep(Duration::from_millis(1));
                continue;
            }

            // 获取排除截屏窗口的HWND
            let exclude_hwnd = screenshot_hwnd.lock().clone();

            // 查找鼠标下的窗口（排除截屏窗口）
            let target_hwnd = Self::get_window_under_point(cursor_pos, exclude_hwnd);

            if target_hwnd.is_none() {
                // 没有找到窗口，清除元素
                if last_bounds.is_some() {
                    last_bounds = None;
                    if let Some(app) = app_handle.lock().as_ref() {
                        if let Some(window) = app.get_webview_window("screenshot") {
                            let _ = window.emit("auto-selection-clear", ());
                        }
                    }
                }
                thread::sleep(Duration::from_millis(1));
                continue;
            }

            let hwnd = target_hwnd.unwrap();
            let hwnd_value = hwnd.0 as isize;

            // 检查是否切换了窗口
            let window_changed = last_hwnd != Some(hwnd_value);
            
            // 检查窗口是否已缓存
            if !cache.contains_key(&hwnd_value) {
                // 首次访问此窗口，使用流式缓存 + 即时查找
                match Self::stream_cache_and_find(&automation, hwnd, cursor_pos, &app_handle, &mut last_bounds, current_mode) {
                    Ok(elements) => {
                        cache.insert(hwnd_value, elements);
                    }
                    Err(_) => {
                        thread::sleep(Duration::from_millis(1));
                        continue;
                    }
                }
                // 流式缓存期间已经发送过结果，跳过本次循环的查找
                thread::sleep(Duration::from_millis(1));
                continue;
            }
            
            // 窗口切换时清除上一个边界，强制更新
            if window_changed {
                last_bounds = None;
            }
            
            // 更新当前窗口
            last_hwnd = Some(hwnd_value);

            // 从缓存中查找匹配的元素层级
            if let Some(elements) = cache.get(&hwnd_value) {
                match Self::find_element_hierarchy_from_cache(elements, cursor_pos, current_mode) {
                    Ok(Some(hierarchy_bounds)) => {
                        // 检查最小元素的边界是否变化
                        let smallest_bounds = &hierarchy_bounds[0];
                        let should_update = match &last_bounds {
                            Some(last) => {
                                smallest_bounds.x != last.x
                                    || smallest_bounds.y != last.y
                                    || smallest_bounds.width != last.width
                                    || smallest_bounds.height != last.height
                            }
                            None => true,
                        };

                        if should_update {
                            // 发送元素层级信息到前端
                            if let Some(app) = app_handle.lock().as_ref() {
                                if let Some(window) = app.get_webview_window("screenshot") {
                                    // 获取缩放因子并转换为CSS像素
                                    let scale_factor = window.scale_factor().unwrap_or(1.0);
                                    let css_hierarchy: Vec<ElementBounds> = hierarchy_bounds.iter().map(|bounds| {
                                        ElementBounds {
                                            x: (bounds.x as f64 / scale_factor) as i32,
                                            y: (bounds.y as f64 / scale_factor) as i32,
                                            width: (bounds.width as f64 / scale_factor) as i32,
                                            height: (bounds.height as f64 / scale_factor) as i32,
                                        }
                                    }).collect();
                                    
                                    let hierarchy = ElementHierarchy {
                                        hierarchy: css_hierarchy,
                                        current_index: 0,
                                    };
                                    
                                    let _ = window.emit("auto-selection-hierarchy", &hierarchy);
                                }
                            }

                            last_bounds = Some(smallest_bounds.clone());
                        }
                    }
                    Ok(None) => {
                        // 没有检测到元素
                        if last_bounds.is_some() {
                            last_bounds = None;
                            if let Some(app) = app_handle.lock().as_ref() {
                                if let Some(window) = app.get_webview_window("screenshot") {
                                    let _ = window.emit("auto-selection-clear", ());
                                }
                            }
                        }
                    }
                    Err(_) => {
                        // 忽略查找错误
                    }
                }
            }

            thread::sleep(Duration::from_millis(1));
        }

        // 清理COM
        unsafe {
            windows::Win32::System::Com::CoUninitialize();
        }

        Ok(())
    }

    /// 获取鼠标位置下的窗口（排除指定窗口）
    fn get_window_under_point(point: POINT, exclude_hwnd: Option<isize>) -> Option<HWND> {
        struct EnumData {
            point: POINT,
            exclude_hwnd: Option<isize>,
            found_hwnd: Option<HWND>,
        }

        let mut data = EnumData {
            point,
            exclude_hwnd,
            found_hwnd: None,
        };

        unsafe {
            let _ = EnumWindows(
                Some(Self::enum_windows_proc),
                LPARAM(&mut data as *mut _ as isize),
            );
        }

        data.found_hwnd
    }

    /// 枚举窗口回调
    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam.0 as *mut EnumData);

        // 跳过排除的窗口
        if let Some(exclude) = data.exclude_hwnd {
            if hwnd.0 == exclude {
                return BOOL(1);
            }
        }

        // 检查窗口是否可见且未最小化
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }

        // 获取窗口矩形
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return BOOL(1);
        }

        // 检查点是否在窗口内
        if data.point.x >= rect.left
            && data.point.x <= rect.right
            && data.point.y >= rect.top
            && data.point.y <= rect.bottom
        {
            data.found_hwnd = Some(hwnd);
            return BOOL(0); // 停止枚举
        }

        BOOL(1) // 继续枚举
    }

    /// 流式缓存 + 即时查找
    fn stream_cache_and_find(
        automation: &IUIAutomation,
        target_hwnd: HWND,
        point: POINT,
        app_handle: &Arc<Mutex<Option<AppHandle>>>,
        last_bounds: &mut Option<ElementBounds>,
        detection_mode: DetectionMode,
    ) -> Result<Vec<CachedElement>, String> {
        unsafe {
            let window_element = automation.ElementFromHandle(target_hwnd)
                .map_err(|e| format!("ElementFromHandle 失败: {:?}", e))?;

            // 立即获取并发送窗口本身的边界
            let window_rect = window_element.CurrentBoundingRectangle()
                .map_err(|e| format!("获取窗口边界失败: {:?}", e))?;
            
            let window_width = window_rect.right - window_rect.left;
            let window_height = window_rect.bottom - window_rect.top;
            
            // 检查窗口是否包含鼠标点
            if point.x >= window_rect.left && point.x <= window_rect.right
                && point.y >= window_rect.top && point.y <= window_rect.bottom
            {
                let window_bounds = ElementBounds {
                    x: window_rect.left,
                    y: window_rect.top,
                    width: window_width,
                    height: window_height,
                };
                
                // 立即发送窗口边界层级
                if let Some(app) = app_handle.lock().as_ref() {
                    if let Some(window) = app.get_webview_window("screenshot") {
                        let scale_factor = window.scale_factor().unwrap_or(1.0);
                        let css_bounds = ElementBounds {
                            x: (window_bounds.x as f64 / scale_factor) as i32,
                            y: (window_bounds.y as f64 / scale_factor) as i32,
                            width: (window_bounds.width as f64 / scale_factor) as i32,
                            height: (window_bounds.height as f64 / scale_factor) as i32,
                        };
                        
                        // 发送只包含窗口的层级数据
                        let hierarchy = ElementHierarchy {
                            hierarchy: vec![css_bounds.clone()],
                            current_index: 0,
                        };
                        
                        let _ = window.emit("auto-selection-hierarchy", &hierarchy);
                        *last_bounds = Some(window_bounds.clone());
                    }
                }
            }

            // 如果只检测窗口，将窗口本身作为缓存元素返回
            if detection_mode == DetectionMode::Window {
                let window_area = window_width * window_height;
                return Ok(vec![CachedElement {
                    rect: window_rect,
                    area: window_area,
                }]);
            }

            let condition = automation.CreateTrueCondition()
                .map_err(|e| format!("CreateTrueCondition 失败: {:?}", e))?;

            let elements = window_element.FindAll(TreeScope_Subtree, &condition)
                .map_err(|e| format!("FindAll 失败: {:?}", e))?;

            let count = elements.Length()
                .map_err(|e| format!("获取元素数量失败: {:?}", e))?;

            let mut cached = Vec::new();
            let mut best_match: Option<(ElementBounds, i32)> = None;
            let mut largest_element: Option<(ElementBounds, i32)> = None; // 记录最大元素
            let mut sent_first = false;
            let mut sent_fallback = true; // 窗口边界已发送，标记为true
            const FALLBACK_THRESHOLD: i32 = 50; // 处理50个元素后如果没匹配，发送最大元素

            for i in 0..count {
                if let Ok(element) = elements.GetElement(i) {
                    if let Ok(rect) = element.CurrentBoundingRectangle() {
                        let width = rect.right - rect.left;
                        let height = rect.bottom - rect.top;
                        
                        if width >= 5 && height >= 5 && width <= 5000 && height <= 5000 {
                            let area = width * height;
                            cached.push(CachedElement { rect, area });
                            
                            // 追踪最大元素
                            let should_update_largest = match &largest_element {
                                None => true,
                                Some((_, largest_area)) => area > *largest_area,
                            };
                            
                            if should_update_largest {
                                largest_element = Some((
                                    ElementBounds {
                                        x: rect.left,
                                        y: rect.top,
                                        width,
                                        height,
                                    },
                                    area
                                ));
                            }
                            
                            // 检查是否包含鼠标点
                            if point.x >= rect.left && point.x <= rect.right
                                && point.y >= rect.top && point.y <= rect.bottom
                            {
                                let should_send = match &best_match {
                                    None => true,
                                    Some((_, best_area)) => area < *best_area,
                                };

                                if should_send {
                                    let bounds = ElementBounds {
                                        x: rect.left,
                                        y: rect.top,
                                        width,
                                        height,
                                    };
                                    
                                    best_match = Some((bounds.clone(), area));
                                    
                                    // 立即发送到前端
                                    if let Some(app) = app_handle.lock().as_ref() {
                                        if let Some(window) = app.get_webview_window("screenshot") {
                                            let scale_factor = window.scale_factor().unwrap_or(1.0);
                                            let css_bounds = ElementBounds {
                                                x: (bounds.x as f64 / scale_factor) as i32,
                                                y: (bounds.y as f64 / scale_factor) as i32,
                                                width: (bounds.width as f64 / scale_factor) as i32,
                                                height: (bounds.height as f64 / scale_factor) as i32,
                                            };
                                            
                                            // 发送临时层级
                                            let hierarchy = ElementHierarchy {
                                                hierarchy: vec![css_bounds],
                                                current_index: 0,
                                            };
                                            
                                            let _ = window.emit("auto-selection-hierarchy", &hierarchy);
                                            
                                            if !sent_first {
                                                sent_first = true;
                                            }
                                        }
                                    }
                                    
                                    *last_bounds = Some(bounds);
                                }
                            }
                            
                            // 如果处理了一定数量还没找到匹配，先发送最大元素作为fallback
                            if !sent_first && !sent_fallback && i >= FALLBACK_THRESHOLD {
                                if let Some((largest_bounds, _)) = &largest_element {
                                    // 只有最大元素包含鼠标点才发送
                                    if point.x >= largest_bounds.x && point.x <= largest_bounds.x + largest_bounds.width
                                        && point.y >= largest_bounds.y && point.y <= largest_bounds.y + largest_bounds.height
                                    {
                                        if let Some(app) = app_handle.lock().as_ref() {
                                            if let Some(window) = app.get_webview_window("screenshot") {
                                                let scale_factor = window.scale_factor().unwrap_or(1.0);
                                                let css_bounds = ElementBounds {
                                                    x: (largest_bounds.x as f64 / scale_factor) as i32,
                                                    y: (largest_bounds.y as f64 / scale_factor) as i32,
                                                    width: (largest_bounds.width as f64 / scale_factor) as i32,
                                                    height: (largest_bounds.height as f64 / scale_factor) as i32,
                                                };
                                                
                                                // 发送fallback层级（只包含最大元素）
                                                let hierarchy = ElementHierarchy {
                                                    hierarchy: vec![css_bounds],
                                                    current_index: 0,
                                                };
                                                
                                                let _ = window.emit("auto-selection-hierarchy", &hierarchy);
                                                *last_bounds = Some(largest_bounds.clone());
                                                sent_fallback = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Ok(cached)
        }
    }

    /// 获取包含指定点的所有元素层级（从小到大排序）
    fn find_element_hierarchy_from_cache(
        elements: &[CachedElement],
        point: POINT,
        _detection_mode: DetectionMode,
    ) -> Result<Option<Vec<ElementBounds>>, String> {
        // 找出所有包含该点的元素
        let mut matching_elements: Vec<_> = elements
            .iter()
            .filter(|element| {
                let rect = &element.rect;
                // 检查点是否在元素内
                point.x >= rect.left && point.x <= rect.right
                    && point.y >= rect.top && point.y <= rect.bottom
            })
            .collect();

        if matching_elements.is_empty() {
            return Ok(None);
        }

        // 按面积从小到大排序
        matching_elements.sort_by_key(|element| element.area);

        // 转换为 ElementBounds
        let hierarchy: Vec<ElementBounds> = matching_elements
            .iter()
            .map(|element| {
                let rect = &element.rect;
                ElementBounds {
                    x: rect.left,
                    y: rect.top,
                    width: rect.right - rect.left,
                    height: rect.bottom - rect.top,
                }
            })
            .collect();

        Ok(Some(hierarchy))
    }

    /// 检查是否正在运行
    #[inline]
    pub fn is_active(&self) -> bool {
        self.is_active.load(Ordering::Relaxed)
    }
}

struct EnumData {
    point: POINT,
    exclude_hwnd: Option<isize>,
    found_hwnd: Option<HWND>,
}

// 全局单例
use once_cell::sync::Lazy;
pub static AUTO_SELECTION_MANAGER: Lazy<AutoSelectionManager> = Lazy::new(|| AutoSelectionManager::new());

/// 启动自动选区检测
#[tauri::command]
pub fn start_auto_selection(app: AppHandle) -> Result<(), String> {
    AUTO_SELECTION_MANAGER.start(app)
}

/// 停止自动选区检测
#[tauri::command]
pub fn stop_auto_selection() -> Result<(), String> {
    AUTO_SELECTION_MANAGER.stop();
    Ok(())
}

/// 检查自动选区是否激活
#[tauri::command]
pub fn is_auto_selection_active() -> bool {
    AUTO_SELECTION_MANAGER.is_active()
}

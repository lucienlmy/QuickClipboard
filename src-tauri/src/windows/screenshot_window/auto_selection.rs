use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::element_rect::ElementRect;
use super::ui_elements::UiElementIndex;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DetectionMode {
    None,
    Window,
    All,
}

impl DetectionMode {
    pub fn from_string(s: &str) -> Self {
        match s {
            "none" => DetectionMode::None,
            "window" => DetectionMode::Window,
            "all" => DetectionMode::All,
            _ => DetectionMode::All,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ElementBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ElementHierarchy {
    pub hierarchy: Vec<ElementBounds>,
    pub current_index: usize,
}

pub struct AutoSelectionManager {
    is_active: Arc<AtomicBool>,
    force_emit: Arc<AtomicBool>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    screenshot_hwnd: Arc<Mutex<Option<isize>>>,
    thread_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl AutoSelectionManager {
    pub fn new() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
            force_emit: Arc::new(AtomicBool::new(false)),
            app_handle: Arc::new(Mutex::new(None)),
            screenshot_hwnd: Arc::new(Mutex::new(None)),
            thread_handle: Arc::new(Mutex::new(None)),
        }
    }

    fn emit_hierarchy(app_handle: &Arc<Mutex<Option<AppHandle>>>, rects: &[ElementRect]) {
        if rects.is_empty() {
            return;
        }

        if let Some(app_guard) = app_handle.try_lock() {
            if let Some(app) = app_guard.as_ref() {
                if let Some(window) = app.get_webview_window("screenshot") {
                    let (virt_x, virt_y, _vw, _vh) =
                        crate::screen::ScreenUtils::get_virtual_screen_size()
                            .unwrap_or((0, 0, 1920, 1080));

                    let css_hierarchy: Vec<ElementBounds> = rects
                        .iter()
                        .map(|r| {
                            ElementBounds {
                                x: r.min_x - virt_x,
                                y: r.min_y - virt_y,
                                width: r.max_x - r.min_x,
                                height: r.max_y - r.min_y,
                            }
                        })
                        .collect();

                    if css_hierarchy.is_empty() {
                        return;
                    }

                    let hierarchy = ElementHierarchy {
                        hierarchy: css_hierarchy,
                        current_index: 0,
                    };

                    let _ = window.emit("auto-selection-hierarchy", &hierarchy);
                }
            }
        }
    }

    pub fn start(&self, app: AppHandle) -> Result<(), String> {
        if self.is_active.load(Ordering::Relaxed) {
            return Ok(());
        }

        let screenshot_hwnd = if let Some(window) = app.get_webview_window("screenshot") {
            window.hwnd().ok().map(|h| h.0 as isize)
        } else {
            None
        };

        *self.screenshot_hwnd.lock() = screenshot_hwnd;
        *self.app_handle.lock() = Some(app);
        self.is_active.store(true, Ordering::Relaxed);

        let is_active = Arc::clone(&self.is_active);
        let force_emit = Arc::clone(&self.force_emit);
        let app_handle = Arc::clone(&self.app_handle);
        let screenshot_hwnd = Arc::clone(&self.screenshot_hwnd);

        let handle = thread::Builder::new()
            .name("auto-selection".to_string())
            .spawn(move || {
                let _ = Self::detection_loop(is_active, force_emit, app_handle, screenshot_hwnd);
            })
            .map_err(|e| format!("创建自动选区检测线程失败: {}", e))?;

        *self.thread_handle.lock() = Some(handle);

        Ok(())
    }

    pub fn stop(&self) {
        self.is_active.store(false, Ordering::Relaxed);
        if let Some(handle) = self.thread_handle.lock().take() {
            thread::spawn(move || {
                let _ = handle.join();
            });
        }

        *self.app_handle.lock() = None;
        *self.screenshot_hwnd.lock() = None;
    }

    pub fn is_active(&self) -> bool {
        self.is_active.load(Ordering::Relaxed)
    }

    pub fn request_emit(&self) {
        self.force_emit.store(true, Ordering::Relaxed);
    }

    fn detection_loop(
        is_active: Arc<AtomicBool>,
        force_emit: Arc<AtomicBool>,
        app_handle: Arc<Mutex<Option<AppHandle>>>,
        screenshot_hwnd: Arc<Mutex<Option<isize>>>,
    ) -> Result<(), String> {
        let mut last_rects: Vec<ElementRect> = Vec::new();

        let mut ui_index = UiElementIndex::new();
        if let Err(e) = ui_index.init() {
            eprintln!("auto_selection: 初始化 UIAutomation 失败: {:?}", e);
            is_active.store(false, Ordering::Relaxed);
            return Err(format!("初始化 UIAutomation 失败: {:?}", e));
        }

        let exclude_hwnd = *screenshot_hwnd.lock();
        if let Err(e) = ui_index.rebuild_index(exclude_hwnd) {
            eprintln!("auto_selection: 初始化元素缓存失败: {:?}", e);
            is_active.store(false, Ordering::Relaxed);
            return Err(format!("初始化元素缓存失败: {:?}", e));
        }

        while is_active.load(Ordering::Relaxed) {
            let settings = crate::services::get_settings();
            let current_mode = DetectionMode::from_string(&settings.screenshot_element_detection);

            if current_mode == DetectionMode::None {
                if !last_rects.is_empty() {
                    last_rects.clear();
                    if let Some(app_guard) = app_handle.try_lock() {
                        if let Some(app) = app_guard.as_ref() {
                            if let Some(window) = app.get_webview_window("screenshot") {
                                let _ = window.emit("auto-selection-clear", ());
                            }
                        }
                    }
                }
                thread::sleep(Duration::from_millis(50));
                continue;
            }

            let cursor = crate::mouse::get_cursor_position();

            if current_mode == DetectionMode::Window {
                thread::sleep(Duration::from_millis(20));
                continue;
            }

            let rects = match ui_index.query_chain_at_point(cursor.0, cursor.1) {
                Ok(list) => list,
                Err(_) => {
                    thread::sleep(Duration::from_millis(10));
                    continue;
                }
            };

            // 前端主动请求时：强制发送当前状态
            if force_emit.load(Ordering::Relaxed) {
                force_emit.store(false, Ordering::Relaxed);
                if !rects.is_empty() {
                    Self::emit_hierarchy(&app_handle, &rects);
                }
                thread::sleep(Duration::from_millis(16));
                continue;
            }

            if rects.is_empty() {
                thread::sleep(Duration::from_millis(16));
                continue;
            }

            if rects != last_rects {
                last_rects = rects.clone();
                Self::emit_hierarchy(&app_handle, &rects);
            }

            thread::sleep(Duration::from_millis(16));
        }

        Ok(())
    }
}

pub static AUTO_SELECTION_MANAGER: Lazy<AutoSelectionManager> = Lazy::new(AutoSelectionManager::new);

#[tauri::command]
pub fn start_auto_selection(app: AppHandle) -> Result<(), String> {
    AUTO_SELECTION_MANAGER.start(app)
}

#[tauri::command]
pub fn stop_auto_selection() -> Result<(), String> {
    AUTO_SELECTION_MANAGER.stop();
    Ok(())
}

#[tauri::command]
pub fn request_auto_selection_emit() {
    AUTO_SELECTION_MANAGER.request_emit();
}

#[tauri::command]
pub fn is_auto_selection_active() -> bool {
    AUTO_SELECTION_MANAGER.is_active()
}

#[tauri::command]
pub fn clear_auto_selection_cache() {
    AUTO_SELECTION_MANAGER.stop();
}

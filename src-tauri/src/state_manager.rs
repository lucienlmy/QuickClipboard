use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use once_cell::sync::OnceCell;

// 全局状态管理器
pub struct StateManager {
    pub window_pinned: AtomicBool,
    pub edge_snap_enabled: AtomicBool,
    pub edge_snap_active: Arc<Mutex<bool>>,
    pub callbacks: Arc<Mutex<Vec<Box<dyn Fn(StateChangeEvent) + Send + Sync>>>>,
}

// 状态变化事件
#[derive(Debug, Clone)]
pub enum StateChangeEvent {
    WindowPinned(bool),
    EdgeSnapEnabled(bool),
    EdgeSnapActive(bool),
}

// 全局状态管理器实例
static STATE_MANAGER: OnceCell<StateManager> = OnceCell::new();

impl StateManager {
    pub fn new() -> Self {
        Self {
            window_pinned: AtomicBool::new(false),
            edge_snap_enabled: AtomicBool::new(false),
            edge_snap_active: Arc::new(Mutex::new(false)),
            callbacks: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn global() -> &'static StateManager {
        STATE_MANAGER.get_or_init(|| StateManager::new())
    }

    // 设置窗口固定状态
    pub fn set_window_pinned(&self, pinned: bool) {
        let old_value = self.window_pinned.swap(pinned, Ordering::SeqCst);
        if old_value != pinned {
            self.notify_change(StateChangeEvent::WindowPinned(pinned));
        }
    }

    // 获取窗口固定状态
    pub fn is_window_pinned(&self) -> bool {
        self.window_pinned.load(Ordering::SeqCst)
    }

    // 设置贴边功能启用状态
    pub fn set_edge_snap_enabled(&self, enabled: bool) {
        let old_value = self.edge_snap_enabled.swap(enabled, Ordering::SeqCst);
        if old_value != enabled {
            self.notify_change(StateChangeEvent::EdgeSnapEnabled(enabled));
        }
    }

    // 获取贴边功能启用状态
    pub fn is_edge_snap_enabled(&self) -> bool {
        self.edge_snap_enabled.load(Ordering::SeqCst)
    }

    // 设置贴边激活状态
    pub fn set_edge_snap_active(&self, active: bool) {
        if let Ok(mut state) = self.edge_snap_active.lock() {
            let old_value = *state;
            *state = active;
            if old_value != active {
                self.notify_change(StateChangeEvent::EdgeSnapActive(active));
            }
        }
    }

    // 获取贴边激活状态
    pub fn is_edge_snap_active(&self) -> bool {
        self.edge_snap_active.lock().map(|state| *state).unwrap_or(false)
    }

    // 检查是否应该启用贴边隐藏（贴边功能启用 && 窗口未固定）
    pub fn should_enable_edge_hide(&self) -> bool {
        self.is_edge_snap_enabled() && !self.is_window_pinned()
    }

    // 注册状态变化回调
    pub fn register_callback<F>(&self, callback: F) 
    where
        F: Fn(StateChangeEvent) + Send + Sync + 'static,
    {
        if let Ok(mut callbacks) = self.callbacks.lock() {
            callbacks.push(Box::new(callback));
        }
    }

    // 通知状态变化
    fn notify_change(&self, event: StateChangeEvent) {
        if let Ok(callbacks) = self.callbacks.lock() {
            for callback in callbacks.iter() {
                callback(event.clone());
            }
        }
    }
}

// 便捷函数
pub fn set_window_pinned(pinned: bool) {
    StateManager::global().set_window_pinned(pinned);
}

pub fn is_window_pinned() -> bool {
    StateManager::global().is_window_pinned()
}

pub fn set_edge_snap_enabled(enabled: bool) {
    StateManager::global().set_edge_snap_enabled(enabled);
}

pub fn is_edge_snap_enabled() -> bool {
    StateManager::global().is_edge_snap_enabled()
}

pub fn set_edge_snap_active(active: bool) {
    StateManager::global().set_edge_snap_active(active);
}

pub fn is_edge_snap_active() -> bool {
    StateManager::global().is_edge_snap_active()
}

pub fn should_enable_edge_hide() -> bool {
    StateManager::global().should_enable_edge_hide()
}

pub fn register_state_callback<F>(callback: F) 
where
    F: Fn(StateChangeEvent) + Send + Sync + 'static,
{
    StateManager::global().register_callback(callback);
}

// 检查右键菜单是否显示
pub fn is_context_menu_visible() -> bool {
    crate::plugins::context_menu::is_menu_visible()
}

// 初始化状态管理器
pub fn init_state_manager() {
    // 从设置文件初始化状态
    let settings = crate::settings::get_global_settings();
    let state_manager = StateManager::global();
    state_manager.set_edge_snap_enabled(settings.edge_hide_enabled);

    // 注册贴边状态变化处理
    register_state_callback(|event| {
        match event {
            StateChangeEvent::WindowPinned(pinned) => {
                // 当取消固定时，如果贴边处于激活状态，重新启动监听
                if !pinned && is_edge_snap_active() {
                    if let Some(window) = crate::mouse_hook::MAIN_WINDOW_HANDLE.get() {
                        let _ = crate::edge_snap::restart_mouse_monitoring_if_snapped(window);
                    }
                }
            }
            StateChangeEvent::EdgeSnapEnabled(_) => {
                // 贴边功能启用/禁用时的处理逻辑可以在这里添加
            }
            StateChangeEvent::EdgeSnapActive(_) => {
                // 贴边激活状态变化时的处理逻辑可以在这里添加
            }
        }
    });
}

use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering};
use std::time::Duration;
use tauri::{Emitter, WebviewWindow, Manager};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;

const BOUNDARY_MARGIN: i32 = 0;
static IS_DRAGGING_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallWindowProcW, DefWindowProcW, SetWindowLongPtrW, GWLP_WNDPROC, WINDOWPOS,
        WM_WINDOWPOSCHANGING,
    };

    pub static BOUND_LEFT: AtomicI32 = AtomicI32::new(0);
    pub static BOUND_TOP: AtomicI32 = AtomicI32::new(0);
    pub static BOUND_RIGHT: AtomicI32 = AtomicI32::new(0);
    pub static BOUND_BOTTOM: AtomicI32 = AtomicI32::new(0);
    pub static ORIGINAL_WNDPROC_PTR: AtomicIsize = AtomicIsize::new(0);
    pub static MONITORS: once_cell::sync::Lazy<parking_lot::Mutex<Vec<(i32, i32, i32, i32, bool, bool, bool, bool)>>> = 
        once_cell::sync::Lazy::new(|| parking_lot::Mutex::new(Vec::new()));
    pub static WINDOW_SIZE: once_cell::sync::Lazy<parking_lot::Mutex<(i32, i32)>> = 
        once_cell::sync::Lazy::new(|| parking_lot::Mutex::new((0, 0)));

    pub unsafe fn install_wndproc(hwnd: HWND) {
        let old = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, window_proc as isize);
        ORIGINAL_WNDPROC_PTR.store(old, Ordering::SeqCst);
    }

    pub unsafe fn restore_wndproc(hwnd: HWND) {
        let old = ORIGINAL_WNDPROC_PTR.swap(0, Ordering::SeqCst);
        if old != 0 {
            SetWindowLongPtrW(hwnd, GWLP_WNDPROC, old);
        }
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_WINDOWPOSCHANGING && IS_DRAGGING_ACTIVE.load(Ordering::Relaxed) && lparam.0 != 0 {
            let wp = &mut *(lparam.0 as *mut WINDOWPOS);
            
            if let (Some(monitors), Some(size)) = (MONITORS.try_lock(), WINDOW_SIZE.try_lock()) {
                let (w, h) = *size;
                let cx = wp.x + w / 2;
                let cy = wp.y + h / 2;
                
                let current_monitor = monitors.iter()
                    .find(|(mx, my, mw, mh, _, _, _, _)| {
                        cx >= *mx && cx < mx + mw && cy >= *my && cy < my + mh
                    });
                
                if let Some(&(mx, my, mw, mh, left_edge, right_edge, top_edge, bottom_edge)) = current_monitor {
                    if left_edge {
                        wp.x = wp.x.max(mx);
                    }
                    if right_edge {
                        wp.x = wp.x.min(mx + mw - w);
                    }
                    if top_edge {
                        wp.y = wp.y.max(my);
                    }
                    if bottom_edge {
                        wp.y = wp.y.min(my + mh - h);
                    }
                } else {
                    let vx = BOUND_LEFT.load(Ordering::Relaxed);
                    let vy = BOUND_TOP.load(Ordering::Relaxed);
                    let vright = BOUND_RIGHT.load(Ordering::Relaxed);
                    let vbottom = BOUND_BOTTOM.load(Ordering::Relaxed);
                    wp.x = wp.x.clamp(vx, vright);
                    wp.y = wp.y.clamp(vy, vbottom);
                }
            } else {
                let vx = BOUND_LEFT.load(Ordering::Relaxed);
                let vy = BOUND_TOP.load(Ordering::Relaxed);
                let vright = BOUND_RIGHT.load(Ordering::Relaxed);
                wp.x = wp.x.clamp(vx, vright);
                wp.y = wp.y.max(vy);
            }
        }

        match ORIGINAL_WNDPROC_PTR.load(Ordering::SeqCst) {
            0 => DefWindowProcW(hwnd, msg, wparam, lparam),
            old => CallWindowProcW(std::mem::transmute(old), hwnd, msg, wparam, lparam),
        }
    }
}

#[cfg(target_os = "windows")]
pub fn start_drag(window: &WebviewWindow, _: i32, _: i32) -> Result<(), String> {
    clear_snap_if_needed();
    super::state::set_dragging(true);

    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (w, h) = (size.width as i32, size.height as i32);
    *platform::WINDOW_SIZE.lock() = (w, h);

    let app = window.app_handle();
    let monitors_with_edges = crate::utils::screen::ScreenUtils::get_all_monitors_with_edges(app)
        .unwrap_or_default();
    *platform::MONITORS.lock() = monitors_with_edges;

    let (vx, vy, vw, vh) = crate::utils::screen::ScreenUtils::get_virtual_screen_size_by_app(app)
        .unwrap_or((0, 0, 1920, 1080));

    platform::BOUND_LEFT.store(vx - BOUNDARY_MARGIN, Ordering::SeqCst);
    platform::BOUND_TOP.store(vy - BOUNDARY_MARGIN, Ordering::SeqCst);
    platform::BOUND_RIGHT.store(vx + vw - w + BOUNDARY_MARGIN, Ordering::SeqCst);
    platform::BOUND_BOTTOM.store(vy + vh - h + BOUNDARY_MARGIN, Ordering::SeqCst);

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            platform::install_wndproc(HWND(hwnd.0 as *mut _));
            IS_DRAGGING_ACTIVE.store(true, Ordering::SeqCst);
        }
    }

    let win1 = window.clone();
    std::thread::spawn(move || wait_for_mouse_release(win1));

    let win2 = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(8));
        let _ = win2.start_dragging();
    });

    Ok(())
}

#[cfg(target_os = "windows")]
pub fn stop_drag(window: &WebviewWindow) -> Result<(), String> {
    IS_DRAGGING_ACTIVE.store(false, Ordering::SeqCst);
    super::state::set_dragging(false);

    if let Ok(hwnd) = window.hwnd() {
        unsafe { platform::restore_wndproc(HWND(hwnd.0 as *mut _)); }
    }

    platform::BOUND_LEFT.store(0, Ordering::SeqCst);
    platform::BOUND_TOP.store(0, Ordering::SeqCst);
    platform::BOUND_RIGHT.store(0, Ordering::SeqCst);
    platform::BOUND_BOTTOM.store(0, Ordering::SeqCst);
    platform::MONITORS.lock().clear();

    delayed_check_snap(window);
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn start_drag(window: &WebviewWindow, _: i32, _: i32) -> Result<(), String> {
    clear_snap_if_needed();
    super::state::set_dragging(true);

    let win = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(8));
        let _ = win.start_dragging();
    });
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn stop_drag(window: &WebviewWindow) -> Result<(), String> {
    super::state::set_dragging(false);
    delayed_check_snap(window);
    Ok(())
}

pub fn is_dragging() -> bool {
    IS_DRAGGING_ACTIVE.load(Ordering::SeqCst)
}

fn clear_snap_if_needed() {
    if super::state::is_snapped() {
        super::clear_snap();
        super::edge_monitor::stop_edge_monitoring();
    }
}

fn delayed_check_snap(window: &WebviewWindow) {
    let win = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(100));
        let _ = super::check_snap(&win);
    });
}

#[cfg(target_os = "windows")]
fn wait_for_mouse_release(window: WebviewWindow) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    
    std::thread::sleep(Duration::from_millis(100));
    loop {
        unsafe {
            if GetAsyncKeyState(VK_LBUTTON.0 as i32) >= 0 {
                std::thread::sleep(Duration::from_millis(50));
                if GetAsyncKeyState(VK_LBUTTON.0 as i32) >= 0 {
                    break;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    
    let _ = stop_drag(&window);
    let _ = window.emit("drag-ended", ());
}

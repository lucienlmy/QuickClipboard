pub mod commands;
pub mod window;

use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::sync::{atomic::{AtomicBool, AtomicU64, Ordering}, Mutex};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MenuRegion { pub x: i32, pub y: i32, pub width: i32, pub height: i32 }

struct MenuRegions { main: Option<MenuRegion>, subs: Vec<MenuRegion> }

impl MenuRegions {
    fn contains(&self, x: i32, y: i32) -> bool {
        let hit = |r: &MenuRegion| x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
        self.main.as_ref().map_or(false, hit) || self.subs.iter().any(hit)
    }
}

static MENU_RESULT: OnceCell<Mutex<Option<String>>> = OnceCell::new();
static MENU_OPTIONS: OnceCell<Mutex<Option<window::ContextMenuOptions>>> = OnceCell::new();
static MENU_REGIONS: OnceCell<Mutex<MenuRegions>> = OnceCell::new();
static MENU_VISIBLE: AtomicBool = AtomicBool::new(false);
static ACTIVE_SESSION: AtomicU64 = AtomicU64::new(0);
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[allow(dead_code)]
pub fn init() {
    MENU_RESULT.get_or_init(|| Mutex::new(None));
    MENU_OPTIONS.get_or_init(|| Mutex::new(None));
    MENU_REGIONS.get_or_init(|| Mutex::new(MenuRegions { main: None, subs: vec![] }));
}

pub(crate) fn get_result() -> Option<String> { MENU_RESULT.get()?.lock().ok()?.clone() }
pub(crate) fn set_result(v: Option<String>) { if let Some(m) = MENU_RESULT.get() { if let Ok(mut r) = m.lock() { *r = v; } } }
pub(crate) fn clear_result() { set_result(None); }

pub(crate) fn set_options(opt: window::ContextMenuOptions) { if let Some(m) = MENU_OPTIONS.get() { if let Ok(mut o) = m.lock() { *o = Some(opt); } } }
pub(crate) fn get_options() -> Option<window::ContextMenuOptions> { MENU_OPTIONS.get()?.lock().ok()?.clone() }
pub(crate) fn clear_options() { if let Some(m) = MENU_OPTIONS.get() { if let Ok(mut o) = m.lock() { *o = None; } } }

pub fn clear_options_for_session(sid: u64) {
    if let Some(m) = MENU_OPTIONS.get() {
        if let Ok(mut o) = m.lock() { if o.as_ref().map_or(false, |c| c.session_id == sid) { *o = None; } }
    }
}

pub fn set_active_menu_session(sid: u64) { ACTIVE_SESSION.store(sid, Ordering::Relaxed); MENU_VISIBLE.store(true, Ordering::Relaxed); }
pub fn clear_active_menu_session(sid: u64) { if ACTIVE_SESSION.load(Ordering::Relaxed) == sid { ACTIVE_SESSION.store(0, Ordering::Relaxed); MENU_VISIBLE.store(false, Ordering::Relaxed); } }
pub fn get_active_menu_session() -> u64 { ACTIVE_SESSION.load(Ordering::Relaxed) }
pub fn next_menu_session_id() -> u64 { SESSION_COUNTER.fetch_add(1, Ordering::Relaxed) }
pub fn is_menu_visible() -> bool { MENU_VISIBLE.load(Ordering::Relaxed) }

pub fn update_menu_regions(main: MenuRegion, subs: Vec<MenuRegion>) {
    if let Some(m) = MENU_REGIONS.get() { if let Ok(mut r) = m.lock() { r.main = Some(main); r.subs = subs; } }
}

pub fn is_point_in_menu_region(x: i32, y: i32) -> bool {
    MENU_REGIONS.get().and_then(|r| r.lock().ok()).map_or(false, |r| r.contains(x, y))
}

pub fn clear_menu_regions() {
    if let Some(m) = MENU_REGIONS.get() { if let Ok(mut r) = m.lock() { r.main = None; r.subs.clear(); } }
}

pub fn is_context_menu_visible() -> bool { is_menu_visible() }

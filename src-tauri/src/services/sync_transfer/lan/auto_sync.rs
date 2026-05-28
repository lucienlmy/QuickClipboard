use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::services::webdav_sync::types::SyncReport;

const AUTO_SYNC_SETTINGS_KEY: &str = "sync_transfer_lan_auto_sync_settings";

static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP_FLAG: AtomicBool = AtomicBool::new(false);
static START_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static LAST_REPORT: Lazy<Mutex<Option<LanAutoSyncReportEvent>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanAutoSyncSettings {
    pub auto_push: bool,
    pub auto_pull: bool,
    pub interval_secs: u64,
}

impl Default for LanAutoSyncSettings {
    fn default() -> Self {
        Self {
            auto_push: false,
            auto_pull: false,
            interval_secs: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanAutoSyncStatus {
    pub running: bool,
    pub settings: LanAutoSyncSettings,
    pub last_report: Option<LanAutoSyncReportEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanAutoSyncReportEvent {
    pub mode: String,
    pub peer_device_id: String,
    pub result: SyncReport,
    pub automatic: bool,
}

pub fn settings() -> LanAutoSyncSettings {
    crate::services::store::get::<LanAutoSyncSettings>(AUTO_SYNC_SETTINGS_KEY).unwrap_or_default()
}

pub fn update_settings(settings: LanAutoSyncSettings) -> Result<LanAutoSyncSettings, String> {
    let normalized = LanAutoSyncSettings {
        auto_push: settings.auto_push,
        auto_pull: settings.auto_pull,
        interval_secs: settings.interval_secs.clamp(1, 3600),
    };
    crate::services::store::set(AUTO_SYNC_SETTINGS_KEY, &normalized)?;
    Ok(normalized)
}

pub fn status() -> LanAutoSyncStatus {
    LanAutoSyncStatus {
        running: RUNNING.load(Ordering::SeqCst),
        settings: settings(),
        last_report: LAST_REPORT.lock().clone(),
    }
}

pub fn stop() {
    STOP_FLAG.store(true, Ordering::SeqCst);
}

pub fn start(app: AppHandle) {
    let _guard = START_LOCK.lock();
    if RUNNING.load(Ordering::SeqCst) {
        STOP_FLAG.store(false, Ordering::SeqCst);
        return;
    }

    STOP_FLAG.store(false, Ordering::SeqCst);
    RUNNING.store(true, Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        loop {
            if STOP_FLAG.load(Ordering::SeqCst) {
                break;
            }

            let settings = settings();
            if settings.is_enabled() {
                sync_all_peers(&app, &settings).await;
            }

            sleep_until_next_tick(settings.interval_secs.clamp(1, 3600)).await;
        }
        RUNNING.store(false, Ordering::SeqCst);
    });
}

impl LanAutoSyncSettings {
    pub fn is_enabled(&self) -> bool {
        self.auto_push || self.auto_pull
    }
}

async fn sleep_until_next_tick(seconds: u64) {
    for _ in 0..seconds {
        if STOP_FLAG.load(Ordering::SeqCst) {
            break;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

async fn sync_all_peers(app: &AppHandle, settings: &LanAutoSyncSettings) {
    let peers = super::peer_store::list_peers();
    for peer in peers {
        if STOP_FLAG.load(Ordering::SeqCst) {
            break;
        }
        if settings.auto_push {
            if let Ok(report) = super::push::push_to_peer(&peer.device_id).await {
                store_report(app, "push", peer.device_id.clone(), report);
            }
        }
        if settings.auto_pull {
            if let Ok(report) = super::pull::pull_from_peer(&peer.device_id).await {
                emit_main_window_refresh(app, &report);
                store_report(app, "pull", peer.device_id.clone(), report);
            }
        }
    }
}

fn store_report(app: &AppHandle, mode: &'static str, peer_device_id: String, result: SyncReport) {
    let event = LanAutoSyncReportEvent {
        mode: mode.to_string(),
        peer_device_id,
        result,
        automatic: true,
    };
    *LAST_REPORT.lock() = Some(event.clone());
    let _ = app.emit("sync-transfer-lan-report", event);
}

fn emit_main_window_refresh(app: &AppHandle, report: &SyncReport) {
    if report.pulled_clipboard > 0 {
        crate::windows::main_window::mark_clipboard_refresh_pending();
    }
    if report.pulled_favorites > 0 {
        crate::windows::main_window::mark_favorites_refresh_pending();
    }
    if report.pulled_groups > 0 {
        crate::windows::main_window::mark_groups_refresh_pending();
        crate::windows::main_window::mark_favorites_refresh_pending();
    }
    if report.pulled > 0 && crate::windows::main_window::is_main_window_visible_for_updates() {
        let _ = crate::commands::window::emit_main_window_refresh_needed_event(app);
    }
}

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use crate::services::webdav_sync::types::SyncReport;

const EVENT_SYNC_SETTINGS_KEY: &str = "sync_transfer_lan_event_sync_settings";
const LEGACY_AUTO_SYNC_SETTINGS_KEY: &str = "sync_transfer_lan_auto_sync_settings";

static DISPATCHING: AtomicBool = AtomicBool::new(false);
static PENDING: AtomicBool = AtomicBool::new(false);
static START_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static LAST_REPORT: Lazy<Mutex<Option<LanAutoSyncReportEvent>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanAutoSyncSettings {
    #[serde(default, alias = "auto_push")]
    pub send_enabled: bool,
    #[serde(default, alias = "auto_pull")]
    pub receive_enabled: bool,
}

impl Default for LanAutoSyncSettings {
    fn default() -> Self {
        Self {
            send_enabled: false,
            receive_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanAutoSyncStatus {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyLanAutoSyncSettings {
    #[serde(default)]
    auto_push: bool,
    #[serde(default)]
    auto_pull: bool,
}

pub fn settings() -> LanAutoSyncSettings {
    if let Some(settings) = crate::services::store::get::<LanAutoSyncSettings>(EVENT_SYNC_SETTINGS_KEY) {
        return settings;
    }
    crate::services::store::get::<LegacyLanAutoSyncSettings>(LEGACY_AUTO_SYNC_SETTINGS_KEY)
        .map(|legacy| LanAutoSyncSettings {
            send_enabled: legacy.auto_push,
            receive_enabled: legacy.auto_pull,
        })
        .unwrap_or_default()
}

pub fn update_settings(settings: LanAutoSyncSettings) -> Result<LanAutoSyncSettings, String> {
    let normalized = LanAutoSyncSettings {
        send_enabled: settings.send_enabled,
        receive_enabled: settings.receive_enabled,
    };
    crate::services::store::set(EVENT_SYNC_SETTINGS_KEY, &normalized)?;
    Ok(normalized)
}

pub fn status() -> LanAutoSyncStatus {
    LanAutoSyncStatus {
        settings: settings(),
        last_report: LAST_REPORT.lock().clone(),
    }
}

pub fn can_receive() -> bool {
    settings().receive_enabled
}

pub fn notify_local_change(app: AppHandle, reason: &'static str) {
    let settings = settings();
    if !settings.can_send() {
        return;
    }

    let _guard = START_LOCK.lock();
    if DISPATCHING.load(Ordering::SeqCst) {
        PENDING.store(true, Ordering::SeqCst);
        return;
    }

    DISPATCHING.store(true, Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        loop {
            PENDING.store(false, Ordering::SeqCst);
            sync_all_peers(&app, reason).await;
            if !PENDING.swap(false, Ordering::SeqCst) {
                break;
            }
        }
        DISPATCHING.store(false, Ordering::SeqCst);

        if PENDING.swap(false, Ordering::SeqCst) {
            notify_local_change(app, reason);
        }
    });
}

impl LanAutoSyncSettings {
    pub fn can_send(&self) -> bool {
        self.send_enabled
    }
}

async fn sync_all_peers(app: &AppHandle, reason: &'static str) {
    let peers = super::peer_store::list_peers();
    for peer in peers {
        if !settings().can_send() {
            break;
        }
        if let Ok(report) = super::push::push_to_peer(&peer.device_id).await {
            store_report(app, reason, peer.device_id.clone(), report);
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

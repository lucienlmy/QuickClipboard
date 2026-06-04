use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::services::database::WebdavLocalSyncSignature;

use super::types::{SyncReport, WebdavStatus};

static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP_FLAG: AtomicBool = AtomicBool::new(false);
static AUTO_PUSH_VERSION: AtomicU64 = AtomicU64::new(0);
static AUTO_PUSH_RUNNING: AtomicBool = AtomicBool::new(false);
static AUTO_PUSH_PENDING: AtomicBool = AtomicBool::new(false);
static START_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));
static APP_HANDLE: Lazy<Mutex<Option<AppHandle>>> = Lazy::new(|| Mutex::new(None));
static LAST_REPORT: Lazy<Mutex<Option<WebdavSyncReportEvent>>> = Lazy::new(|| Mutex::new(None));
static LAST_UPLOADED_SIGNATURE: Lazy<Mutex<WebdavLocalSyncSignature>> =
    Lazy::new(|| Mutex::new(WebdavLocalSyncSignature::default()));

#[derive(Clone, Serialize)]
pub struct WebdavSyncReportEvent {
    pub mode: &'static str,
    pub result: SyncReport,
    pub automatic: bool,
}

pub fn set_app_handle(app_handle: AppHandle) {
    *APP_HANDLE.lock() = Some(app_handle);
}

pub fn get_last_report() -> Option<WebdavSyncReportEvent> {
    LAST_REPORT.lock().clone()
}

pub fn store_manual_report(mode: &'static str, result: SyncReport) -> SyncReport {
    if mode == "push" && result.errors.is_empty() {
        mark_uploaded_signature_current();
    }
    store_report(mode, result.clone(), false);
    result
}

pub fn is_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

pub fn stop() {
    STOP_FLAG.store(true, Ordering::SeqCst);
    AUTO_PUSH_VERSION.fetch_add(1, Ordering::SeqCst);
    AUTO_PUSH_PENDING.store(false, Ordering::SeqCst);
}

pub fn start() {
    let _guard = START_LOCK.lock();
    mark_uploaded_signature_current();
    if RUNNING.load(Ordering::SeqCst) {
        STOP_FLAG.store(false, Ordering::SeqCst);
        return;
    }

    STOP_FLAG.store(false, Ordering::SeqCst);
    RUNNING.store(true, Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        let mut seconds_since_pull: u64 = 0;
        loop {
            if STOP_FLAG.load(Ordering::SeqCst) {
                break;
            }

            let settings = crate::services::get_settings();
            if !settings.webdav_enabled {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }

            if settings.webdav_auto_pull {
                let interval = settings.webdav_pull_interval_secs.max(10);
                if seconds_since_pull % interval == 0 {
                    if let Ok(report) = super::download(false).await {
                        store_report("pull", report, true);
                    }
                }
            }

            seconds_since_pull = seconds_since_pull.saturating_add(1);
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        RUNNING.store(false, Ordering::SeqCst);
    });
}

pub fn notify_local_change(app: AppHandle, reason: &'static str) {
    let settings = crate::services::get_settings();
    if !settings.webdav_enabled || !settings.webdav_auto_push {
        return;
    }

    let version = AUTO_PUSH_VERSION.fetch_add(1, Ordering::SeqCst).saturating_add(1);
    let delay_secs = settings.webdav_push_delay_secs.max(1);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(delay_secs)).await;
        if AUTO_PUSH_VERSION.load(Ordering::SeqCst) != version {
            return;
        }
        run_auto_push(app, reason).await;
    });
}

pub fn status() -> WebdavStatus {
    let settings = crate::services::get_settings();
    WebdavStatus {
        enabled: settings.webdav_enabled,
        configured: !settings.webdav_url.trim().is_empty(),
        auto_push: settings.webdav_auto_push,
        auto_pull: settings.webdav_auto_pull,
        running: is_running(),
    }
}

async fn run_auto_push(app: AppHandle, reason: &'static str) {
    let settings = crate::services::get_settings();
    if !settings.webdav_enabled || !settings.webdav_auto_push {
        return;
    }

    if AUTO_PUSH_RUNNING.swap(true, Ordering::SeqCst) {
        AUTO_PUSH_PENDING.store(true, Ordering::SeqCst);
        return;
    }

    match upload_changed_parts().await {
        Ok(Some(report)) => store_report("push", report, true),
        Ok(None) => {}
        Err(e) => {
            eprintln!("[WebDAV同步] 自动推送失败 reason={} 错误={}", reason, e);
        }
    }

    AUTO_PUSH_RUNNING.store(false, Ordering::SeqCst);
    if AUTO_PUSH_PENDING.swap(false, Ordering::SeqCst) {
        notify_local_change(app, reason);
    }
}

async fn upload_changed_parts() -> Result<Option<SyncReport>, String> {
    let signature = crate::services::database::webdav_local_sync_parts_signature()?;
    let last_uploaded_signature = LAST_UPLOADED_SIGNATURE.lock().clone();
    let upload_clipboard = signature.clipboard != last_uploaded_signature.clipboard;
    let upload_favorites = signature.favorites != last_uploaded_signature.favorites;
    let upload_groups = signature.groups != last_uploaded_signature.groups;
    let upload_tombstones = signature.tombstones != last_uploaded_signature.tombstones;

    if !upload_clipboard && !upload_favorites && !upload_groups && !upload_tombstones {
        return Ok(None);
    }

    let report = super::upload_parts(upload_clipboard, upload_favorites, upload_groups).await?;
    if report.errors.is_empty() {
        let uploaded_signature = signature.clone();
        *LAST_UPLOADED_SIGNATURE.lock() = uploaded_signature;
        if crate::services::database::webdav_local_sync_parts_signature()
            .map(|current_signature| current_signature != signature)
            .unwrap_or(false)
        {
            AUTO_PUSH_PENDING.store(true, Ordering::SeqCst);
        }
    }
    Ok(Some(report))
}

fn mark_uploaded_signature_current() {
    if let Ok(signature) = crate::services::database::webdav_local_sync_parts_signature() {
        *LAST_UPLOADED_SIGNATURE.lock() = signature;
    }
}

fn store_report(mode: &'static str, result: SyncReport, automatic: bool) {
    let should_refresh_main_window =
        result.pulled_clipboard > 0 || result.pulled_favorites > 0 || result.pulled_groups > 0;
    let event = WebdavSyncReportEvent { mode, result, automatic };
    *LAST_REPORT.lock() = Some(event.clone());

    let Some(app_handle) = APP_HANDLE.lock().clone() else {
        return;
    };
    if should_refresh_main_window {
        emit_main_window_refresh(&app_handle, &event.result);
    }
    let _ = app_handle.emit("webdav-sync-report", event);
}

fn emit_main_window_refresh(app_handle: &AppHandle, report: &SyncReport) {
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

    if crate::windows::main_window::is_main_window_visible_for_updates() {
        let _ = crate::commands::window::emit_main_window_refresh_needed_event(app_handle);
    }
}

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use super::types::WebdavStatus;

static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP_FLAG: AtomicBool = AtomicBool::new(false);
static START_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

pub fn is_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

pub fn stop() {
    STOP_FLAG.store(true, Ordering::SeqCst);
}

pub fn start() {
    let _guard = START_LOCK.lock();
    if RUNNING.load(Ordering::SeqCst) {
        STOP_FLAG.store(false, Ordering::SeqCst);
        return;
    }

    STOP_FLAG.store(false, Ordering::SeqCst);
    RUNNING.store(true, Ordering::SeqCst);

    tauri::async_runtime::spawn(async move {
        let mut seconds_since_pull: u64 = 0;
        let mut last_uploaded_signature = crate::services::database::WebdavLocalSyncSignature::default();
        loop {
            if STOP_FLAG.load(Ordering::SeqCst) {
                break;
            }

            let settings = crate::services::get_settings();
            if !settings.webdav_enabled {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }

            if settings.webdav_auto_push {
                let delay = settings.webdav_push_delay_secs.max(1);
                if seconds_since_pull % delay == 0 {
                    if let Ok(signature) = crate::services::database::webdav_local_sync_parts_signature() {
                        let upload_clipboard = signature.clipboard != last_uploaded_signature.clipboard;
                        let upload_favorites = signature.favorites != last_uploaded_signature.favorites;
                        let upload_groups = signature.groups != last_uploaded_signature.groups;
                        if upload_clipboard || upload_favorites || upload_groups {
                            if super::upload_parts(upload_clipboard, upload_favorites, upload_groups).await.is_ok() {
                                last_uploaded_signature = signature;
                            }
                        }
                    }
                }
            }

            if settings.webdav_auto_pull {
                let interval = settings.webdav_pull_interval_secs.max(10);
                if seconds_since_pull % interval == 0 {
                    let _ = super::download(false).await;
                }
            }

            seconds_since_pull = seconds_since_pull.saturating_add(1);
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        RUNNING.store(false, Ordering::SeqCst);
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

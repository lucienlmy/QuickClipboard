use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder, WebviewWindow, Manager};
use tauri::{Emitter, Listener};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::time::interval;

static FORCE_UPDATE_MODE: AtomicBool = AtomicBool::new(false);

pub fn is_force_update_mode() -> bool {
    FORCE_UPDATE_MODE.load(Ordering::Relaxed)
}

fn is_prerelease(version: &str) -> bool {
    let v = version.to_lowercase();
    v.contains("alpha") || v.contains("beta") || v.contains("rc") || v.contains("dev")
}

pub fn start_update_checker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = check_updates_and_open_window(&app).await;
        
        let mut ticker = interval(Duration::from_secs(24 * 60 * 60));
        ticker.tick().await;
        
        loop {
            ticker.tick().await;
            let _ = check_updates_and_open_window(&app).await;
        }
    });
}

pub fn open_updater_window(app: &AppHandle, force_update: bool) -> Result<WebviewWindow, String> {
    let window = WebviewWindowBuilder::new(
        app,
        "updater",
        WebviewUrl::App("windows/updater/index.html".into()),
    )
    .title("更新")
    .inner_size(520.0, 640.0)
    .center()
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(true)
    .focused(true)
    .build()
    .map_err(|e| format!("创建更新窗口失败: {}", e))?;

    if force_update {
        let app_for_event = app.clone();
        window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                }
                tauri::WindowEvent::Destroyed => {
                    app_for_event.exit(0);
                }
                _ => {}
            }
        });
    }

    Ok(window)
}

pub async fn check_updates_and_open_window(app: &AppHandle) -> Result<bool, String> {
    use tauri_plugin_updater::UpdaterExt;
    use std::time::Duration;
    
    let endpoints = [
        "https://api.quickclipboard.cn/update/latest.json",
        "https://github.com/mosheng1/QuickClipboard/releases/latest/download/latest.json",
    ];

    let mut force_update = false;
    let mut notes: Option<serde_json::Value> = None;

    if let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(15)).build() {
        for url in endpoints {
            if let Ok(resp) = client.get(url).send().await {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    force_update = json.get("forceUpdate").and_then(|v| v.as_bool()).unwrap_or(false);
                    notes = json.get("notes").cloned();
                    break;
                }
            }
        }
    }

    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => {
            let new_version = update.version.clone();
            let current_version = app.package_info().version.to_string();
            
            if !is_prerelease(&current_version) && is_prerelease(&new_version) {
                return Ok(false);
            }
            
            if force_update {
                FORCE_UPDATE_MODE.store(true, Ordering::Relaxed);
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.hide();
                }
                if let Some(qp_window) = app.get_webview_window("quickpaste") {
                    let _ = qp_window.hide();
                }
                let _ = crate::hotkey::disable_hotkeys();
            }
            
            let window = if let Some(w) = app.get_webview_window("updater") {
                let _ = w.show();
                let _ = w.set_focus();
                w
            } else {
                open_updater_window(app, force_update)?
            };

            let payload = serde_json::json!({
                "forceUpdate": force_update,
                "version": new_version,
                "notes": notes,
            });
            
            let _ = window.emit("update-config", payload.clone());

            let win_for_emit = window.clone();
            let payload_clone = payload.clone();
            window.once("updater-ready", move |_| {
                let _ = win_for_emit.emit("update-config", payload_clone);
            });

            Ok(true)
        }
        None => Ok(false),
    }
}


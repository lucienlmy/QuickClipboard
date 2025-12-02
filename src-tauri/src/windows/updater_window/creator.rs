use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder, WebviewWindow, Manager};
use tauri::{Emitter, Listener};

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
        let w = window.clone();
        let app_for_event = app.clone();
        w.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
            }
            if let tauri::WindowEvent::Destroyed = event {
                app_for_event.exit(0);
            }
        });
    }

    Ok(window)
}

pub async fn check_updates_and_open_window(app: &AppHandle) -> Result<bool, String> {
    use tauri_plugin_updater::UpdaterExt;
    let endpoints = [
        "https://api.quickclipboard.cn/update/latest.json",
        "https://github.com/mosheng1/QuickClipboard/releases/latest/download/latest.json",
    ];

    let mut force_update = false;
    let mut version: Option<String> = None;
    let mut notes: Option<serde_json::Value> = None;

    {
        use std::time::Duration;
        if let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(10)).build() {
            for url in endpoints {
                if let Ok(resp) = client.get(url).send().await {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        force_update = json.get("forceUpdate").and_then(|v| v.as_bool()).unwrap_or(false);
                        version = json.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());
                        notes = json.get("notes").cloned();
                        break;
                    }
                }
            }
        }
    }

    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(_u) => {
            let window = if let Some(w) = app.get_webview_window("updater") {
                let _ = w.show();
                let _ = w.set_focus();
                w
            } else {
                open_updater_window(app, force_update)?
            };

            if force_update {
                let app_clone = app.clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                        }
                        tauri::WindowEvent::Destroyed => {
                            app_clone.exit(0);
                        }
                        _ => {}
                    }
                });
            }

            let payload = serde_json::json!({
                "forceUpdate": force_update,
                "version": version,
                "notes": notes,
            });
            let _ = window.emit("update-config", payload.clone());

            let win_for_emit = window.clone();
            let payload_clone = payload.clone();
            let _ = window.listen("updater-ready", move |_| {
                let _ = win_for_emit.emit("update-config", payload_clone.clone());
            });

            Ok(true)
        }
        None => Ok(false),
    }
}


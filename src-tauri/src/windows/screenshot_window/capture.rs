use xcap::Monitor;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use rayon::prelude::*;
use once_cell::sync::Lazy;
use parking_lot::Mutex;

// 单个显示器截图的信息
#[derive(Serialize, Clone)]
pub struct MonitorScreenshotInfo {
    pub physical_x: i32,
    pub physical_y: i32,
    pub physical_width: u32,
    pub physical_height: u32,
    pub logical_x: i32,
    pub logical_y: i32,
    pub logical_width: u32,
    pub logical_height: u32,
    pub scale_factor: f64,
    pub raw_path: String,
}

// 最近一次截屏结果缓存
static LAST_CAPTURES: Lazy<Mutex<Option<Vec<MonitorScreenshotInfo>>>> =
    Lazy::new(|| Mutex::new(None));

// 清除最近一次截屏结果
pub fn clear_last_captures() {
    let mut guard = LAST_CAPTURES.lock();
    *guard = None;
}

// 捕获所有显示器的截图
pub fn capture_all_monitors_to_files(app: &AppHandle) -> Result<Vec<MonitorScreenshotInfo>, String> {
    let xcap_monitors = Monitor::all().map_err(|e| format!("枚举显示器失败: {}", e))?;
    if xcap_monitors.is_empty() {
        return Err("未找到显示器".to_string());
    }

    let window = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window("screenshot"))
        .ok_or_else(|| "未找到用于获取显示器信息的窗口".to_string())?;

    let tauri_monitors = window
        .available_monitors()
        .map_err(|e| format!("获取显示器列表失败: {}", e))?;

    let tauri_info: Vec<(i32, i32, u32, u32, f64)> = tauri_monitors
        .iter()
        .map(|tm| {
            let pos = tm.position();
            let size = tm.size();
            (pos.x, pos.y, size.width as u32, size.height as u32, tm.scale_factor())
        })
        .collect();

    struct MonitorMeta {
        physical_x: i32,
        physical_y: i32,
        physical_width: u32,
        physical_height: u32,
    }

    let mut monitor_metas = Vec::new();
    for monitor in &xcap_monitors {
        let physical_x = monitor
            .x()
            .map_err(|e| format!("获取显示器 X 坐标失败: {}", e))?;
        let physical_y = monitor
            .y()
            .map_err(|e| format!("获取显示器 Y 坐标失败: {}", e))?;
        let physical_width = monitor
            .width()
            .map_err(|e| format!("获取显示器宽度失败: {}", e))?;
        let physical_height = monitor
            .height()
            .map_err(|e| format!("获取显示器高度失败: {}", e))?;

        monitor_metas.push(MonitorMeta {
            physical_x,
            physical_y,
            physical_width,
            physical_height,
        });
    }

    let results: Result<Vec<(MonitorScreenshotInfo, Vec<u8>)>, String> = monitor_metas
        .into_par_iter()
        .enumerate()
        .map(|(_index, meta)| {
            let xcap_list = Monitor::all().map_err(|e| format!("枚举显示器失败: {}", e))?;
            let mut target: Option<Monitor> = None;
            for m in xcap_list {
                let Ok(x) = m.x() else { continue; };
                let Ok(y) = m.y() else { continue; };
                let Ok(w) = m.width() else { continue; };
                let Ok(h) = m.height() else { continue; };
                if x == meta.physical_x
                    && y == meta.physical_y
                    && w == meta.physical_width
                    && h == meta.physical_height
                {
                    target = Some(m);
                    break;
                }
            }

            let monitor = target.ok_or_else(|| {
                format!(
                    "根据物理坐标未找到匹配的显示器: x={}, y={}, w={}, h={}",
                    meta.physical_x, meta.physical_y, meta.physical_width, meta.physical_height
                )
            })?;

            let raw = monitor
                .capture_image_raw()
                .map_err(|e| format!("截取屏幕失败: {}", e))?;

            // 计算逻辑坐标信息
            let physical_x = meta.physical_x;
            let physical_y = meta.physical_y;
            let physical_width = meta.physical_width;
            let physical_height = meta.physical_height;

            let mut logical_x: i32 = 0;
            let mut logical_y: i32 = 0;
            let mut logical_width: u32 = physical_width;
            let mut logical_height: u32 = physical_height;
            let mut scale_factor = 1.0f64;
            if let Some((lx, ly, lw, lh, sf)) = tauri_info.iter().find(|(x, y, w, h, _)| {
                *x == physical_x && *y == physical_y && *w == physical_width && *h == physical_height
            }) {
                logical_x = *lx;
                logical_y = *ly;
                logical_width = *lw;
                logical_height = *lh;
                scale_factor = *sf;
            }

            let info = MonitorScreenshotInfo {
                physical_x,
                physical_y,
                physical_width,
                physical_height,
                logical_x,
                logical_y,
                logical_width,
                logical_height,
                scale_factor,
                raw_path: String::new(),
            };

            Ok((info, raw))
        })
        .collect();

    let results = results?;

    let raw_images: Vec<Vec<u8>> = results.iter().map(|(_, raw)| raw.clone()).collect();
    let port = crate::utils::image_http_server::set_raw_images(raw_images)?;

    let infos: Vec<MonitorScreenshotInfo> = results
        .into_iter()
        .enumerate()
        .map(|(index, (mut info, _))| {
            info.raw_path = format!("http://127.0.0.1:{}/screen/{}.raw", port, index);
            info
        })
        .collect();

    Ok(infos)
}

// 截取所有显示器并将结果写入全局缓存
pub fn capture_and_store_last(app: &AppHandle) -> Result<(), String> {
    let captures = capture_all_monitors_to_files(app)?;
    let mut guard = LAST_CAPTURES.lock();
    *guard = Some(captures);
    Ok(())
}

// 获取最近一次截屏结果
pub fn get_last_captures() -> Result<Vec<MonitorScreenshotInfo>, String> {
    let guard = LAST_CAPTURES.lock();
    guard
        .clone()
        .ok_or_else(|| "尚未有可用截屏，请先触发截屏".to_string())
}

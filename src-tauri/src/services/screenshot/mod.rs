use xcap::Monitor;
use std::fs;
use std::path::PathBuf;
use std::io::Write;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use rayon::prelude::*;
use once_cell::sync::Lazy;
use parking_lot::Mutex;

// 单个显示器截图的信息
#[derive(Serialize, Clone)]
pub struct MonitorScreenshotInfo {
    pub file_path: String,
    pub physical_x: i32,
    pub physical_y: i32,
    pub physical_width: u32,
    pub physical_height: u32,
    pub logical_x: i32,
    pub logical_y: i32,
    pub logical_width: u32,
    pub logical_height: u32,
    pub scale_factor: f64,
}

// 最近一次截屏结果缓存
static LAST_CAPTURES: Lazy<Mutex<Option<Vec<MonitorScreenshotInfo>>>> =
    Lazy::new(|| Mutex::new(None));

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

    let results: Result<Vec<MonitorScreenshotInfo>, String> = monitor_metas
        .into_par_iter()
        .enumerate()
        .map(|(index, meta)| {
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

            let img = monitor
                .capture_image()
                .map_err(|e| format!("截取屏幕失败: {}", e))?;

            let (width, height) = img.dimensions();
            let raw = img.as_raw();
            
            let pixel_data_size = width * height * 4;
            let file_size = 14 + 40 + pixel_data_size;
            
            let mut buf = vec![0u8; file_size as usize];
            
            buf[0..2].copy_from_slice(b"BM");
            buf[2..6].copy_from_slice(&(file_size as u32).to_le_bytes());
            buf[10..14].copy_from_slice(&54u32.to_le_bytes());
            
            buf[14..18].copy_from_slice(&40u32.to_le_bytes());
            buf[18..22].copy_from_slice(&(width as i32).to_le_bytes());
            buf[22..26].copy_from_slice(&(-(height as i32)).to_le_bytes());
            buf[26..28].copy_from_slice(&1u16.to_le_bytes());
            buf[28..30].copy_from_slice(&32u16.to_le_bytes());
            buf[34..38].copy_from_slice(&(pixel_data_size as u32).to_le_bytes());
            
            unsafe {
                let raw_ptr = raw.as_ptr();
                let buf_ptr = buf.as_mut_ptr().add(54);
                let pixel_count = (width * height) as usize;
                for i in 0..pixel_count {
                    let src_offset = i * 4;
                    let dst_offset = i * 4;
                    *buf_ptr.add(dst_offset) = *raw_ptr.add(src_offset + 2);     // B
                    *buf_ptr.add(dst_offset + 1) = *raw_ptr.add(src_offset + 1); // G
                    *buf_ptr.add(dst_offset + 2) = *raw_ptr.add(src_offset);     // R
                    *buf_ptr.add(dst_offset + 3) = *raw_ptr.add(src_offset + 3); // A
                }
            }

            let mut path: PathBuf = std::env::temp_dir();
            path.push(format!("quickclipboard_screenshot_{}.bmp", index));

            fs::write(&path, &buf).map_err(|e| format!("写入截图文件失败: {}", e))?;

            let file_path = path
                .to_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "截图文件路径无效".to_string())?;
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

            Ok(MonitorScreenshotInfo {
                file_path,
                physical_x,
                physical_y,
                physical_width,
                physical_height,
                logical_x,
                logical_y,
                logical_width,
                logical_height,
                scale_factor,
            })
        })
        .collect();

    results
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

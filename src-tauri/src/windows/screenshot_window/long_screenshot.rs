// 长截屏模块

use image::RgbaImage;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, WebviewWindow};

use super::image_stitcher::{compare_frames, ProcessResult, StitchManager};

const VERTICAL_PADDING: u32 = 30;
const FRAME_CHANGE_THRESHOLD: f64 = 3.0;

#[derive(Debug, Clone, Copy)]
struct SelectionRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy)]
struct ToolbarRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Copy)]
struct PreviewPanelRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

// 全局状态
static LONG_SCREENSHOT_ACTIVE: AtomicBool = AtomicBool::new(false);
static CAPTURING_ACTIVE: AtomicBool = AtomicBool::new(false);
static CAPTURE_EXCLUDE_ENABLED: AtomicBool = AtomicBool::new(false);
static SCREENSHOT_SELECTION: Lazy<Mutex<Option<SelectionRect>>> = Lazy::new(|| Mutex::new(None));
static SCREENSHOT_TOOLBAR: Lazy<Mutex<Option<ToolbarRect>>> = Lazy::new(|| Mutex::new(None));
static PREVIEW_PANEL: Lazy<Mutex<Option<PreviewPanelRect>>> = Lazy::new(|| Mutex::new(None));
static SCREENSHOT_WINDOW: Lazy<Mutex<Option<WebviewWindow>>> = Lazy::new(|| Mutex::new(None));
static SCALE_FACTOR: Lazy<Mutex<f64>> = Lazy::new(|| Mutex::new(1.0));
static STITCH_MANAGER: Lazy<Mutex<StitchManager>> = Lazy::new(|| Mutex::new(StitchManager::new()));

// 启用长截屏模式
pub fn enable_passthrough(
    window: WebviewWindow,
    physical_x: f64,
    physical_y: f64,
    physical_width: f64,
    physical_height: f64,
    physical_toolbar_x: f64,
    physical_toolbar_y: f64,
    physical_toolbar_width: f64,
    physical_toolbar_height: f64,
    selection_scale_factor: f64,
) {
    *SCALE_FACTOR.lock() = selection_scale_factor;
    *SCREENSHOT_WINDOW.lock() = Some(window.clone());

    *SCREENSHOT_SELECTION.lock() = Some(SelectionRect {
        x: physical_x,
        y: physical_y,
        width: physical_width,
        height: physical_height,
    });

    *SCREENSHOT_TOOLBAR.lock() = Some(ToolbarRect {
        x: physical_toolbar_x,
        y: physical_toolbar_y,
        width: physical_toolbar_width,
        height: physical_toolbar_height,
    });

    LONG_SCREENSHOT_ACTIVE.store(true, Ordering::Relaxed);
    CAPTURE_EXCLUDE_ENABLED.store(false, Ordering::Relaxed);
    STITCH_MANAGER.lock().reset();

    thread::spawn(monitor_mouse_position);
}

// 禁用长截屏模式
pub fn disable_passthrough() {
    stop_capturing();
    LONG_SCREENSHOT_ACTIVE.store(false, Ordering::Relaxed);
    CAPTURE_EXCLUDE_ENABLED.store(false, Ordering::Relaxed);
    *SCREENSHOT_SELECTION.lock() = None;
    *SCREENSHOT_TOOLBAR.lock() = None;
    *PREVIEW_PANEL.lock() = None;

    if let Some(window) = SCREENSHOT_WINDOW.lock().as_ref() {
        let _ = window.set_ignore_cursor_events(false);
        set_window_exclude_from_capture(window, false);
    }

    *SCREENSHOT_WINDOW.lock() = None;
    STITCH_MANAGER.lock().reset();
    crate::utils::image_http_server::clear_long_screenshot_preview();
}

// 更新预览面板位置
pub fn update_preview_panel_rect(x: f64, y: f64, width: f64, height: f64) {
    *PREVIEW_PANEL.lock() = Some(PreviewPanelRect { x, y, width, height });
}

// 更新工具栏位置
pub fn update_toolbar_rect(x: f64, y: f64, width: f64, height: f64) {
    *SCREENSHOT_TOOLBAR.lock() = Some(ToolbarRect { x, y, width, height });
}

// 设置窗口是否从屏幕捕获中排除
#[cfg(target_os = "windows")]
fn set_window_exclude_from_capture(window: &WebviewWindow, exclude: bool) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY};

    if let Ok(hwnd) = window.hwnd() {
        // WDA_EXCLUDEFROMCAPTURE = 0x11, WDA_NONE = 0x00
        let affinity = WINDOW_DISPLAY_AFFINITY(if exclude { 0x11 } else { 0x00 });
        unsafe { let _ = SetWindowDisplayAffinity(HWND(hwnd.0), affinity); }
    }
}

#[cfg(not(target_os = "windows"))]
fn set_window_exclude_from_capture(_window: &WebviewWindow, _exclude: bool) {}

// 开始/恢复捕获
pub fn start_capturing() -> Result<(), String> {
    if CAPTURING_ACTIVE.load(Ordering::Relaxed) {
        return Ok(());
    }

    let should_reset = STITCH_MANAGER.lock().is_empty();
    if should_reset {
        STITCH_MANAGER.lock().reset();
    }

    CAPTURING_ACTIVE.store(true, Ordering::Relaxed);

    thread::Builder::new()
        .name("long-screenshot-capture".to_string())
        .spawn(capture_loop)
        .map_err(|e| format!("启动捕获线程失败: {}", e))?;

    Ok(())
}

// 暂停/停止捕获
pub fn stop_capturing() {
    CAPTURING_ACTIVE.store(false, Ordering::Relaxed);
}

// 保存长截屏
pub fn save_long_screenshot(path: String) -> Result<(), String> {
    let manager = STITCH_MANAGER.lock();
    if manager.is_empty() {
        return Err("没有捕获的图片".to_string());
    }
    manager.save_to_file(&path)
}

// 监听鼠标位置，动态控制穿透
fn monitor_mouse_position() {
    while LONG_SCREENSHOT_ACTIVE.load(Ordering::Relaxed) {
        if let Some(selection) = *SCREENSHOT_SELECTION.lock() {
            if let Some(window) = SCREENSHOT_WINDOW.lock().as_ref() {
                let (x, y) = crate::mouse::get_cursor_position();
                let (x, y) = (x as f64, y as f64);

                // 预览面板优先级最高，在预览面板内不穿透
                let in_preview = PREVIEW_PANEL.lock().map_or(false, |p| {
                    x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height
                });

                // 工具栏次优先
                let in_toolbar = SCREENSHOT_TOOLBAR.lock().map_or(false, |t| {
                    x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height
                });

                // 选区内穿透，但预览面板和工具栏区域不穿透
                let in_selection = x >= selection.x && x <= selection.x + selection.width
                    && y >= selection.y && y <= selection.y + selection.height;

                let should_passthrough = in_selection && !in_toolbar && !in_preview;
                let _ = window.set_ignore_cursor_events(should_passthrough);

                // 检查工具栏或预览面板是否与选区重叠
                let toolbar_overlaps = SCREENSHOT_TOOLBAR.lock().map_or(false, |t| {
                    rects_overlap(
                        selection.x, selection.y, selection.width, selection.height,
                        t.x, t.y, t.width, t.height
                    )
                });
                let preview_overlaps = PREVIEW_PANEL.lock().map_or(false, |p| {
                    rects_overlap(
                        selection.x, selection.y, selection.width, selection.height,
                        p.x, p.y, p.width, p.height
                    )
                });

                let should_exclude = toolbar_overlaps || preview_overlaps;
                let currently_excluded = CAPTURE_EXCLUDE_ENABLED.load(Ordering::Relaxed);

                if should_exclude != currently_excluded {
                    set_window_exclude_from_capture(window, should_exclude);
                    CAPTURE_EXCLUDE_ENABLED.store(should_exclude, Ordering::Relaxed);
                }
            }
        }
        thread::sleep(Duration::from_millis(16));
    }
}

// 检查两个矩形是否重叠
fn rects_overlap(x1: f64, y1: f64, w1: f64, h1: f64, x2: f64, y2: f64, w2: f64, h2: f64) -> bool {
    x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2
}

// WGC 捕获器
struct WgcCapturer {
    capturer: scap::capturer::Capturer,
    monitor_x: i32,
    monitor_y: i32,
}

impl WgcCapturer {
    fn new(selection_x: f64, selection_y: f64) -> Option<Self> {
        use scap::capturer::{Capturer, Options, Resolution};
        use scap::frame::FrameType;
        use scap::{get_all_targets, Target};
        use xcap::Monitor;

        let xcap_monitors = Monitor::all().ok()?;
        let sel_x = selection_x as i32;
        let sel_y = selection_y as i32;

        // 找到包含选区的显示器
        let target_monitor = xcap_monitors.iter().find(|m| {
            matches!((m.x(), m.y(), m.width(), m.height()),
                (Ok(mx), Ok(my), Ok(mw), Ok(mh))
                if sel_x >= mx && sel_x < mx + mw as i32 && sel_y >= my && sel_y < my + mh as i32)
        });

        let (monitor_x, monitor_y, xcap_id) = target_monitor
            .map(|m| (m.x().unwrap_or(0), m.y().unwrap_or(0), m.id().ok()))
            .unwrap_or((0, 0, None));

        // 获取显示器刷新率
        let refresh_rate = target_monitor
            .and_then(|m| crate::utils::screen::get_monitor_refresh_rate(m))
            .unwrap_or(60);

        let capture_fps = match refresh_rate {
            r if r >= 120 => 60,
            r if r >= 75 => 45,
            _ => 30,
        };

        let target = xcap_id
            .and_then(|id| get_all_targets().into_iter().find(|t| matches!(t, Target::Display(d) if d.id == id)))
            .or_else(|| Some(Target::Display(scap::get_main_display())))?;

        let options = Options {
            fps: capture_fps,
            show_cursor: false,
            show_highlight: false,
            target: Some(target),
            output_type: FrameType::BGRAFrame,
            output_resolution: Resolution::Captured,
            ..Default::default()
        };

        Capturer::build(options).ok().map(|mut capturer| {
            capturer.start_capture();
            WgcCapturer { capturer, monitor_x, monitor_y }
        })
    }

    fn capture(&mut self, selection: &SelectionRect) -> Result<RgbaImage, String> {
        use scap::frame::{Frame, VideoFrame};

        // 获取最新帧（跳过缓冲的旧帧）
        let mut latest = None;
        while let Ok(Frame::Video(vf)) = self.capturer.try_get_next_frame() {
            latest = Some(vf);
        }

        let video_frame = match latest {
            Some(vf) => vf,
            None => match self.capturer.get_next_frame().map_err(|e| format!("{:?}", e))? {
                Frame::Video(vf) => vf,
                Frame::Audio(_) => return Err("收到音频帧".to_string()),
            }
        };

        let (data, fw, fh) = match video_frame {
            VideoFrame::BGRA(f) => (f.data, f.width as u32, f.height as u32),
            _ => return Err("不支持的帧格式".to_string()),
        };

        let rel_x = ((selection.x as i32) - self.monitor_x).max(0) as u32;
        let rel_y = ((selection.y as i32) - self.monitor_y).max(0) as u32;
        let sel_w = (selection.width as u32).min(fw.saturating_sub(rel_x));
        let sel_h = (selection.height as u32).min(fh.saturating_sub(rel_y));

        if sel_w == 0 || sel_h == 0 {
            return Err("选区超出显示器范围".to_string());
        }

        // BGRA -> RGBA
        let row_stride = (fw * 4) as usize;
        let mut rgba = Vec::with_capacity((sel_w * sel_h * 4) as usize);
        for y in 0..sel_h {
            let src_y = (rel_y + y) as usize;
            for x in 0..sel_w {
                let off = src_y * row_stride + (rel_x + x) as usize * 4;
                if off + 3 < data.len() {
                    rgba.extend_from_slice(&[data[off + 2], data[off + 1], data[off], data[off + 3]]);
                }
            }
        }

        RgbaImage::from_raw(sel_w, sel_h, rgba).ok_or_else(|| "创建图像失败".to_string())
    }

    fn stop(&mut self) {
        self.capturer.stop_capture();
    }
}

// 主捕获循环
fn capture_loop() {
    let mut last_frame: Option<RgbaImage> = None;
    let mut last_update = Instant::now();

    let selection_pos = SCREENSHOT_SELECTION.lock().map(|s| (s.x, s.y));
    // let mut wgc: Option<WgcCapturer> = None;
    let mut wgc = selection_pos.and_then(|(x, y)| WgcCapturer::new(x, y));

    // GDI 捕获间隔
    let gdi_interval_ms = if wgc.is_none() {
        let refresh_rate = selection_pos
            .and_then(|(x, y)| {
                use xcap::Monitor;
                let monitors = Monitor::all().ok()?;
                monitors.into_iter().find(|m| {
                    matches!((m.x(), m.y(), m.width(), m.height()),
                        (Ok(mx), Ok(my), Ok(mw), Ok(mh))
                        if (x as i32) >= mx && (x as i32) < mx + mw as i32 
                        && (y as i32) >= my && (y as i32) < my + mh as i32)
                }).and_then(|m| crate::utils::screen::get_monitor_refresh_rate(&m))
            })
            .unwrap_or(60);
        
        // 限制在 12-30fps
        let target_fps = match refresh_rate {
            r if r >= 120 => 30,
            r if r >= 75 => 24,
            r if r >= 60 => 20,
            _ => 12,
        };
        1000 / target_fps as u64
    } else {
        16
    };

    while CAPTURING_ACTIVE.load(Ordering::Relaxed) {
        if let Some(selection) = *SCREENSHOT_SELECTION.lock() {
            let content_x = selection.x;
            let content_y = selection.y;
            let content_w = selection.width.max(0.0);
            let content_h = selection.height.max(0.0) as u32;

            if content_w <= 0.0 || content_h == 0 {
                thread::sleep(Duration::from_millis(50));
                continue;
            }

            let ext_y = content_y - VERTICAL_PADDING as f64;
            let top_pad = VERTICAL_PADDING;

            let ext_sel = SelectionRect {
                x: content_x,
                y: ext_y,
                width: content_w,
                height: content_h as f64 + (VERTICAL_PADDING * 2) as f64,
            };

            let result = wgc.as_mut()
                .map(|w| w.capture(&ext_sel))
                .unwrap_or_else(|| capture_with_xcap(&ext_sel));

            if let Ok(frame) = result {
                let changed = last_frame.as_ref()
                    .map(|prev| compare_frames(prev, &frame) >= FRAME_CHANGE_THRESHOLD)
                    .unwrap_or(true);

                if changed {
                    let mut mgr = STITCH_MANAGER.lock();
                    let process_result = mgr.process_frame(&frame, top_pad, content_h);
                    let (count, w, h, data) = (mgr.frame_count, mgr.width, mgr.height, mgr.data.clone());
                    drop(mgr);

                    if last_update.elapsed() > Duration::from_millis(100) {
                        match process_result {
                            ProcessResult::Added => {
                                update_preview(&data, w, h, count, None);
                            }
                            ProcessResult::NoMatch => {
                                let rt_data = extract_content_bgra(&frame, top_pad, content_h);
                                update_preview(&data, w, h, count, Some((&rt_data, frame.width(), content_h)));
                            }
                            _ => {
                                update_preview(&data, w, h, count, None);
                            }
                        }
                        last_update = Instant::now();
                    }
                    last_frame = Some(frame);
                }
            }
        }

        if wgc.is_none() {
            thread::sleep(Duration::from_millis(gdi_interval_ms));
        }
    }

    if let Some(ref mut w) = wgc { w.stop(); }
}

fn extract_content_bgra(frame: &RgbaImage, start_y: u32, height: u32) -> Vec<u8> {
    let width = frame.width();
    let raw = frame.as_raw();
    let row_bytes = (width * 4) as usize;
    let end_y = (start_y + height).min(frame.height());

    let mut bgra = Vec::with_capacity((width * height * 4) as usize);
    for y in start_y..end_y {
        let row = (y as usize) * row_bytes;
        for x in 0..width as usize {
            let off = row + x * 4;
            bgra.extend_from_slice(&[raw[off + 2], raw[off + 1], raw[off], raw[off + 3]]);
        }
    }
    bgra
}

fn capture_with_xcap(selection: &SelectionRect) -> Result<RgbaImage, String> {
    use xcap::Monitor;

    let monitors = Monitor::all().map_err(|e| format!("获取显示器失败: {}", e))?;
    let (sel_x, sel_y) = (selection.x as i32, selection.y as i32);
    let (sel_w, sel_h) = (selection.width as u32, selection.height as u32);

    struct Region { monitor: Monitor, mx: i32, my: i32, ix: i32, iy: i32, iw: u32, ih: u32 }

    let regions: Vec<Region> = monitors.into_iter().filter_map(|m| {
        let (mx, my, mw, mh) = (m.x().ok()?, m.y().ok()?, m.width().ok()?, m.height().ok()?);
        let ix = sel_x.max(mx);
        let iy = sel_y.max(my);
        let ir = (sel_x + sel_w as i32).min(mx + mw as i32);
        let ib = (sel_y + sel_h as i32).min(my + mh as i32);
        (ix < ir && iy < ib).then(|| Region {
            monitor: m, mx, my, ix, iy, iw: (ir - ix) as u32, ih: (ib - iy) as u32
        })
    }).collect();

    if regions.is_empty() {
        return Err("未找到包含选区的显示器".to_string());
    }

    if regions.len() == 1 {
        let r = &regions[0];
        return r.monitor.capture_region((r.ix - r.mx) as u32, (r.iy - r.my) as u32, r.iw, r.ih)
            .map_err(|e| format!("截图失败: {}", e));
    }

    let mut img = RgbaImage::new(sel_w, sel_h);
    for r in regions {
        let part = r.monitor.capture_region((r.ix - r.mx) as u32, (r.iy - r.my) as u32, r.iw, r.ih)
            .map_err(|e| format!("截图失败: {}", e))?;
        let (dx, dy) = ((r.ix - sel_x) as u32, (r.iy - sel_y) as u32);
        for y in 0..r.ih {
            for x in 0..r.iw {
                img.put_pixel(dx + x, dy + y, *part.get_pixel(x, y));
            }
        }
    }
    Ok(img)
}

fn encode_bmp(bgra: &[u8], width: u32, height: u32) -> Vec<u8> {
    let size = width * height * 4;
    let file_size = 54 + size;
    let mut buf = vec![0u8; file_size as usize];

    buf[0..2].copy_from_slice(b"BM");
    buf[2..6].copy_from_slice(&file_size.to_le_bytes());
    buf[10..14].copy_from_slice(&54u32.to_le_bytes());
    buf[14..18].copy_from_slice(&40u32.to_le_bytes());
    buf[18..22].copy_from_slice(&(width as i32).to_le_bytes());
    buf[22..26].copy_from_slice(&(-(height as i32)).to_le_bytes());
    buf[26..28].copy_from_slice(&1u16.to_le_bytes());
    buf[28..30].copy_from_slice(&32u16.to_le_bytes());
    buf[34..38].copy_from_slice(&size.to_le_bytes());
    buf[54..].copy_from_slice(bgra);
    buf
}

fn update_preview(data: &[u8], width: u32, height: u32, count: u32, realtime_data: Option<(&[u8], u32, u32)>) {
    if height == 0 { return; }
    let bmp = encode_bmp(data, width, height);
    if let Ok(port) = crate::utils::image_http_server::update_long_screenshot_preview(bmp) {
        if let Some(w) = SCREENSHOT_WINDOW.lock().as_ref() {
            let url = format!("http://127.0.0.1:{}/long-screenshot/preview.bmp?t={}", port, count);
            let _ = w.emit("long-screenshot-preview", serde_json::json!({
                "url": url,
                "width": width,
                "height": height
            }));
            let _ = w.emit("long-screenshot-progress", count);

            if let Some((rt, rw, rh)) = realtime_data {
                if rh > 0 {
                    let rt_bmp = encode_bmp(rt, rw, rh);
                    if crate::utils::image_http_server::update_long_screenshot_realtime(rt_bmp).is_ok() {
                        let ts = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
                        let rt_url = format!("http://127.0.0.1:{}/long-screenshot/realtime.bmp?t={}", port, ts);
                        let _ = w.emit("long-screenshot-realtime", rt_url);
                    }
                }
            } else {
                let _ = w.emit("long-screenshot-realtime", "");
            }
        }
    }
}

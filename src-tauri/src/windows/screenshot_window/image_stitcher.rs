// 长截屏图像拼接模块
// 边缘 NCC 匹配 + 多层模板

use image::RgbaImage;
use rayon::prelude::*;

const TEMPLATE_HEIGHT: u32 = 48;
const SEARCH_RANGE: u32 = 1000;
const EDGE_NCC_THRESHOLD: f64 = 0.70;
const EDGE_NCC_GOOD: f64 = 0.85;
const FRAME_DUPLICATE_THRESHOLD: f64 = 2.5;
const MIN_NEW_CONTENT: u32 = 8;
const TEMPLATE_LAYERS: u32 = 8;
const LAYER_STEP: u32 = 60;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ProcessResult {
    Added,     
    Duplicate, 
    NoMatch,   
    Skipped,   
}

pub struct StitchManager {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub frame_count: u32,
    last_frame_sample: Vec<u8>,
    cached_edges: Vec<Vec<i16>>,
    cached_height: u32,
}

impl StitchManager {
    pub fn new() -> Self {
        Self {
            data: Vec::new(),
            width: 0,
            height: 0,
            frame_count: 0,
            last_frame_sample: Vec::new(),
            cached_edges: Vec::new(),
            cached_height: 0,
        }
    }

    pub fn reset(&mut self) {
        self.data.clear();
        self.width = 0;
        self.height = 0;
        self.frame_count = 0;
        self.last_frame_sample.clear();
        self.cached_edges.clear();
        self.cached_height = 0;
    }

    pub fn is_empty(&self) -> bool {
        self.height == 0
    }

    pub fn process_frame(
        &mut self,
        frame: &RgbaImage,
        content_start: u32,
        content_height: u32,
    ) -> ProcessResult {
        let width = frame.width();
        let frame_height = frame.height();

        if content_start >= frame_height || width < 4 {
            return ProcessResult::Skipped;
        }

        let content_end = content_start.saturating_add(content_height).min(frame_height);
        let actual_height = content_end.saturating_sub(content_start);

        if actual_height < TEMPLATE_HEIGHT + MIN_NEW_CONTENT {
            return ProcessResult::Skipped;
        }

        // 帧重复检测
        let current_sample = sample_frame(frame, content_start, actual_height);
        if !self.last_frame_sample.is_empty() {
            let diff = sample_diff(&self.last_frame_sample, &current_sample);
            if diff < FRAME_DUPLICATE_THRESHOLD {
                return ProcessResult::Duplicate;
            }
        }
        self.last_frame_sample = current_sample;

        // 第一帧
        if self.frame_count == 0 {
            self.width = width;
            self.data = extract_bgra(frame, content_start, actual_height);
            self.height = actual_height;
            self.frame_count = 1;
            self.invalidate_cache();
            return ProcessResult::Added;
        }

        if self.width != width {
            return ProcessResult::Skipped;
        }

        // 当前帧边缘
        let current_gray = to_gray(frame, content_start, actual_height);
        let current_edges = compute_edges(&current_gray, width, actual_height);

        // 更新模板缓存
        self.ensure_cache();

        // 多层模板匹配
        let max_search = SEARCH_RANGE.min(actual_height.saturating_sub(TEMPLATE_HEIGHT));
        let template_len = (TEMPLATE_HEIGHT * width) as usize;

        let mut best_match: Option<(u32, u32, f64)> = None;

        for layer in 0..TEMPLATE_LAYERS {
            let layer_idx = layer as usize;
            if layer_idx >= self.cached_edges.len() {
                break;
            }

            let template_edges = &self.cached_edges[layer_idx];
            if template_edges.is_empty() {
                continue;
            }

            // 并行搜索
            let results: Vec<(u32, f64)> = (0..=max_search)
                .into_par_iter()
                .filter_map(|y| {
                    let start = (y as usize) * (width as usize);
                    let end = start + template_len;

                    if end > current_edges.len() {
                        return None;
                    }

                    let region = &current_edges[start..end];
                    let ncc = compute_ncc_i16(template_edges, region);
                    
                    if ncc >= EDGE_NCC_THRESHOLD {
                        Some((y, ncc))
                    } else {
                        None
                    }
                })
                .collect();

            if let Some(&(match_y, ncc)) = results
                .iter()
                .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            {
                let template_offset = layer * LAYER_STEP;

                if best_match.is_none() || ncc > best_match.unwrap().2 {
                    best_match = Some((template_offset, match_y, ncc));
                }

                if ncc >= EDGE_NCC_GOOD {
                    break;
                }
            }
        }

        // 处理匹配结果
        match best_match {
            Some((template_offset, match_y, _ncc)) => {
                let new_start = match_y.saturating_add(TEMPLATE_HEIGHT);

                if new_start >= actual_height {
                    return ProcessResult::Skipped;
                }

                let new_height = actual_height.saturating_sub(new_start);

                if new_height < MIN_NEW_CONTENT {
                    return ProcessResult::Skipped;
                }

                // 裁剪多余部分
                if template_offset > 0 {
                    let new_stitched_height = self.height.saturating_sub(template_offset);
                    let new_data_len = (new_stitched_height * self.width * 4) as usize;
                    if new_data_len < self.data.len() {
                        self.data.truncate(new_data_len);
                        self.height = new_stitched_height;
                    }
                }

                // 追加新内容
                let extract_start = content_start.saturating_add(new_start);
                if extract_start + new_height > frame_height {
                    return ProcessResult::Skipped;
                }

                let new_data = extract_bgra(frame, extract_start, new_height);
                self.data.extend_from_slice(&new_data);
                self.height = self.height.saturating_add(new_height);
                self.frame_count += 1;
                self.invalidate_cache();

                ProcessResult::Added
            }
            None => ProcessResult::NoMatch,
        }
    }

    fn invalidate_cache(&mut self) {
        self.cached_height = 0;
    }

    fn ensure_cache(&mut self) {
        if self.cached_height == self.height && !self.cached_edges.is_empty() {
            return;
        }

        self.cached_edges.clear();

        for layer in 0..TEMPLATE_LAYERS {
            let template_offset = layer * LAYER_STEP;

            if self.height < TEMPLATE_HEIGHT + template_offset {
                self.cached_edges.push(Vec::new());
                continue;
            }

            let template_start_row = self.height - TEMPLATE_HEIGHT - template_offset;
            let edges = self.extract_template_edges(template_start_row);
            self.cached_edges.push(edges);
        }

        self.cached_height = self.height;
    }

    fn extract_template_edges(&self, start_row: u32) -> Vec<i16> {
        if self.data.is_empty() || self.width < 2 {
            return Vec::new();
        }

        let rows = TEMPLATE_HEIGHT;
        let row_bytes = (self.width * 4) as usize;
        let start_byte = (start_row as usize) * row_bytes;
        let required = (rows as usize) * row_bytes;

        if start_byte + required > self.data.len() {
            return Vec::new();
        }

        let mut gray = Vec::with_capacity((self.width * rows) as usize);
        for y in 0..rows {
            let row_start = start_byte + (y as usize) * row_bytes;
            for x in 0..self.width as usize {
                let offset = row_start + x * 4;
                let b = self.data[offset] as u32;
                let g = self.data[offset + 1] as u32;
                let r = self.data[offset + 2] as u32;
                gray.push(((r + g + g + b) >> 2) as u8);
            }
        }

        compute_edges(&gray, self.width, rows)
    }

    pub fn to_rgba_image(&self) -> RgbaImage {
        if self.is_empty() {
            return RgbaImage::new(1, 1);
        }
        let mut rgba = vec![0u8; self.data.len()];
        rgba.par_chunks_mut(4)
            .zip(self.data.par_chunks(4))
            .for_each(|(dst, src)| {
                dst[0] = src[2]; // R
                dst[1] = src[1]; // G
                dst[2] = src[0]; // B
                dst[3] = src[3]; // A
            });
        RgbaImage::from_raw(self.width, self.height, rgba)
            .unwrap_or_else(|| RgbaImage::new(self.width, self.height))
    }

    pub fn save_to_file(&self, path: &str) -> Result<(), String> {
        use image::codecs::png::{CompressionType, FilterType, PngEncoder};
        use std::fs::File;
        use std::io::BufWriter;

        if self.is_empty() {
            return Err("没有图像数据".to_string());
        }

        let file = File::create(path).map_err(|e| format!("创建文件失败: {}", e))?;
        let writer = BufWriter::with_capacity(1024 * 1024, file); // 1MB 缓冲

        let encoder = PngEncoder::new_with_quality(writer, CompressionType::Fast, FilterType::NoFilter);

        let rgba = self.to_rgba_image();
        rgba.write_with_encoder(encoder)
            .map_err(|e| format!("编码失败: {}", e))
    }
}

impl Default for StitchManager {
    fn default() -> Self {
        Self::new()
    }
}

// 边缘检测
fn compute_edges(gray: &[u8], width: u32, height: u32) -> Vec<i16> {
    let w = width as usize;
    let h = height as usize;

    if w < 2 || h < 2 || gray.len() < w * h {
        return vec![0i16; w * h];
    }

    let mut edges = vec![0i16; w * h];

    for y in 0..h {
        for x in 1..(w - 1) {
            let idx = y * w + x;
            edges[idx] = gray[idx + 1] as i16 - gray[idx - 1] as i16;
        }
    }

    edges
}

fn compute_ncc_i16(a: &[i16], b: &[i16]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return -1.0;
    }

    let mut sum_a: i64 = 0;
    let mut sum_b: i64 = 0;
    let mut sum_aa: i64 = 0;
    let mut sum_bb: i64 = 0;
    let mut sum_ab: i64 = 0;
    let mut count: i64 = 0;

    // 每 4 像素采样
    for i in (0..a.len()).step_by(4) {
        let av = a[i] as i64;
        let bv = b[i] as i64;
        sum_a += av;
        sum_b += bv;
        sum_aa += av * av;
        sum_bb += bv * bv;
        sum_ab += av * bv;
        count += 1;
    }

    if count == 0 {
        return -1.0;
    }

    let mean_a = sum_a as f64 / count as f64;
    let mean_b = sum_b as f64 / count as f64;

    let var_a = (sum_aa as f64 / count as f64) - mean_a * mean_a;
    let var_b = (sum_bb as f64 / count as f64) - mean_b * mean_b;

    if var_a < 1.0 || var_b < 1.0 {
        return -1.0;
    }

    let cov = (sum_ab as f64 / count as f64) - mean_a * mean_b;
    cov / (var_a.sqrt() * var_b.sqrt())
}

//帧采样
fn sample_frame(frame: &RgbaImage, start_y: u32, height: u32) -> Vec<u8> {
    let width = frame.width();
    let raw = frame.as_raw();
    let row_bytes = (width * 4) as usize;

    let mut samples = Vec::with_capacity(256);
    let y_step = (height / 16).max(1);
    let x_step = (width / 16).max(1);

    for y in (0..height).step_by(y_step as usize) {
        let row_start = ((start_y + y) as usize) * row_bytes;
        for x in (0..width).step_by(x_step as usize) {
            let offset = row_start + (x as usize) * 4;
            if offset + 2 < raw.len() {
                let g = ((raw[offset] as u32 + raw[offset + 1] as u32 + raw[offset + 2] as u32) / 3) as u8;
                samples.push(g);
            }
        }
    }

    samples
}

fn sample_diff(s1: &[u8], s2: &[u8]) -> f64 {
    if s1.len() != s2.len() || s1.is_empty() {
        return 255.0;
    }

    let sum: u64 = s1
        .iter()
        .zip(s2.iter())
        .map(|(&a, &b)| (a as i32 - b as i32).unsigned_abs() as u64)
        .sum();

    sum as f64 / s1.len() as f64
}

// 灰度与 BGRA
fn to_gray(frame: &RgbaImage, start_y: u32, height: u32) -> Vec<u8> {
    let width = frame.width();
    let raw = frame.as_raw();
    let row_bytes = (width * 4) as usize;
    let end_y = (start_y + height).min(frame.height());

    let mut gray = Vec::with_capacity((width * height) as usize);

    for y in start_y..end_y {
        let row_start = (y as usize) * row_bytes;
        for x in 0..width as usize {
            let offset = row_start + x * 4;
            let g = ((raw[offset] as u32 + raw[offset + 1] as u32 * 2 + raw[offset + 2] as u32) >> 2) as u8;
            gray.push(g);
        }
    }

    gray
}

fn extract_bgra(frame: &RgbaImage, start_y: u32, height: u32) -> Vec<u8> {
    let width = frame.width();
    let raw = frame.as_raw();
    let row_bytes = (width * 4) as usize;
    let end_y = (start_y + height).min(frame.height());

    let mut bgra = Vec::with_capacity((width * height * 4) as usize);

    for y in start_y..end_y {
        let row_start = (y as usize) * row_bytes;
        for x in 0..width as usize {
            let offset = row_start + x * 4;
            bgra.push(raw[offset + 2]);
            bgra.push(raw[offset + 1]);
            bgra.push(raw[offset]);
            bgra.push(raw[offset + 3]);
        }
    }

    bgra
}

pub fn compare_frames(frame1: &RgbaImage, frame2: &RgbaImage) -> f64 {
    if frame1.width() != frame2.width() || frame1.height() != frame2.height() {
        return 255.0;
    }

    let (width, height) = (frame1.width(), frame1.height());
    let raw1 = frame1.as_raw();
    let raw2 = frame2.as_raw();
    let row_bytes = (width * 4) as usize;

    let mut total_diff = 0u64;
    let mut count = 0u32;

    for y in (0..height).step_by(16) {
        let row_start = (y as usize) * row_bytes;
        for x in (0..width as usize).step_by(16) {
            let offset = row_start + x * 4;
            for i in 0..3 {
                total_diff += (raw1[offset + i] as i32 - raw2[offset + i] as i32).unsigned_abs() as u64;
            }
            count += 3;
        }
    }

    if count > 0 {
        total_diff as f64 / count as f64
    } else {
        255.0
    }
}

use image::{RgbaImage, ImageBuffer};
use rayon::prelude::*;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder};

#[derive(Clone)]
pub struct CapturedFrame {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

pub struct StitchResult {
    pub new_content_y: u32,
    pub new_content_height: u32,
}

pub struct ImageStitcher;

impl ImageStitcher {
    /// BGRA转RGBA（并行转换）
    pub fn bgra_to_rgba_image(bgra: &[u8], width: u32, height: u32) -> RgbaImage {
        let mut rgba = vec![0u8; bgra.len()];
        rgba.par_chunks_exact_mut(4)
            .zip(bgra.par_chunks_exact(4))
            .for_each(|(dst, src)| {
                dst[0] = src[2]; // R
                dst[1] = src[1]; // G
                dst[2] = src[0]; // B
                dst[3] = src[3]; // A
            });
        ImageBuffer::from_raw(width, height, rgba).unwrap()
    }

    /// 列采样 - 在图像的几个固定列位置提取并平均像素值
    fn col_sampling(img: &RgbaImage, crop_top: u32, crop_bottom: u32) -> Vec<Vec<f64>> {
        let width = img.width() as f64;
        let height = (img.height() - crop_top - crop_bottom) as usize;
        
        // 定义采样列位置
        let col_groups = vec![
            vec![
                (width * 0.05) as u32,
                (width * 0.15) as u32,
                (width * 0.25) as u32,
            ],
            vec![
                (width * 0.50) as u32,
                (width * 0.55) as u32,
                (width * 0.625) as u32,
            ],
            vec![
                (width * 0.75) as u32,
                (width * 0.80) as u32,
                (width * 0.875) as u32,
            ],
        ];

        col_groups
            .iter()
            .map(|cols| {
                let mut result = vec![0.0; height];
                for y in 0..height {
                    let mut sum = 0.0;
                    for &col in cols {
                        let pixel = img.get_pixel(col, crop_top + y as u32);
                        // 转换为灰度值
                        sum += (pixel[0] as f64 * 0.299 + pixel[1] as f64 * 0.587 + pixel[2] as f64 * 0.114) / cols.len() as f64;
                    }
                    result[y] = sum;
                }
                result
            })
            .collect()
    }

    /// 根据预测值生成最佳偏移序列
    fn predict_offset(max: i32, p: i32) -> Vec<i32> {
        let p = p.clamp(-max, max);
        
        let mut result = Vec::with_capacity((max * 2 + 1) as usize);
        result.push(0);

        if p > 0 {
            // 正向预测：优先搜索预测值附近
            for i in 1..=max {
                if p - i >= -max && p - i != 0 {
                    result.push(p - i);
                }
                if p + i <= max {
                    result.push(p + i);
                }
            }
            // 添加远离预测值的位置
            for i in (-max..0).rev() {
                if (i - p).abs() > max && !result.contains(&i) {
                    result.push(i);
                }
            }
        } else {
            // 负向或零预测
            for i in 1..=max {
                if p + i <= max && p + i != 0 {
                    result.push(p + i);
                }
                if p - i >= -max {
                    result.push(p - i);
                }
            }
        }

        result
    }

    /// 计算两个采样向量的重叠差异
    fn diff_overlap(
        cols1: &[Vec<f64>],
        cols2: &[Vec<f64>],
        predict: i32,
        approx_diff: f64,
        min_overlap: usize,
    ) -> (i32, f64) {
        let len = cols1[0].len();
        let max = (len - min_overlap) as i32;
        
        let mut min_result = (0, 255.0);
        let mut approach_count = 0;

        for offset in Self::predict_offset(max, predict) {
            let mut total_diff = 0.0;
            let mut count = 0;

            for col_idx in 0..cols1.len() {
                let col1 = &cols1[col_idx];
                let col2 = &cols2[col_idx];

                if offset == 0 {
                    for i in 0..len {
                        total_diff += (col1[i] - col2[i]).abs();
                        count += 1;
                    }
                } else if offset > 0 {
                    let offset = offset as usize;
                    for i in 0..(len - offset) {
                        total_diff += (col1[i + offset] - col2[i]).abs();
                        count += 1;
                    }
                } else {
                    let offset = (-offset) as usize;
                    for i in 0..(len - offset) {
                        total_diff += (col1[i] - col2[i + offset]).abs();
                        count += 1;
                    }
                }
            }

            let avg_diff = if count > 0 { total_diff / count as f64 } else { 255.0 };

            if avg_diff < min_result.1 {
                min_result = (offset, avg_diff);
            }

            // 早期退出优化
            if min_result.1 < approx_diff {
                approach_count += 1;
                if approach_count > 10 || avg_diff < approx_diff / 4.0 {
                    return min_result;
                }
            }
        }

        min_result
    }

    pub fn should_stitch_frame_ex(
        last_img: &RgbaImage,
        current_img: &RgbaImage,
        last_content_offset: u32,
        last_content_height: u32,
        current_content_offset: u32,
        current_content_height: u32,
    ) -> Option<StitchResult> {
        // 快速重复帧检测
        if Self::is_duplicate_frame(last_img, current_img) {
            return None;
        }

        // 使用列采样算法计算重叠
        let crop_top = last_content_offset.max(current_content_offset);
        let crop_bottom_last = last_img.height() - (last_content_offset + last_content_height);
        let crop_bottom_current = current_img.height() - (current_content_offset + current_content_height);
        let crop_bottom = crop_bottom_last.max(crop_bottom_current);

        // 确保有足够的内容区域
        if last_img.height() <= crop_top + crop_bottom || current_img.height() <= crop_top + crop_bottom {
            return None;
        }

        let cols1 = Self::col_sampling(last_img, crop_top, crop_bottom);
        let cols2 = Self::col_sampling(current_img, crop_top, crop_bottom);

        // 使用更宽松的参数进行匹配
        let (offset, diff) = Self::diff_overlap(&cols1, &cols2, 0, 0.5, 50);

        // 根据diff质量判断是否接受匹配
        // diff值越小表示匹配质量越好
        if diff > 15.0 {
            return None;
        }

        // offset为正表示向下滚动了多少像素
        let scroll_amount = offset.abs() as u32;

        if scroll_amount < 2 {
            return None;
        }

        // 计算新内容区域
        let new_content_height = scroll_amount.min(current_content_height);
        let new_content_y = (current_content_offset + current_content_height).saturating_sub(new_content_height);

        // 验证新内容是否真的不同（避免拼接相同内容）
        if new_content_height > 5 {
            let check_h = new_content_height.min(40);
            let check_y_in_current = (current_content_offset + current_content_height).saturating_sub(check_h);
            let check_y_in_last = (last_content_offset + last_content_height).saturating_sub(check_h);

            let mut diff_pixels = 0;
            let mut total_pixels = 0;
            
            for y in (0..check_h).step_by(6) {
                for x in (0..current_img.width()).step_by(6) {
                    let p_new = current_img.get_pixel(x, check_y_in_current + y);
                    let p_old = last_img.get_pixel(x, check_y_in_last + y);
                    
                    let diff = (p_new[0] as i32 - p_old[0] as i32).abs() +
                               (p_new[1] as i32 - p_old[1] as i32).abs() +
                               (p_new[2] as i32 - p_old[2] as i32).abs();
                    
                    if diff > 30 {
                        diff_pixels += 1;
                    }
                    total_pixels += 1;
                }
            }
            
            if total_pixels > 0 && (diff_pixels as f64 / total_pixels as f64) < 0.10 {
                return None;
            }
        }

        Some(StitchResult {
            new_content_y,
            new_content_height,
        })
    }
    
    /// 高精度帧重复检测
    pub fn is_duplicate_frame(img1: &RgbaImage, img2: &RgbaImage) -> bool {
        if img1.width() != img2.width() || img1.height() != img2.height() {
            return false;
        }

        let step = 8;
        let width = img1.width();
        let height = img1.height();

        let diff_ratio: f64 = (0..height)
            .into_par_iter()
            .step_by(step as usize)
            .map(|y| {
                let mut row_diff = 0usize;
                let mut row_count = 0usize;
                for x in (0..width).step_by(step as usize) {
                    let p1 = img1.get_pixel(x, y);
                    let p2 = img2.get_pixel(x, y);
                    let diff = (p1[0] as i32 - p2[0] as i32).abs() +
                               (p1[1] as i32 - p2[1] as i32).abs() +
                               (p1[2] as i32 - p2[2] as i32).abs();
                    if diff > 30 {
                        row_diff += 1;
                    }
                    row_count += 1;
                }
                row_diff as f64 / row_count as f64
            })
            .sum::<f64>() / ((height / step) as f64);

        let similarity = 1.0 - diff_ratio;
        similarity > 0.99
    }

    /// 提取指定区域（BGRA格式）
    pub fn extract_region(data: &[u8], width: u32, start_y: u32, extract_height: u32) -> Vec<u8> {
        let bytes_per_pixel = 4;
        let start_idx = (start_y * width * bytes_per_pixel) as usize;
        let end_idx = start_idx + (extract_height * width * bytes_per_pixel) as usize;
        data[start_idx..end_idx].to_vec()
    }

    /// 创建预览图
    pub fn create_preview(frames: &[CapturedFrame]) -> CapturedFrame {
        if frames.is_empty() {
            return CapturedFrame { data: vec![], width: 0, height: 0 };
        }

        let width = frames[0].width;
        let total_height: u32 = frames.iter().map(|f| f.height).sum();

        // 直接拼接所有帧，不进行任何缩放
        let mut stitched_data = Vec::with_capacity((width * total_height * 4) as usize);
        for frame in frames {
            stitched_data.extend_from_slice(&frame.data);
        }

        CapturedFrame {
            data: stitched_data,
            width,
            height: total_height,
        }
    }

    /// BGRA转PNG
    pub fn bgra_to_png(bgra: &[u8], width: u32, height: u32) -> Vec<u8> {
        let mut rgba = vec![0u8; bgra.len()];
        rgba.par_chunks_exact_mut(4)
            .zip(bgra.par_chunks_exact(4))
            .for_each(|(dst, src)| {
                dst[0] = src[2];
                dst[1] = src[1];
                dst[2] = src[0];
                dst[3] = src[3];
            });

        let mut png_bytes = Vec::new();
        let encoder = PngEncoder::new(&mut png_bytes);
        let _ = encoder.write_image(&rgba, width, height, ExtendedColorType::Rgba8);
        png_bytes
    }
}

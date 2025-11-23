use image::RgbaImage;

#[derive(Debug, Clone)]
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
    pub fn should_stitch_frame_ex(
        last_frame: &RgbaImage,
        current_frame: &RgbaImage,
        last_top_padding: u32,
        last_content_height: u32,
        current_top_padding: u32,
        current_content_height: u32,
    ) -> Option<StitchResult> {
        let last_width = last_frame.width();
        let current_width = current_frame.width();
        
        if last_width != current_width {
            return None;
        }
        
        let width = last_width;
        
        // 上一帧的实际内容区域
        let last_content_start = last_top_padding;
        let last_content_end = last_top_padding + last_content_height;
        
        // 当前帧的实际内容区域
        let current_content_start = current_top_padding;
        let current_content_end = current_top_padding + current_content_height;
        
        // 在上一帧底部寻找匹配
        let compare_height = 30.min(last_content_height / 3);
        let last_compare_start = last_content_end.saturating_sub(compare_height);
        
        // 在当前帧中搜索匹配位置
        let search_end = current_frame.height();
        let mut best_match: Option<(u32, f64)> = None;
        
        // 每4px搜索一次
        for search_y in (0..search_end).step_by(4) {
            let available = current_frame.height().saturating_sub(search_y);
            if available < compare_height {
                break;
            }
            
            let actual_compare = compare_height.min(available);
            let score = Self::compare_region_similarity(
                last_frame,
                current_frame,
                width,
                last_compare_start,
                search_y,
                actual_compare,
            );
            
            if let Some((_, best_score)) = best_match {
                if score < best_score {
                    best_match = Some((search_y, score));
                }
            } else {
                best_match = Some((search_y, score));
            }
        }
        
        if let Some((match_y, score)) = best_match {
            // 相似度阈值
            if score > 50.0 {
                return None;
            }
            
            // match_y是当前帧中匹配的位置
            // 如果滚动很小，可能 match_y + compare_height 会超过 content_end
            // 这种情况下，直接从匹配位置之后开始拼接
            let ideal_new_start = match_y + compare_height;
            let new_start = if ideal_new_start < current_content_end {
                ideal_new_start
            } else {
                // 滚动很小，从匹配位置稍后开始
                (match_y + compare_height / 2).min(current_content_end.saturating_sub(1))
            };
            
            if new_start >= current_content_end {
                // 没有新内容
                return None;
            }
            
            let new_height = current_content_end - new_start;
            
            if new_height < 3 {
                // 新内容太少
                return None;
            }
            
            // 检查重叠率
            let overlap_height = match_y.saturating_sub(current_top_padding);
            let overlap_ratio = overlap_height as f64 / current_content_height as f64;
            
            if overlap_ratio > 0.95 {
                return None;
            }
            
            Some(StitchResult {
                new_content_y: new_start,
                new_content_height: new_height,
            })
        } else {
            None
        }
    }
    
    /// 比较两个区域的相似度
    fn compare_region_similarity(
        img1: &RgbaImage,
        img2: &RgbaImage,
        width: u32,
        y1_start: u32,
        y2_start: u32,
        height: u32,
    ) -> f64 {
        let mut total_diff = 0.0;
        let mut count = 0;
        
        let step = 8; // 采样步长
        
        for row in (0..height).step_by(step) {
            let y1 = y1_start + row;
            let y2 = y2_start + row;
            
            if y1 >= img1.height() || y2 >= img2.height() {
                break;
            }
            
            for col in (0..width).step_by(step) {
                if col >= width {
                    break;
                }
                
                let p1 = img1.get_pixel(col, y1);
                let p2 = img2.get_pixel(col, y2);
                
                // RGB差异
                for i in 0..3 {
                    let diff = (p1[i] as i32 - p2[i] as i32).abs();
                    total_diff += diff as f64;
                }
                count += 3;
            }
        }
        
        if count > 0 {
            total_diff / count as f64
        } else {
            255.0
        }
    }
    
    /// 提取区域
    pub fn extract_region(bgra_data: &[u8], width: u32, start_y: u32, height: u32) -> Vec<u8> {
        let start_offset = (start_y * width * 4) as usize;
        let length = (width * height * 4) as usize;
        
        if start_offset + length <= bgra_data.len() {
            bgra_data[start_offset..start_offset + length].to_vec()
        } else {
            Vec::new()
        }
    }
    
    pub fn bgra_to_rgba_image(bgra: &[u8], width: u32, height: u32) -> RgbaImage {
        let mut rgba = Vec::with_capacity(bgra.len());
        for chunk in bgra.chunks_exact(4) {
            rgba.push(chunk[2]); // R
            rgba.push(chunk[1]); // G
            rgba.push(chunk[0]); // B
            rgba.push(chunk[3]); // A
        }
        RgbaImage::from_raw(width, height, rgba).unwrap()
    }
}

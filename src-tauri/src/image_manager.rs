use base64::{engine::general_purpose as b64_engine, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use image::{ImageEncoder, codecs::png::PngEncoder};

// 图片存储配置
const IMAGES_DIR: &str = "clipboard_images";
const MAX_IMAGE_DATA_COUNT: i64 = 50;

pub struct ImageManager {
    images_dir: PathBuf,
}

impl ImageManager {
    pub fn new() -> Result<Self, String> {
        let app_data_dir = get_app_data_dir()?;
        let images_dir = app_data_dir.join(IMAGES_DIR);

        fs::create_dir_all(&images_dir)
            .map_err(|e| format!("创建图片目录失败: {}", e))?;

        // 清理废弃的缩略图目录
        let thumbnails_dir = images_dir.join("thumbnails");
        if thumbnails_dir.exists() {
            if let Err(e) = fs::remove_dir_all(&thumbnails_dir) {
                println!("清理废弃的缩略图目录失败: {}", e);
            } else {
                println!("已清理废弃的缩略图目录");
            }
        }

        Ok(ImageManager { 
            images_dir,
        })
    }

    /// 从Windows剪贴板原始数据保存图片
    pub fn save_image_from_raw_data(&self, width: u32, height: u32, dib_data: Vec<u8>, png_data: Vec<u8>) -> Result<String, String> {
        let image_id = self.calculate_image_id(&png_data);
        let png_path = self.images_dir.join(format!("{}.png", image_id));

        if png_path.exists() {
            return Ok(image_id);
        }

        fs::write(&png_path, &png_data)
            .map_err(|e| format!("写入PNG文件失败: {}", e))?;

        save_image_data(image_id.clone(), width, height, dib_data, png_data);

        Ok(image_id)
    }

    /// 从RGBA数据保存图片
    pub fn save_image_from_rgba_sync(&self, width: usize, height: usize, rgba_data: &[u8]) -> Result<String, String> {
        let image_id = self.calculate_image_id(rgba_data);
        let png_path = self.images_dir.join(format!("{}.png", image_id));

        if png_path.exists() {
            return Ok(image_id);
        }

        let mut png_bytes: Vec<u8> = Vec::new();
        {
            let encoder = PngEncoder::new_with_quality(
                &mut png_bytes,
                image::codecs::png::CompressionType::Default,
                image::codecs::png::FilterType::Sub,
            );

            encoder.write_image(
                rgba_data,
                width as u32,
                height as u32,
                image::ExtendedColorType::Rgba8,
            ).map_err(|e| format!("编码PNG数据失败: {}", e))?;
        }

        fs::write(&png_path, &png_bytes)
            .map_err(|e| format!("写入PNG文件失败: {}", e))?;

        let image_id_clone = image_id.clone();
        let rgba_data_clone = rgba_data.to_vec();
        let png_bytes_clone = png_bytes.clone();
        let width_u32 = width as u32;
        let height_u32 = height as u32;
        
        std::thread::spawn(move || {
            let bgra = rgba_to_bgra(&rgba_data_clone);
            save_image_data(image_id_clone, width_u32, height_u32, bgra, png_bytes_clone);
        });

        Ok(image_id)
    }

    /// 从data URL保存图片
    pub fn save_image(&self, data_url: &str) -> Result<String, String> {
        let image_data = self.parse_data_url(data_url)?;
        let image_id = self.calculate_image_id(&image_data);
        let file_path = self.images_dir.join(format!("{}.png", image_id));

        if file_path.exists() {
            return Ok(image_id);
        }

        let img = image::load_from_memory(&image_data)
            .map_err(|e| format!("解析图片失败: {}", e))?;
        
        img.save_with_format(&file_path, image::ImageFormat::Png)
            .map_err(|e| format!("保存图片失败: {}", e))?;

        let rgba_img = img.to_rgba8();
        let (width, height) = rgba_img.dimensions();
        let rgba_data = rgba_img.into_raw();
        let png_data = image_data.clone();
        let image_id_clone = image_id.clone();
        
        std::thread::spawn(move || {
            let bgra = rgba_to_bgra(&rgba_data);
            save_image_data(image_id_clone, width, height, bgra, png_data);
        });

        Ok(image_id)
    }

    fn calculate_image_id(&self, data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        let hash = format!("{:x}", hasher.finalize());
        hash[..16].to_string()
    }

    /// 获取图片文件路径
    pub fn get_image_file_path(&self, image_id: &str) -> Result<String, String> {
        let file_path = self.images_dir.join(format!("{}.png", image_id));
        if !file_path.exists() {
            return Err(format!("图片文件不存在: {}", image_id));
        }
        Ok(file_path.to_string_lossy().to_string())
    }

    /// 获取图片data URL（用于粘贴）
    pub fn get_image_data_url(&self, image_id: &str) -> Result<String, String> {
        let file_path = self.images_dir.join(format!("{}.png", image_id));
        if !file_path.exists() {
            return Err(format!("图片文件不存在: {}", image_id));
        }

        let image_data = fs::read(&file_path)
            .map_err(|e| format!("读取图片文件失败: {}", e))?;
        let base64_string = b64_engine::STANDARD.encode(&image_data);
        Ok(format!("data:image/png;base64,{}", base64_string))
    }

    /// 获取BGRA数据和PNG字节（优先从数据库读取）
    pub fn get_image_bgra_and_png(&self, image_id: &str) -> Result<(Vec<u8>, Vec<u8>, u32, u32), String> {
        let db_result = crate::database::with_connection(|conn| {
            conn.query_row(
                "SELECT bgra_data, png_data, width, height FROM image_data WHERE image_id = ?1",
                rusqlite::params![image_id],
                |row| {
                    Ok((
                        row.get::<_, Vec<u8>>(0)?,
                        row.get::<_, Vec<u8>>(1)?,
                        row.get::<_, i64>(2)? as u32,
                        row.get::<_, i64>(3)? as u32,
                    ))
                }
            )
        });

        if let Ok((dib_data, png_bytes, width, height)) = db_result {
            if let Some(bgra) = extract_bgra_from_dib(&dib_data, width, height) {
                return Ok((bgra, png_bytes, width, height));
            } else {
                return Ok((dib_data, png_bytes, width, height));
            }
        }

        let file_path = self.images_dir.join(format!("{}.png", image_id));
        if !file_path.exists() {
            return Err(format!("图片文件不存在: {}", image_id));
        }

        let png_bytes = fs::read(&file_path)
            .map_err(|e| format!("读取图片文件失败: {}", e))?;

        let img = image::load_from_memory(&png_bytes)
            .map_err(|e| format!("解析PNG失败: {}", e))?
            .to_rgba8();
        
        let (width, height) = img.dimensions();
        let bgra = rgba_to_bgra(img.as_raw());

        save_image_data(image_id.to_string(), width, height, bgra.clone(), png_bytes.clone());

        Ok((bgra, png_bytes, width, height))
    }

    pub fn delete_image(&self, image_id: &str) -> Result<(), String> {
        let _ = crate::database::with_connection(|conn| {
            conn.execute(
                "DELETE FROM image_data WHERE image_id = ?1",
                rusqlite::params![image_id],
            )
        });
        
        let file_path = self.images_dir.join(format!("{}.png", image_id));
        if file_path.exists() {
            fs::remove_file(&file_path)
                .map_err(|e| format!("删除图片失败: {}", e))?;
        }
        Ok(())
    }

    pub fn cleanup_unused_images(&self, used_image_ids: &[String]) -> Result<(), String> {
        let entries = fs::read_dir(&self.images_dir)
            .map_err(|e| format!("读取图片目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();

            if path.is_file() && path.extension().map_or(false, |ext| ext == "png") {
                if let Some(file_stem) = path.file_stem() {
                    let image_id = file_stem.to_string_lossy().to_string();
                    if !used_image_ids.contains(&image_id) {
                        let _ = self.delete_image(&image_id);
                    }
                }
            }
        }

        let _ = crate::database::with_connection(|conn| {
            let mut stmt = conn.prepare("SELECT image_id FROM image_data")?;
            let stored_ids: Vec<String> = stmt
                .query_map([], |row| row.get(0))?
                .filter_map(Result::ok)
                .collect();

            for stored_id in stored_ids {
                if !used_image_ids.contains(&stored_id) {
                    let _ = conn.execute(
                        "DELETE FROM image_data WHERE image_id = ?1",
                        rusqlite::params![stored_id],
                    );
                }
            }

            Ok(())
        });

        Ok(())
    }

    fn parse_data_url(&self, data_url: &str) -> Result<Vec<u8>, String> {
        if !data_url.starts_with("data:image/") {
            return Err("不是有效的图片data URL".to_string());
        }
        let comma_pos = data_url.find(',')
            .ok_or_else(|| "无效的data URL格式".to_string())?;
        b64_engine::STANDARD.decode(&data_url[(comma_pos + 1)..])
            .map_err(|e| format!("Base64解码失败: {}", e))
    }
}

fn get_app_data_dir() -> Result<PathBuf, String> {
    crate::settings::get_data_directory()
}

use once_cell::sync::Lazy;
use std::sync::Mutex;

static IMAGE_MANAGER: Lazy<Result<Mutex<ImageManager>, String>> =
    Lazy::new(|| ImageManager::new().map(Mutex::new));

pub fn get_image_manager() -> Result<&'static Mutex<ImageManager>, String> {
    IMAGE_MANAGER.as_ref().map_err(|e| e.clone())
}

fn save_image_data(image_id: String, width: u32, height: u32, bgra_data: Vec<u8>, png_data: Vec<u8>) {
    std::thread::spawn(move || {
        let result = crate::database::with_connection(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO image_data (image_id, width, height, bgra_data, png_data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    &image_id,
                    width as i64,
                    height as i64,
                    &bgra_data,
                    &png_data,
                    chrono::Utc::now().timestamp_millis()
                ],
            )?;

            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM image_data",
                [],
                |row| row.get(0)
            )?;

            if count > MAX_IMAGE_DATA_COUNT {
                conn.execute(
                    "DELETE FROM image_data WHERE image_id IN (
                        SELECT image_id FROM image_data 
                        ORDER BY created_at ASC 
                        LIMIT ?1
                    )",
                    rusqlite::params![count - MAX_IMAGE_DATA_COUNT],
                )?;
            }

            Ok(())
        });

        if let Err(e) = result {
            eprintln!("保存图片数据失败: {}", e);
        }
    });
}

fn extract_bgra_from_dib(dib_data: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    const MAX_DIMENSION: u32 = 16384;
    const MAX_IMAGE_SIZE: usize = 100 * 1024 * 1024;

    if dib_data.len() < 40 || width == 0 || height == 0 || width > MAX_DIMENSION || height > MAX_DIMENSION {
        return None;
    }

    let header_size = u32::from_le_bytes([dib_data[0], dib_data[1], dib_data[2], dib_data[3]]) as usize;
    let bit_count = u16::from_le_bytes([dib_data[14], dib_data[15]]);
    
    if header_size < 40 || header_size > dib_data.len() || bit_count != 32 {
        return None;
    }

    let colors_used = u32::from_le_bytes([dib_data[32], dib_data[33], dib_data[34], dib_data[35]]) as usize;
    let color_table_size = if colors_used == 0 && bit_count <= 8 {
        (1 << bit_count) * 4
    } else {
        colors_used * 4
    };
    
    let pixel_offset = header_size.checked_add(color_table_size)?;
    
    if pixel_offset > dib_data.len() {
        return None;
    }

    let pixel_data = &dib_data[pixel_offset..];
    let bytes_per_pixel = 4;
    
    let row_size = ((width as usize).checked_mul(bytes_per_pixel)?.checked_add(3)? / 4).checked_mul(4)?;
    let expected_size = row_size.checked_mul(height as usize)?;
    
    if expected_size > MAX_IMAGE_SIZE || expected_size > pixel_data.len() {
        return None;
    }

    Some(pixel_data[..expected_size].to_vec())
}

fn rgba_to_bgra(rgba: &[u8]) -> Vec<u8> {
    use rayon::prelude::*;
    
    let mut bgra = vec![0u8; rgba.len()];

    bgra.par_chunks_mut(4)
        .enumerate()
        .for_each(|(i, bgra_chunk)| {
            let offset = i * 4;
            bgra_chunk[0] = rgba[offset + 2]; // B
            bgra_chunk[1] = rgba[offset + 1]; // G
            bgra_chunk[2] = rgba[offset];     // R
            bgra_chunk[3] = rgba[offset + 3]; // A
        });
    
    bgra
}

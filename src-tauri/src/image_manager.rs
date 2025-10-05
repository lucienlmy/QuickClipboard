use base64::{engine::general_purpose as b64_engine, Engine as _};
use image::{
    imageops::FilterType, GenericImageView,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{ PathBuf};
use uuid::Uuid;

// 图片存储配置
const IMAGES_DIR: &str = "clipboard_images";
const THUMBNAILS_DIR: &str = "thumbnails";
const THUMBNAIL_SIZE: u32 = 150; // 缩略图尺寸

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImageInfo {
    pub id: String,             // 图片唯一ID（基于内容hash）
    pub file_path: String,      // 原图文件路径
    pub thumbnail_path: String, // 缩略图路径
    pub width: u32,
    pub height: u32,
    pub file_size: u64,  // 文件大小（字节）
    pub created_at: u64, // 创建时间戳
}

pub struct ImageManager {
    images_dir: PathBuf,
    thumbnails_dir: PathBuf,
}

impl ImageManager {
    pub fn new() -> Result<Self, String> {
        let app_data_dir = get_app_data_dir()?;
        let images_dir = app_data_dir.join(IMAGES_DIR);
        let thumbnails_dir = images_dir.join(THUMBNAILS_DIR);

        // 创建目录
        fs::create_dir_all(&images_dir).map_err(|e| format!("创建图片目录失败: {}", e))?;
        fs::create_dir_all(&thumbnails_dir).map_err(|e| format!("创建缩略图目录失败: {}", e))?;

        Ok(ImageManager {
            images_dir,
            thumbnails_dir,
        })
    }

    /// 保存图片并返回图片信息
    pub fn save_image(&self, data_url: &str) -> Result<ImageInfo, String> {
        // 解析data URL
        let (image_data, format) = self.parse_data_url(data_url)?;

        // 计算内容hash作为唯一ID
        let mut hasher = Sha256::new();
        hasher.update(&image_data);
        let hash = format!("{:x}", hasher.finalize());
        let image_id = hash[..16].to_string(); // 使用前16位作为ID

        // 检查是否已存在
        let file_path = self.images_dir.join(format!("{}.png", image_id));
        let thumbnail_path = self.thumbnails_dir.join(format!("{}.png", image_id));

        if file_path.exists() && thumbnail_path.exists() {
            // 图片已存在，返回现有信息
            return self.get_image_info(&image_id);
        }

        // 加载图片
        let img =
            image::load_from_memory(&image_data).map_err(|e| format!("解析图片失败: {}", e))?;

        let (width, height) = img.dimensions();

        // 保存原图
        img.save_with_format(&file_path, image::ImageFormat::Png)
            .map_err(|e| format!("保存原图失败: {}", e))?;

        // 生成并保存缩略图
        let thumbnail = img.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, FilterType::Lanczos3);
        thumbnail
            .save_with_format(&thumbnail_path, image::ImageFormat::Png)
            .map_err(|e| format!("保存缩略图失败: {}", e))?;

        // 获取文件大小
        let file_size = fs::metadata(&file_path)
            .map_err(|e| format!("获取文件大小失败: {}", e))?
            .len();

        let image_info = ImageInfo {
            id: image_id,
            file_path: file_path.to_string_lossy().to_string(),
            thumbnail_path: thumbnail_path.to_string_lossy().to_string(),
            width,
            height,
            file_size,
            created_at: {
                let now = chrono::Local::now();
                (now.timestamp() + now.offset().local_minus_utc() as i64) as u64
            },
        };

        Ok(image_info)
    }

    /// 获取图片信息
    pub fn get_image_info(&self, image_id: &str) -> Result<ImageInfo, String> {
        let file_path = self.images_dir.join(format!("{}.png", image_id));
        let thumbnail_path = self.thumbnails_dir.join(format!("{}.png", image_id));

        if !file_path.exists() {
            return Err("图片文件不存在".to_string());
        }

        // 读取图片获取尺寸
        let img = image::open(&file_path).map_err(|e| format!("读取图片失败: {}", e))?;
        let (width, height) = img.dimensions();

        // 获取文件大小
        let file_size = fs::metadata(&file_path)
            .map_err(|e| format!("获取文件大小失败: {}", e))?
            .len();

        let created_at = fs::metadata(&file_path)
            .map_err(|e| format!("获取文件创建时间失败: {}", e))?
            .created()
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        Ok(ImageInfo {
            id: image_id.to_string(),
            file_path: file_path.to_string_lossy().to_string(),
            thumbnail_path: thumbnail_path.to_string_lossy().to_string(),
            width,
            height,
            file_size,
            created_at,
        })
    }

    /// 读取图片为data URL（带缓存）
    pub fn get_image_data_url(&self, image_id: &str) -> Result<String, String> {
        // 先检查缓存
        if let Ok(cache) = IMAGE_DATA_CACHE.lock() {
            if let Some(cached_data) = cache.get(image_id) {
                return Ok(cached_data.clone());
            }
        }

        let file_path = self.images_dir.join(format!("{}.png", image_id));

        if !file_path.exists() {
            return Err("图片文件不存在".to_string());
        }

        let image_data = fs::read(&file_path).map_err(|e| format!("读取图片文件失败: {}", e))?;

        let base64_string = b64_engine::STANDARD.encode(&image_data);
        let data_url = format!("data:image/png;base64,{}", base64_string);

        // 缓存数据URL（仅缓存较小的图片，避免内存占用过大）
        if image_data.len() < 5 * 1024 * 1024 {
            // 5MB以下的图片才缓存
            if let Ok(mut cache) = IMAGE_DATA_CACHE.lock() {
                cache.insert(image_id.to_string(), data_url.clone());

                // 限制缓存大小，避免内存泄漏
                if cache.len() > 50 {
                    // 移除最旧的缓存项（简单的LRU策略）
                    let keys_to_remove: Vec<String> = cache.keys().take(10).cloned().collect();
                    for key in keys_to_remove {
                        cache.remove(&key);
                    }
                }
            }
        }

        Ok(data_url)
    }

    /// 读取缩略图为data URL
    pub fn get_thumbnail_data_url(&self, image_id: &str) -> Result<String, String> {
        let thumbnail_path = self.thumbnails_dir.join(format!("{}.png", image_id));

        if !thumbnail_path.exists() {
            return Err("缩略图文件不存在".to_string());
        }

        let image_data =
            fs::read(&thumbnail_path).map_err(|e| format!("读取缩略图文件失败: {}", e))?;

        let base64_string = b64_engine::STANDARD.encode(&image_data);
        Ok(format!("data:image/png;base64,{}", base64_string))
    }

    /// 获取图片文件路径
    pub fn get_image_file_path(&self, image_id: &str) -> Result<String, String> {
        let file_path = self.images_dir.join(format!("{}.png", image_id));
        
        if !file_path.exists() {
            return Err("图片文件不存在".to_string());
        }
        
        Ok(file_path.to_string_lossy().to_string())
    }

    /// 复制图片，返回新的图片ID
    pub fn copy_image(&self, source_image_id: &str) -> Result<ImageInfo, String> {
        let source_file_path = self.images_dir.join(format!("{}.png", source_image_id));
        let source_thumbnail_path = self.thumbnails_dir.join(format!("{}.png", source_image_id));

        if !source_file_path.exists() {
            return Err("源图片文件不存在".to_string());
        }

        // 生成新的图片ID
        let new_image_id = Uuid::new_v4().to_string();
        let new_file_path = self.images_dir.join(format!("{}.png", new_image_id));
        let new_thumbnail_path = self.thumbnails_dir.join(format!("{}.png", new_image_id));

        // 复制原图
        fs::copy(&source_file_path, &new_file_path).map_err(|e| format!("复制原图失败: {}", e))?;

        // 复制缩略图（如果存在）
        if source_thumbnail_path.exists() {
            fs::copy(&source_thumbnail_path, &new_thumbnail_path)
                .map_err(|e| format!("复制缩略图失败: {}", e))?;
        }

        Ok(ImageInfo {
            id: new_image_id.clone(),
            file_path: new_file_path.to_string_lossy().to_string(),
            thumbnail_path: new_thumbnail_path.to_string_lossy().to_string(),
            width: 0, 
            height: 0,
            file_size: 0,
            created_at: {
                let now = chrono::Local::now();
                (now.timestamp() + now.offset().local_minus_utc() as i64) as u64
            },
        })
    }

    /// 删除图片
    pub fn delete_image(&self, image_id: &str) -> Result<(), String> {
        let file_path = self.images_dir.join(format!("{}.png", image_id));
        let thumbnail_path = self.thumbnails_dir.join(format!("{}.png", image_id));

        if file_path.exists() {
            fs::remove_file(&file_path).map_err(|e| format!("删除原图失败: {}", e))?;
        }

        if thumbnail_path.exists() {
            fs::remove_file(&thumbnail_path).map_err(|e| format!("删除缩略图失败: {}", e))?;
        }

        Ok(())
    }

    /// 清理未使用的图片
    pub fn cleanup_unused_images(&self, used_image_ids: &[String]) -> Result<(), String> {
        let entries =
            fs::read_dir(&self.images_dir).map_err(|e| format!("读取图片目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
            let path = entry.path();

            if path.is_file() && path.extension().map_or(false, |ext| ext == "png") {
                if let Some(file_stem) = path.file_stem() {
                    let image_id = file_stem.to_string_lossy().to_string();
                    if !used_image_ids.contains(&image_id) {
                        self.delete_image(&image_id)?;
                    }
                }
            }
        }

        Ok(())
    }

    /// 解析data URL
    fn parse_data_url(&self, data_url: &str) -> Result<(Vec<u8>, String), String> {
        if !data_url.starts_with("data:image/") {
            return Err("不是有效的图片data URL".to_string());
        }

        let comma_pos = data_url
            .find(',')
            .ok_or_else(|| "无效的data URL格式".to_string())?;

        let header = &data_url[..comma_pos];
        let encoded = &data_url[(comma_pos + 1)..];

        // 提取格式信息
        let format = if header.contains("image/png") {
            "png".to_string()
        } else if header.contains("image/jpeg") || header.contains("image/jpg") {
            "jpeg".to_string()
        } else if header.contains("image/gif") {
            "gif".to_string()
        } else if header.contains("image/webp") {
            "webp".to_string()
        } else {
            "png".to_string() // 默认为PNG
        };

        let image_data = b64_engine::STANDARD
            .decode(encoded)
            .map_err(|e| format!("Base64解码失败: {}", e))?;

        Ok((image_data, format))
    }
}

/// 获取应用数据目录
fn get_app_data_dir() -> Result<PathBuf, String> {
    crate::settings::get_data_directory()
}

use once_cell::sync::Lazy;
use std::collections::HashMap;
/// 全局图片管理器实例
use std::sync::Mutex;

// 图片数据缓存，用于提高大图片的加载速度
static IMAGE_DATA_CACHE: Lazy<Mutex<HashMap<String, String>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static IMAGE_MANAGER: Lazy<Result<Mutex<ImageManager>, String>> =
    Lazy::new(|| ImageManager::new().map(Mutex::new));

pub fn get_image_manager() -> Result<&'static Mutex<ImageManager>, String> {
    IMAGE_MANAGER.as_ref().map_err(|e| e.clone())
}

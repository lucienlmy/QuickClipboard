/// 统一处理HTML中的图片URL，将所有图片保存到本地并返回图片ID引用
/// 包括：网络图片、本地file://路径、Windows本地路径等
pub fn normalize_html_images(input: &str) -> String {
    use regex::Regex;

    // 处理双引号 src
    let mut html = if let Ok(re) = Regex::new(r#"(?is)(<img\b[^>]*?\bsrc\s*=\s*")([^"]+)(")"#) {
        re.replace_all(input, |caps: &regex::Captures| {
            let prefix = &caps[1];
            let src = &caps[2];
            let suffix = &caps[3];
            
            // 尝试将图片保存到本地并获取图片ID
            if let Some(image_id) = save_image_and_get_id(src) {
                // 使用特殊的 image-id: 前缀来标记这是一个图片ID引用
                format!("{}image-id:{}{}", prefix, image_id, suffix)
            } else {
                caps[0].to_string() // 保持原样
            }
        }).to_string()
    } else {
        input.to_string()
    };

    // 处理单引号 src
    if let Ok(re) = Regex::new(r#"(?is)(<img\b[^>]*?\bsrc\s*=\s*')([^']+)(')"#) {
        html = re.replace_all(&html, |caps: &regex::Captures| {
            let prefix = &caps[1];
            let src = &caps[2];
            let suffix = &caps[3];
            
            // 尝试将图片保存到本地并获取图片ID
            if let Some(image_id) = save_image_and_get_id(src) {
                // 使用特殊的 image-id: 前缀来标记这是一个图片ID引用
                format!("{}image-id:{}{}", prefix, image_id, suffix)
            } else {
                caps[0].to_string() // 保持原样
            }
        }).to_string();
    }

    html
}

/// 尝试将图片保存到本地并返回图片ID
/// 支持：网络图片、本地file://路径、Windows本地路径、data URL
fn save_image_and_get_id(src: &str) -> Option<String> {
    let s = src.trim();
    
    // 如果已经是 image-id: 格式，直接返回ID
    if s.starts_with("image-id:") {
        return Some(s.strip_prefix("image-id:").unwrap_or("").to_string());
    }
    
    // 获取图片管理器
    let image_manager = match crate::image_manager::get_image_manager() {
        Ok(manager) => manager,
        Err(_) => return None,
    };
    
    // 1. 如果是data URL，直接保存
    if s.starts_with("data:") {
        if let Ok(guard) = image_manager.lock() {
            if let Ok(image_id) = guard.save_image(s) {
                return Some(image_id);
            }
        }
        return None;
    }
    
    // 2. 尝试作为本地文件路径处理
    #[cfg(windows)]
    {
        if let Some(local_path) = convert_src_to_local_path_db(s) {
            if let Ok(data_url) = crate::services::file_operation_service::FileOperationService::read_image_file(local_path) {
                if let Ok(guard) = image_manager.lock() {
                    if let Ok(image_id) = guard.save_image(&data_url) {
                        return Some(image_id);
                    }
                }
            }
        }
    }
    
    // 3. 尝试作为网络图片处理
    if s.starts_with("http://") || s.starts_with("https://") {
        if let Ok(data_url) = download_image_sync(s) {
            if let Ok(guard) = image_manager.lock() {
                if let Ok(image_id) = guard.save_image(&data_url) {
                    return Some(image_id);
                }
            }
        }
    }
    
    None
}

/// 同步下载网络图片并转换为dataURL
fn download_image_sync(url: &str) -> Result<String, String> {
    use std::time::Duration;
    
    // 使用reqwest的阻塞客户端
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10)) // 10秒超时
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))?;

    let response = client
        .get(url)
        .send()
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP请求失败: {}", response.status()));
    }

    // 获取Content-Type
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|ct| ct.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    // 下载图片数据
    let image_data = response
        .bytes()
        .map_err(|e| format!("下载图片数据失败: {}", e))?;

    // 转换为base64
    use base64::{engine::general_purpose, Engine as _};
    let base64_data = general_purpose::STANDARD.encode(&image_data);
    let data_url = format!("data:{};base64,{}", content_type, base64_data);

    Ok(data_url)
}

/// 将 img 的 src 值转换为本地文件路径
#[cfg(windows)]
fn convert_src_to_local_path_db(src: &str) -> Option<String> {
    let s = src.trim();

    // 直接的盘符路径，例如 C:\path 或 C:/path
    if s.len() >= 3
        && s.as_bytes()[0].is_ascii_alphabetic()
        && s.as_bytes()[1] == b':'
        && (s.as_bytes()[2] == b'\\' || s.as_bytes()[2] == b'/')
    {
        return Some(s.replace('/', "\\"));
    }

    // UNC 路径 \\server\share\file
    if s.starts_with("\\\\") {
        return Some(s.to_string());
    }

    // file:// 开头
    let lower = s.to_ascii_lowercase();
    if lower.starts_with("file://") {
        // 去掉前缀 file:// 或 file:///
        let mut rest = s[7..].to_string();
        // 去掉多余的斜杠
        while rest.starts_with('/') || rest.starts_with('\\') {
            rest.remove(0);
        }

        // 解码百分号编码
        let decoded = match urlencoding::decode(&rest) {
            Ok(cow) => cow.into_owned(),
            Err(_) => rest,
        };

        // 情况1: 盘符路径 C:/ 或 C:\
        if decoded.len() >= 2 && decoded.as_bytes()[1] == b':' {
            return Some(decoded.replace('/', "\\"));
        }

        // 情况2: //server/share 或 server/share 视作UNC
        let mut path = decoded.replace('/', "\\");
        if !path.starts_with("\\\\") {
            path = format!("\\\\{}", path.trim_start_matches('\\'));
        }
        return Some(path);
    }

    None
}

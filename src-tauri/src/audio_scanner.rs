// 音频文件扫描模块
use std::fs;
use std::path::Path;
use lofty::probe::Probe;
use lofty::prelude::*;
use serde::{Serialize, Deserialize};
use base64::{Engine as _, engine::general_purpose};

// 音频扩展名
const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "ogg", "m4a", "flac", "aac", "wma", "opus"
];

/// 音频文件信息
#[derive(Debug, Serialize, Deserialize)]
pub struct AudioFileInfo {
    pub path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<u64>,
    pub cover_data: Option<String>, 
}

/// 扫描文件夹中的所有音频文件
#[tauri::command]
pub async fn scan_folder_for_audio(folder_path: String) -> Result<Vec<String>, String> {
    
    let path = Path::new(&folder_path);
    
    if !path.exists() {
        return Err(format!("文件夹不存在: {}", folder_path));
    }
    
    if !path.is_dir() {
        return Err(format!("路径不是文件夹: {}", folder_path));
    }
    
    let mut audio_files = Vec::new();

    if let Err(e) = scan_directory(&path, &mut audio_files, 0) {
        return Err(e.to_string());
    }
    
    Ok(audio_files)
}

/// 获取音频文件的元数据
#[tauri::command]
pub async fn get_audio_metadata(file_path: String) -> Result<AudioFileInfo, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    let mut info = AudioFileInfo {
        path: file_path.clone(),
        title: None,
        artist: None,
        album: None,
        duration: None,
        cover_data: None,
    };

    match Probe::open(&path).and_then(|probe| probe.read()) {
        Ok(tagged_file) => {

            let properties = tagged_file.properties();
            info.duration = Some(properties.duration().as_secs());

            if let Some(tag) = tagged_file.primary_tag() {
                info.title = tag.title().map(|s| s.to_string());
                info.artist = tag.artist().map(|s| s.to_string());
                info.album = tag.album().map(|s| s.to_string());

                if let Some(picture) = tag.pictures().first() {
                    let cover_base64 = general_purpose::STANDARD.encode(picture.data());
                    let mime = picture.mime_type()
                        .map(|m| m.as_str())
                        .unwrap_or("image/png");
                    info.cover_data = Some(format!("data:{};base64,{}", mime, cover_base64));
                }
            }
        }
        Err(_) => {

        }
    }
    
    Ok(info)
}

/// 递归扫描目录
fn scan_directory(dir: &Path, audio_files: &mut Vec<String>, depth: usize) -> std::io::Result<()> {
    if depth > 10 {
        return Ok(());
    }
    
    let entries = fs::read_dir(dir)?;
    
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_file() {

            if is_audio_file(&path) {
                if let Some(path_str) = path.to_str() {
                    audio_files.push(path_str.to_string());
                }
            }
        } else if path.is_dir() {

            let _ = scan_directory(&path, audio_files, depth + 1);
        }
    }
    
    Ok(())
}

/// 判断是否为音频文件
fn is_audio_file(path: &Path) -> bool {
    if let Some(extension) = path.extension() {
        if let Some(ext_str) = extension.to_str() {
            let ext_lower = ext_str.to_lowercase();
            return AUDIO_EXTENSIONS.contains(&ext_lower.as_str());
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    
    #[test]
    fn test_is_audio_file() {
        assert!(is_audio_file(&PathBuf::from("test.mp3")));
        assert!(is_audio_file(&PathBuf::from("test.flac")));
        assert!(is_audio_file(&PathBuf::from("test.MP3")));
        assert!(!is_audio_file(&PathBuf::from("test.txt")));
        assert!(!is_audio_file(&PathBuf::from("test.png")));
    }
}


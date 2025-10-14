/// 音效服务 - 处理音效播放和管理相关的业务逻辑
pub struct SoundService;

/// 内置音效文件列表
const BUILTIN_SOUNDS: &[(&str, &[u8])] = &[
    ("sounds/copy.mp3", include_bytes!("../../../sounds/copy.mp3")),
    ("sounds/paste.mp3", include_bytes!("../../../sounds/paste.mp3")),
    ("sounds/roll.mp3", include_bytes!("../../../sounds/roll.mp3")),
];

impl SoundService {
    /// 初始化内置音效文件到应用数据目录
    pub fn initialize_builtin_sounds() -> Result<(), String> {
        let app_data_dir = crate::data_manager::get_app_data_dir()
            .map_err(|e| format!("获取应用数据目录失败: {}", e))?;

        for (sound_path, sound_data) in BUILTIN_SOUNDS {
            let target_path = app_data_dir.join(sound_path);
            
            // 确保目录存在
            if let Some(parent_dir) = target_path.parent() {
                std::fs::create_dir_all(parent_dir)
                    .map_err(|e| format!("创建音效目录失败: {}", e))?;
            }
            
            // 直接覆盖内置音效文件，确保使用最新版本
            std::fs::write(&target_path, sound_data)
                .map_err(|e| format!("写入内置音效文件失败: {}", e))?;
            println!("已初始化内置音效文件: {}", target_path.display());
        }
        
        Ok(())
    }
    /// 测试音效播放
    pub async fn test_sound(sound_path: String, volume: f32, sound_type: Option<String>) -> Result<(), String> {
        let volume_normalized = volume / 100.0; // 将0-100转换为0.0-1.0

        // 在后台线程中播放音效，避免阻塞前端
        let sound_path_clone = sound_path.clone();
        let sound_type_clone = sound_type.clone();
        
        tokio::spawn(async move {
            // 处理空路径的情况，使用默认音效文件
            let actual_sound_path = if sound_path_clone.is_empty() {
                match sound_type_clone.as_deref() {
                    Some("copy") => "sounds/copy.mp3".to_string(),
                    Some("paste") => "sounds/paste.mp3".to_string(),
                    Some("preview-scroll") => "sounds/roll.mp3".to_string(),
                    _ => "sounds/copy.mp3".to_string(), // 默认使用复制音效
                }
            } else {
                sound_path_clone
            };

            // 统一使用应用数据目录作为音效文件的基础路径
            let effective_path = if std::path::Path::new(&actual_sound_path).is_absolute() && std::path::Path::new(&actual_sound_path).exists() {
                // 如果是绝对路径且文件存在，直接使用
                actual_sound_path
            } else {
                // 否则，统一在应用数据目录中查找
                match crate::data_manager::get_app_data_dir() {
                    Ok(app_data_dir) => {
                        let sound_file_path = app_data_dir.join(&actual_sound_path);
                        sound_file_path.to_string_lossy().to_string()
                    }
                    Err(_) => actual_sound_path,
                }
            };

            // 尝试播放指定的音效文件
            if let Err(e) = 
                crate::sound_manager::SoundManager::play_sound_sync(&effective_path, volume_normalized)
            {
                eprintln!("测试音效失败: {} (路径: {})", e, effective_path);
                // 如果文件播放失败，回退到代码生成的音效
                
                // 根据音效类型生成不同频率的提示音
                let frequency = match sound_type_clone.as_deref() {
                    Some("copy") => 800,   // 复制音效：中频
                    Some("paste") => 600,  // 粘贴音效：低频
                    _ => 1000,             // 默认：高频
                };
                
                if let Err(e2) = 
                    crate::sound_manager::SoundManager::play_beep(frequency as f32, 200, volume_normalized)
                {
                    eprintln!("测试默认音效也失败: {}", e2);
                }
            }
        });
        
        Ok(())
    }

    /// 播放粘贴音效
    pub fn play_paste_sound() -> Result<(), String> {
        crate::sound_manager::play_paste_sound();
        Ok(())
    }

    /// 播放滚动音效
    pub fn play_scroll_sound() -> Result<(), String> {
        crate::sound_manager::play_scroll_sound();
        Ok(())
    }

    /// 清理音效缓存
    pub fn clear_sound_cache() -> Result<(), String> {
        crate::sound_manager::clear_sound_cache()
    }

    /// 获取当前活跃音效播放数量
    pub fn get_active_sound_count() -> usize {
        0
    }

    /// 获取音效状态信息
    pub fn get_sound_status() -> Result<serde_json::Value, String> {
        Ok(serde_json::json!({
            "active_sounds": 0,
            "max_concurrent": "unlimited"
        }))
    }
}

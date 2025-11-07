use once_cell::sync::Lazy;
use parking_lot::Mutex;
use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::{BufReader, Cursor};
use std::path::Path;
use std::thread;

static BUILTIN_COPY_SOUND: &[u8] = include_bytes!("../../../../sounds/copy.mp3");
static BUILTIN_PASTE_SOUND: &[u8] = include_bytes!("../../../../sounds/paste.mp3");
static BUILTIN_SCROLL_SOUND: &[u8] = include_bytes!("../../../../sounds/roll.mp3");

// 全局音频流句柄
static AUDIO_HANDLE: Lazy<Mutex<Option<rodio::OutputStreamHandle>>> = 
    Lazy::new(|| {
        let (handle_tx, handle_rx) = std::sync::mpsc::channel();
        thread::spawn(move || {
            match OutputStream::try_default() {
                Ok((_stream, handle)) => {
                    let _ = handle_tx.send(Some(handle));
                    loop {
                        thread::park();
                    }
                }
                Err(_) => {
                    let _ = handle_tx.send(None);
                }
            }
        });
        
        Mutex::new(handle_rx.recv().unwrap_or(None))
    });

pub struct SoundPlayer;

impl SoundPlayer {
    pub fn play(path: impl AsRef<Path>, volume: f32) {
        let path = path.as_ref().to_path_buf();
        thread::spawn(move || {
            if let Err(e) = Self::play_sync(&path, volume) {
                eprintln!("播放音频失败: {}", e);
            }
        });
    }
    
    pub fn play_bytes(bytes: &'static [u8], volume: f32) {
        thread::spawn(move || {
            if let Err(e) = Self::play_bytes_sync(bytes, volume) {
                eprintln!("播放内置音频失败: {}", e);
            }
        });
    }
    
    fn play_sync(path: &Path, volume: f32) -> Result<(), String> {
        let handle = Self::get_stream_handle()?;
        let sink = Sink::try_new(&handle).map_err(|e| e.to_string())?;
        
        let file = File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
        let source = Decoder::new(BufReader::new(file)).map_err(|e| format!("解码失败: {}", e))?;
        
        sink.set_volume(volume);
        sink.append(source);
        sink.sleep_until_end();
        
        Ok(())
    }
    
    fn play_bytes_sync(bytes: &'static [u8], volume: f32) -> Result<(), String> {
        let handle = Self::get_stream_handle()?;
        let sink = Sink::try_new(&handle).map_err(|e| e.to_string())?;
        
        let cursor = Cursor::new(bytes);
        let source = Decoder::new(cursor).map_err(|e| format!("解码失败: {}", e))?;
        
        sink.set_volume(volume);
        sink.append(source);
        sink.sleep_until_end();
        
        Ok(())
    }
    
    pub fn play_beep(frequency: f32, duration_ms: u64, volume: f32) {
        thread::spawn(move || {
            if let Err(e) = Self::play_beep_sync(frequency, duration_ms, volume) {
                eprintln!("播放蜂鸣音失败: {}", e);
            }
        });
    }
    
    fn play_beep_sync(frequency: f32, duration_ms: u64, volume: f32) -> Result<(), String> {
        let handle = Self::get_stream_handle()?;
        let sink = Sink::try_new(&handle).map_err(|e| e.to_string())?;
        
        let sample_rate = 44100;
        let duration_samples = (sample_rate as f32 * duration_ms as f32 / 1000.0) as usize;
        
        let samples: Vec<f32> = (0..duration_samples)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                (2.0 * std::f32::consts::PI * frequency * t).sin()
            })
            .collect();
        
        let source = rodio::buffer::SamplesBuffer::new(1, sample_rate, samples);
        sink.set_volume(volume);
        sink.append(source);
        sink.sleep_until_end();
        
        Ok(())
    }
    
    fn get_stream_handle() -> Result<rodio::OutputStreamHandle, String> {
        let handle_guard = AUDIO_HANDLE.lock();
        handle_guard.as_ref()
            .ok_or_else(|| "音频流初始化失败".to_string())
            .cloned()
    }
}

pub struct AppSounds;

impl AppSounds {
    // 播放复制音效
    pub fn play_copy() {
        let settings = crate::get_settings();
        if !settings.sound_enabled {
            return;
        }
        
        let volume = (settings.sound_volume / 100.0) as f32;
        
        if !settings.copy_sound_path.is_empty() {
            let path = Self::resolve_path(&settings.copy_sound_path);
            if path.exists() {
                SoundPlayer::play(path, volume);
                return;
            }
        }
        
        SoundPlayer::play_bytes(BUILTIN_COPY_SOUND, volume);
    }
    
    // 播放粘贴音效
    pub fn play_paste() {
        let settings = crate::get_settings();
        if !settings.sound_enabled {
            return;
        }
        
        let volume = (settings.sound_volume / 100.0) as f32;
        
        if !settings.paste_sound_path.is_empty() {
            let path = Self::resolve_path(&settings.paste_sound_path);
            if path.exists() {
                SoundPlayer::play(path, volume);
                return;
            }
        }
        
        SoundPlayer::play_bytes(BUILTIN_PASTE_SOUND, volume);
    }
    
    // 播放滚动音效
    pub fn play_scroll() {
        let settings = crate::get_settings();
        if !settings.sound_enabled || !settings.quickpaste_scroll_sound {
            return;
        }
        
        let volume = (settings.sound_volume / 100.0) as f32;
        
        if !settings.quickpaste_scroll_sound_path.is_empty() {
            let path = Self::resolve_path(&settings.quickpaste_scroll_sound_path);
            if path.exists() {
                SoundPlayer::play(path, volume);
                return;
            }
        }
        
        SoundPlayer::play_bytes(BUILTIN_SCROLL_SOUND, volume);
    }
    
    fn resolve_path(path: &str) -> std::path::PathBuf {
        let p = Path::new(path);
        
        if p.is_absolute() {
            return p.to_path_buf();
        }
        
        if let Ok(data_dir) = crate::get_data_directory() {
            data_dir.join(path)
        } else {
            p.to_path_buf()
        }
    }
}


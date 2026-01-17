use once_cell::sync::Lazy;
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use std::fs::File;
use std::io::{BufReader, Cursor};
use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

static BUILTIN_COPY_SOUND: &[u8] = include_bytes!("../../../../sounds/copy.mp3");
static BUILTIN_PASTE_SOUND: &[u8] = include_bytes!("../../../../sounds/paste.mp3");
static BUILTIN_SCROLL_SOUND: &[u8] = include_bytes!("../../../../sounds/roll.mp3");

// 记录最后一次粘贴音效播放的时间戳
static LAST_PASTE_SOUND_TIME_MS: AtomicU64 = AtomicU64::new(0);

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis() as u64
}

pub fn mark_paste_operation() {
    LAST_PASTE_SOUND_TIME_MS.store(current_time_ms(), Ordering::Relaxed);
}

enum SoundCommand {
    PlayFile(PathBuf, f32),
    PlayBytes(&'static [u8], f32),
    PlayBeep(f32, u64, f32),
}

static SOUND_SENDER: Lazy<Sender<SoundCommand>> = Lazy::new(|| {
    let (tx, rx) = mpsc::channel::<SoundCommand>();

    thread::Builder::new()
        .name("audio-player".into())
        .spawn(move || audio_thread_loop(rx))
        .expect("Failed to spawn audio thread");

    tx
});

// 获取当前默认输出设备的名称
fn get_default_device_name() -> Option<String> {
    rodio::cpal::default_host()
        .default_output_device()
        .and_then(|d| d.name().ok())
}

struct AudioContext {
    _stream: OutputStream,
    handle: OutputStreamHandle,
    device_name: Option<String>,
}

impl AudioContext {
    fn try_new() -> Option<Self> {
        let (stream, handle) = OutputStream::try_default().ok()?;
        let device_name = get_default_device_name();
        Some(Self {
            _stream: stream,
            handle,
            device_name,
        })
    }

    fn device_changed(&self) -> bool {
        get_default_device_name() != self.device_name
    }

    fn play(&self, cmd: &SoundCommand) -> Result<(), String> {
        match cmd {
            SoundCommand::PlayFile(path, volume) => play_file(&self.handle, path, *volume),
            SoundCommand::PlayBytes(bytes, volume) => play_bytes(&self.handle, bytes, *volume),
            SoundCommand::PlayBeep(freq, dur, vol) => play_beep(&self.handle, *freq, *dur, *vol),
        }
    }
}

fn audio_thread_loop(rx: mpsc::Receiver<SoundCommand>) {
    let mut ctx = AudioContext::try_new();

    loop {
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(cmd) => {
                // 检查设备变化或上下文无效
                let need_reinit = ctx.as_ref().map_or(true, |c| c.device_changed());
                if need_reinit {
                    ctx = AudioContext::try_new();
                }

                // 尝试播放
                let result = ctx.as_ref().map_or(
                    Err("无音频设备".to_string()),
                    |c| c.play(&cmd),
                );

                // 播放失败时重建并重试
                if result.is_err() {
                    ctx = AudioContext::try_new();
                    if let Some(ref c) = ctx {
                        let _ = c.play(&cmd);
                    }
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                // 定期检查设备变化
                if ctx.as_ref().map_or(true, |c| c.device_changed()) {
                    ctx = AudioContext::try_new();
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn play_file(handle: &OutputStreamHandle, path: &PathBuf, volume: f32) -> Result<(), String> {
    let sink = Sink::try_new(handle).map_err(|e| e.to_string())?;
    let file = File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    let source = Decoder::new(BufReader::new(file)).map_err(|e| format!("解码失败: {}", e))?;

    sink.set_volume(volume);
    sink.append(source);
    sink.detach();
    Ok(())
}

fn play_bytes(handle: &OutputStreamHandle, bytes: &'static [u8], volume: f32) -> Result<(), String> {
    let sink = Sink::try_new(handle).map_err(|e| e.to_string())?;
    let source = Decoder::new(Cursor::new(bytes)).map_err(|e| format!("解码失败: {}", e))?;

    sink.set_volume(volume);
    sink.append(source);
    sink.detach();
    Ok(())
}

fn play_beep(handle: &OutputStreamHandle, frequency: f32, duration_ms: u64, volume: f32) -> Result<(), String> {
    let sink = Sink::try_new(handle).map_err(|e| e.to_string())?;

    let sample_rate = 44100u32;
    let duration_samples = ((sample_rate as f64 * duration_ms as f64) / 1000.0) as usize;
    let two_pi_freq = 2.0 * std::f32::consts::PI * frequency;
    let sample_rate_f = sample_rate as f32;

    let samples: Vec<f32> = (0..duration_samples)
        .map(|i| (two_pi_freq * i as f32 / sample_rate_f).sin())
        .collect();

    let source = rodio::buffer::SamplesBuffer::new(1, sample_rate, samples);
    sink.set_volume(volume);
    sink.append(source);
    sink.detach();
    Ok(())
}

#[inline]
fn send_command(cmd: SoundCommand) {
    let _ = SOUND_SENDER.send(cmd);
}

pub struct SoundPlayer;

impl SoundPlayer {
    #[inline]
    pub fn play(path: impl AsRef<std::path::Path>, volume: f32) {
        send_command(SoundCommand::PlayFile(path.as_ref().to_path_buf(), volume));
    }

    #[inline]
    pub fn play_bytes(bytes: &'static [u8], volume: f32) {
        send_command(SoundCommand::PlayBytes(bytes, volume));
    }

    #[inline]
    pub fn play_beep(frequency: f32, duration_ms: u64, volume: f32) {
        send_command(SoundCommand::PlayBeep(frequency, duration_ms, volume));
    }
}

pub struct AppSounds;

impl AppSounds {
    // 复制音效 - 成功时播放
    pub fn play_copy_on_success() {
        let settings = crate::get_settings();
        if settings.copy_sound_timing != "success" {
            return;
        }
        Self::do_play_copy(&settings);
    }

    // 复制音效 - 立即播放
    pub fn play_copy_immediate() {
        let settings = crate::get_settings();
        if settings.copy_sound_timing != "immediate" {
            return;
        }

        let last_paste_time = LAST_PASTE_SOUND_TIME_MS.load(Ordering::Relaxed);
        if last_paste_time > 0 {
            let current_time = current_time_ms();
            if current_time.saturating_sub(last_paste_time) < 300 {
                return;
            }
        }
        
        Self::do_play_copy(&settings);
    }

    fn do_play_copy(settings: &crate::services::AppSettings) {
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

    // 粘贴音效 - 成功时播放
    pub fn play_paste_on_success() {
        let settings = crate::get_settings();
        if settings.paste_sound_timing != "success" {
            return;
        }

        LAST_PASTE_SOUND_TIME_MS.store(current_time_ms(), Ordering::Relaxed);
        
        Self::do_play_paste(&settings);
    }

    // 粘贴音效 - 立即播放
    pub fn play_paste_immediate() {
        let settings = crate::get_settings();
        if settings.paste_sound_timing != "immediate" {
            return;
        }

        LAST_PASTE_SOUND_TIME_MS.store(current_time_ms(), Ordering::Relaxed);
        
        Self::do_play_paste(&settings);
    }

    fn do_play_paste(settings: &crate::services::AppSettings) {
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

    pub fn play_copy() {
        let settings = crate::get_settings();
        Self::do_play_copy(&settings);
    }

    pub fn play_paste() {
        let settings = crate::get_settings();
        Self::do_play_paste(&settings);
    }

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

    fn resolve_path(path: &str) -> PathBuf {
        let p = std::path::Path::new(path);

        if p.is_absolute() {
            return p.to_path_buf();
        }

        crate::get_data_directory()
            .map(|dir| dir.join(path))
            .unwrap_or_else(|_| p.to_path_buf())
    }
}

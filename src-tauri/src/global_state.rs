use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{RwLock, OnceLock as OnceCell};

// =================== 全局状态变量 ===================

// 修饰键状态
#[cfg(windows)]
pub static ALT_HELD: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub static CTRL_HELD: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub static SHIFT_HELD: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
pub static WIN_HELD: AtomicBool = AtomicBool::new(false);

// 功能开关
#[cfg(windows)]
pub static NUMBER_SHORTCUTS_ENABLED: AtomicBool = AtomicBool::new(true);

#[cfg(windows)]
pub static AI_TRANSLATION_CANCEL_ENABLED: AtomicBool = AtomicBool::new(false);

// 预览窗口快捷键状态
#[cfg(windows)]
pub static PREVIEW_SHORTCUT_HELD: AtomicBool = AtomicBool::new(false);

// 预览窗口是否被用户取消（用于防止松开快捷键时自动粘贴）
#[cfg(windows)]
pub static PREVIEW_CANCELLED_BY_USER: AtomicBool = AtomicBool::new(false);

// 快捷键录制状态（当设置页面正在录制快捷键时为true）
#[cfg(windows)]
pub static SHORTCUT_RECORDING: AtomicBool = AtomicBool::new(false);

// 预览窗口快捷键配置
#[cfg(windows)]
#[derive(Debug, Clone)]
pub struct PreviewShortcut {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub key_code: u32,
}

#[cfg(windows)]
impl Default for PreviewShortcut {
    fn default() -> Self {
        Self {
            ctrl: true,
            shift: false,
            alt: false,
            key_code: 0xC0, // ` 键的虚拟键码
        }
    }
}

#[cfg(windows)]
pub static PREVIEW_SHORTCUT_CONFIG: std::sync::Mutex<PreviewShortcut> =
    std::sync::Mutex::new(PreviewShortcut {
        ctrl: true,
        shift: false,
        alt: false,
        key_code: 0xC0, // ` 键的虚拟键码
    });

// 快捷键解析结构
#[cfg(windows)]
#[derive(Debug, Clone)]
pub struct ParsedShortcut {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub win: bool,
    pub key_code: u32,
}

// 解析快捷键字符串
#[cfg(windows)]
pub fn parse_shortcut(shortcut: &str) -> Option<ParsedShortcut> {
    let mut ctrl = false;
    let mut shift = false;
    let mut alt = false;
    let mut win = false;
    let mut key_code = 0u32;

    let parts: Vec<&str> = shortcut.split('+').map(|s| s.trim()).collect();

    for part in &parts {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" => ctrl = true,
            "shift" => shift = true,
            "alt" => alt = true,
            "win" | "windows" | "cmd" | "super" => win = true,
            key => {
                // 解析具体的按键
                key_code = match key.to_lowercase().as_str() {
                    "a" => 0x41,
                    "b" => 0x42,
                    "c" => 0x43,
                    "d" => 0x44,
                    "e" => 0x45,
                    "f" => 0x46,
                    "g" => 0x47,
                    "h" => 0x48,
                    "i" => 0x49,
                    "j" => 0x4A,
                    "k" => 0x4B,
                    "l" => 0x4C,
                    "m" => 0x4D,
                    "n" => 0x4E,
                    "o" => 0x4F,
                    "p" => 0x50,
                    "q" => 0x51,
                    "r" => 0x52,
                    "s" => 0x53,
                    "t" => 0x54,
                    "u" => 0x55,
                    "v" => 0x56,
                    "w" => 0x57,
                    "x" => 0x58,
                    "y" => 0x59,
                    "z" => 0x5A,
                    "0" => 0x30,
                    "1" => 0x31,
                    "2" => 0x32,
                    "3" => 0x33,
                    "4" => 0x34,
                    "5" => 0x35,
                    "6" => 0x36,
                    "7" => 0x37,
                    "8" => 0x38,
                    "9" => 0x39,
                    "f1" => 0x70,
                    "f2" => 0x71,
                    "f3" => 0x72,
                    "f4" => 0x73,
                    "f5" => 0x74,
                    "f6" => 0x75,
                    "f7" => 0x76,
                    "f8" => 0x77,
                    "f9" => 0x78,
                    "f10" => 0x79,
                    "f11" => 0x7A,
                    "f12" => 0x7B,
                    "space" => 0x20,
                    "enter" => 0x0D,
                    "tab" => 0x09,
                    "escape" | "esc" => 0x1B,
                    "backspace" => 0x08,
                    "delete" | "del" => 0x2E,
                    "insert" | "ins" => 0x2D,
                    "home" => 0x24,
                    "end" => 0x23,
                    "pageup" | "pgup" => 0x21,
                    "pagedown" | "pgdn" => 0x22,
                    "up" | "arrowup" => 0x26,
                    "down" | "arrowdown" => 0x28,
                    "left" | "arrowleft" => 0x25,
                    "right" | "arrowright" => 0x27,
                    "`" | "backtick" => 0xC0,
                    "-" | "minus" => 0xBD,
                    "=" | "equals" => 0xBB,
                    "[" => 0xDB,
                    "]" => 0xDD,
                    "\\" => 0xDC,
                    ";" => 0xBA,
                    "'" => 0xDE,
                    "," => 0xBC,
                    "." => 0xBE,
                    "/" => 0xBF,
                    _ => {
                        return None;
                    }
                };
            }
        }
    }

    if key_code == 0 {
        return None;
    }

    Some(ParsedShortcut {
        ctrl,
        shift,
        alt,
        win,
        key_code,
    })
}

// 解析预览窗口快捷键
#[cfg(windows)]
pub fn parse_preview_shortcut(shortcut: &str) -> Option<PreviewShortcut> {
    let parsed = parse_shortcut(shortcut)?;
    Some(PreviewShortcut {
        ctrl: parsed.ctrl,
        shift: parsed.shift,
        alt: parsed.alt,
        key_code: parsed.key_code,
    })
}

// 更新预览窗口快捷键配置
#[cfg(windows)]
pub fn update_preview_shortcut_config(shortcut: &str) {
    if let Some(config) = parse_preview_shortcut(shortcut) {
        if let Ok(mut preview_config) = PREVIEW_SHORTCUT_CONFIG.lock() {
            *preview_config = config.clone();
        }
    }
}

// 数字快捷键修饰键配置
static NUMBER_SHORTCUTS_MODIFIER: OnceCell<RwLock<String>> = OnceCell::new();

// 启用/禁用数字快捷键
#[cfg(windows)]
pub fn set_number_shortcuts_enabled(enabled: bool) {
    NUMBER_SHORTCUTS_ENABLED.store(enabled, Ordering::SeqCst);
}

// 更新数字快捷键修饰键配置
#[cfg(windows)]
pub fn update_number_shortcuts_modifier(modifier: &str) {
    let modifier_lock = NUMBER_SHORTCUTS_MODIFIER.get_or_init(|| RwLock::new("Ctrl".to_string()));
    if let Ok(mut modifier_config) = modifier_lock.write() {
        *modifier_config = modifier.to_string();
    }
}

// 获取当前数字快捷键修饰键配置
#[cfg(windows)]
pub fn get_number_shortcuts_modifier() -> String {
    let modifier_lock = NUMBER_SHORTCUTS_MODIFIER.get_or_init(|| RwLock::new("Ctrl".to_string()));
    if let Ok(modifier_config) = modifier_lock.read() {
        modifier_config.clone()
    } else {
        "Ctrl".to_string()
    }
}

// 检查数字快捷键是否启用
#[cfg(windows)]
pub fn is_number_shortcuts_enabled() -> bool {
    NUMBER_SHORTCUTS_ENABLED.load(Ordering::SeqCst)
}

// 启用/禁用AI翻译取消快捷键
#[cfg(windows)]
pub fn set_ai_translation_cancel_enabled(enabled: bool) {
    AI_TRANSLATION_CANCEL_ENABLED.store(enabled, Ordering::SeqCst);
}

// 检查AI翻译取消快捷键是否启用
#[cfg(windows)]
pub fn is_ai_translation_cancel_enabled() -> bool {
    AI_TRANSLATION_CANCEL_ENABLED.load(Ordering::SeqCst)
}

// 启用AI翻译取消快捷键监听
#[cfg(windows)]
pub fn enable_ai_translation_cancel() {
    AI_TRANSLATION_CANCEL_ENABLED.store(true, Ordering::SeqCst);
}

// 禁用AI翻译取消快捷键监听
#[cfg(windows)]
pub fn disable_ai_translation_cancel() {
    AI_TRANSLATION_CANCEL_ENABLED.store(false, Ordering::SeqCst);
}

// 非Windows平台的空实现
#[cfg(not(windows))]
pub fn parse_shortcut(_shortcut: &str) -> Option<ParsedShortcut> {
    None
}

#[cfg(not(windows))]
pub fn parse_preview_shortcut(_shortcut: &str) -> Option<PreviewShortcut> {
    None
}

#[cfg(not(windows))]
pub fn update_preview_shortcut_config(_shortcut: &str) {}

#[cfg(not(windows))]
pub fn set_number_shortcuts_enabled(_enabled: bool) {}

#[cfg(not(windows))]
pub fn is_number_shortcuts_enabled() -> bool {
    false
}

#[cfg(not(windows))]
pub fn update_number_shortcuts_modifier(_modifier: &str) {}

#[cfg(not(windows))]
pub fn get_number_shortcuts_modifier() -> String {
    "Ctrl".to_string()
}

#[cfg(not(windows))]
pub fn set_ai_translation_cancel_enabled(_enabled: bool) {}

#[cfg(not(windows))]
pub fn is_ai_translation_cancel_enabled() -> bool {
    false
}

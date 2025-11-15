import { invoke } from '@tauri-apps/api/core'

// 获取应用版本信息
export async function getAppVersion() {
  return await invoke('get_app_version')
}


// 检查是否为便携模式
export async function isPortableMode() {
  return await invoke('is_portable_mode')
}

// 启动内置截图功能
export async function startScreenshot() {
  return await invoke('start_builtin_screenshot')
}

// 检查 AI 翻译配置
export async function checkAiTranslationConfig() {
  return await invoke('check_ai_translation_config')
}

// 启用 AI 翻译取消快捷键
export async function enableAiTranslationCancelShortcut() {
  return await invoke('enable_ai_translation_cancel_shortcut')
}

// 禁用 AI 翻译取消快捷键
export async function disableAiTranslationCancelShortcut() {
  return await invoke('disable_ai_translation_cancel_shortcut')
}

// 复制文本
export async function copyTextToClipboard(text) {
  return await invoke('copy_text_to_clipboard', { text })
}

// 检查系统 Win+V 快捷键是否已禁用
export async function checkWinVHotkeyDisabled() {
  return await invoke('check_win_v_hotkey_disabled')
}

// 禁用系统 Win+V 快捷键并重启资源管理器
export async function disableWinVHotkeyAndRestart() {
  return await invoke('disable_win_v_hotkey_and_restart')
}

// 启用系统 Win+V 快捷键并重启资源管理器
export async function enableWinVHotkeyAndRestart() {
  return await invoke('enable_win_v_hotkey_and_restart')
}

export async function promptDisableWinVHotkeyIfNeeded() {
  return await invoke('prompt_disable_win_v_hotkey_if_needed')
}

export async function promptEnableWinVHotkey() {
  return await invoke('prompt_enable_win_v_hotkey')
}


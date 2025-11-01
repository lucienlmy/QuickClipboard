import { invoke } from '@tauri-apps/api/core'

// 获取应用版本信息
export async function getAppVersion() {
  return await invoke('get_app_version')
}

// 获取管理员状态
export async function getAdminStatus() {
  return await invoke('get_admin_status')
}

// 以管理员身份重启
export async function restartAsAdmin() {
  return await invoke('restart_as_admin')
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


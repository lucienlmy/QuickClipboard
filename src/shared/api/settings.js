import { invoke } from '@tauri-apps/api/core'

// 重新加载设置
export async function reloadSettings() {
  return await invoke('reload_settings')
}

// 保存设置
export async function saveSettings(settings) {
  return await invoke('save_settings', { settings })
}

// 设置边缘隐藏
export async function setEdgeHideEnabled(enabled) {
  return await invoke('set_edge_hide_enabled', { enabled })
}

// 获取所有窗口信息
export async function getAllWindowsInfo() {
  return await invoke('get_all_windows_info_cmd')
}

// 设置开机自启动
export async function setAutoStart(enabled) {
  return await invoke('set_auto_start', { enabled })
}

// 获取开机自启动状态
export async function getAutoStartStatus() {
  return await invoke('get_auto_start_status')
}

// 获取所有快捷键状态
export async function getShortcutStatuses() {
  return await invoke('get_shortcut_statuses')
}

// 获取单个快捷键状态
export async function getShortcutStatus(id) {
  return await invoke('get_shortcut_status', { id })
}

// 重新加载快捷键
export async function reloadHotkeys() {
  return await invoke('reload_hotkeys')
}

// 保存窗口位置
export async function saveWindowPosition(x, y) {
  return await invoke('save_window_position', { x, y })
}

// 保存窗口大小
export async function saveWindowSize(width, height) {
  return await invoke('save_window_size', { width, height })
}


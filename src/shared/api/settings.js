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


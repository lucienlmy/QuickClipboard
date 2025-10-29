// 导出所有 stores
export { clipboardStore, loadClipboardItems, saveClipboardItem } from './clipboardStore'
export { settingsStore, initSettings } from './settingsStore'

// 初始化所有 stores
export function initStores() {
  initSettings()
  // 其他初始化...
}


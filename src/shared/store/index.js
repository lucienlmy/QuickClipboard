// 导入
import { initSettings as initSettingsFunc } from './settingsStore'

// 导出所有 stores
export { 
  clipboardStore, 
  loadClipboardItems, 
  refreshClipboardHistory,
  deleteClipboardItem,
  clearClipboardHistory 
} from './clipboardStore'
export { settingsStore, initSettings } from './settingsStore'

// 初始化所有 stores
export function initStores() {
  initSettingsFunc()
  // 其他初始化...
}


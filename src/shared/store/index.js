// 导入
import { initSettings as initSettingsFunc } from './settingsStore'
import { initToolsStore as initToolsStoreFunc } from './toolsStore'

// 导出所有 stores
export { 
  clipboardStore, 
  loadClipboardItems, 
  refreshClipboardHistory,
  deleteClipboardItem,
  clearClipboardHistory 
} from './clipboardStore'
export { settingsStore, initSettings } from './settingsStore'
export {
  favoritesStore,
  loadFavorites,
  refreshFavorites,
  deleteFavorite,
  pasteFavorite
} from './favoritesStore'
export {
  groupsStore,
  loadGroups,
  addGroup,
  updateGroup,
  deleteGroup
} from './groupsStore'
export { toolsStore, initToolsStore } from './toolsStore'
export { toastStore, toast, TOAST_POSITIONS } from './toastStore'
export { navigationStore } from './navigationStore'

// 初始化所有 stores
export async function initStores() {
  await initSettingsFunc()
  initToolsStoreFunc()
}


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
export {
  favoritesStore,
  initFavorites,
  loadFavoritesRange,
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
export { toastStore, toast, TOAST_POSITIONS } from './toastStore'
export { navigationStore } from './navigationStore'
export { chatStore } from './chatStore'

// 初始化所有 stores
export async function initStores() {
  await initSettingsFunc()
}


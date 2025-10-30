import { listen } from '@tauri-apps/api/event'
import { clipboardStore, loadClipboardItems } from '@shared/store/clipboardStore'
import { loadFavorites } from '@shared/store/favoritesStore'

let unlisteners = []

// 设置剪贴板事件监听
export async function setupClipboardEventListener() {
  try {
    // 监听剪贴板新增项事件
    const unlisten1 = await listen('clipboard-item-added', (event) => {
      const { item } = event.payload
      clipboardStore.addItem(item, true)
    })
    unlisteners.push(unlisten1)

    // 监听剪贴板项移动事件
    const unlisten2 = await listen('clipboard-item-moved', (event) => {
      const { item } = event.payload
      clipboardStore.addItem(item, false)
    })
    unlisteners.push(unlisten2)

    // 监听全量刷新事件
    const unlisten3 = await listen('clipboard-changed', () => {
      loadClipboardItems()
    })
    unlisteners.push(unlisten3)

    // 监听收藏列表更新事件
    const unlisten4 = await listen('quick-texts-updated', () => {
      loadFavorites()
    })
    unlisteners.push(unlisten4)

  } catch (error) {
    console.error('设置事件监听失败:', error)
  }
}

// 清理所有事件监听器
export function cleanupEventListeners() {
  unlisteners.forEach(unlisten => {
    try {
      unlisten()
    } catch (error) {
      console.error('清理事件监听器失败:', error)
    }
  })
  unlisteners = []
}


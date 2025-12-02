import { listen } from '@tauri-apps/api/event'
import { refreshClipboardHistory } from '@shared/store/clipboardStore'
import { refreshFavorites } from '@shared/store/favoritesStore'

let unlisteners = []

// 设置剪贴板事件监听
export async function setupClipboardEventListener() {
  try {
    // 监听剪贴板更新事件
    const unlisten1 = await listen('clipboard-updated', () => {
      refreshClipboardHistory()
    })
    unlisteners.push(unlisten1)

    // 监听收藏列表更新事件
    const unlisten2 = await listen('quick-texts-updated', () => {
      refreshFavorites()
    })
    unlisteners.push(unlisten2)

    const unlisten3 = await listen('refreshQuickTexts', () => {
      refreshFavorites()
    })
    unlisteners.push(unlisten3)

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


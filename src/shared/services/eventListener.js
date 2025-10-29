import { listen } from '@tauri-apps/api/event'
import { clipboardStore, loadClipboardItems } from '@shared/store/clipboardStore'

let unlisteners = []

// 设置剪贴板事件监听
export async function setupClipboardEventListener() {
  try {
    // 监听剪贴板新增项事件
    const unlisten1 = await listen('clipboard-item-added', (event) => {
      const { item } = event.payload
      console.log('收到剪贴板新增项通知')
      clipboardStore.addItem(item, true)
    })
    unlisteners.push(unlisten1)

    // 监听剪贴板项移动事件
    const unlisten2 = await listen('clipboard-item-moved', (event) => {
      const { item } = event.payload
      console.log('收到剪贴板项移动通知')
      clipboardStore.addItem(item, false)
    })
    unlisteners.push(unlisten2)

    // 监听全量刷新事件
    const unlisten3 = await listen('clipboard-changed', () => {
      console.log('收到剪贴板全量刷新通知')
      loadClipboardItems()
    })
    unlisteners.push(unlisten3)

    console.log('剪贴板事件监听已设置')
  } catch (error) {
    console.error('设置剪贴板事件监听失败:', error)
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


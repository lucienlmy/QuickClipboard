import { proxy } from 'valtio'

// 剪贴板 Store
export const clipboardStore = proxy({
  items: [],
  filter: '',
  selectedIds: new Set(),
  loading: false,
  error: null,
  
  addItem(item) {
    this.items.unshift(item)
  },
  
  removeItem(id) {
    this.items = this.items.filter(item => item.id !== id)
  },
  
  setFilter(value) {
    this.filter = value
  },
  
  toggleSelect(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id)
    } else {
      this.selectedIds.add(id)
    }
  },
  
  clearSelection() {
    this.selectedIds.clear()
  },
  
  clearAll() {
    this.items = []
    this.selectedIds.clear()
  }
})

// 异步操作：加载剪贴板历史
export async function loadClipboardItems() {
  clipboardStore.loading = true
  clipboardStore.error = null
  
  try {
    // TODO: 调用 Tauri API
    // const items = await invoke('get_clipboard_history')
    // clipboardStore.items = items

    clipboardStore.items = [
      { id: 1, content: 'Hello World', type: 'text', timestamp: Date.now() },
      { id: 2, content: 'https://example.com', type: 'text', timestamp: Date.now() - 1000 },
    ]
  } catch (err) {
    clipboardStore.error = err.message
  } finally {
    clipboardStore.loading = false
  }
}

// 异步操作：保存剪贴板项
export async function saveClipboardItem(content) {
  try {
    // TODO: 调用 Tauri API
    // const item = await invoke('save_clipboard_item', { content })
    
    // 示例实现
    const item = {
      id: Date.now(),
      content,
      type: 'text',
      timestamp: Date.now()
    }
    
    clipboardStore.addItem(item)
    return item
  } catch (err) {
    clipboardStore.error = err.message
    throw err
  }
}


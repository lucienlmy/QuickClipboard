import { proxy } from 'valtio'
import { 
  getClipboardHistory, 
  deleteClipboardItem as apiDeleteItem,
  clearClipboardHistory as apiClearHistory,
  pasteClipboardItem as apiPasteClipboardItem
} from '@shared/api'

// 剪贴板 Store
export const clipboardStore = proxy({
  items: [],
  filter: '',
  selectedIds: new Set(),
  loading: false,
  error: null,
  
  addItem(item, isNew = true) {
    // 检查项是否已存在
    const existingIndex = this.items.findIndex(i => i.id === item.id)
    
    if (existingIndex !== -1) {
      // 如果已存在，移除旧项
      this.items.splice(existingIndex, 1)
    }
    
    // 无论新增还是移动，都添加到开头
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
  },
  
  updateOrder(fromIndex, toIndex) {
    const newItems = [...this.items]
    const [movedItem] = newItems.splice(fromIndex, 1)
    newItems.splice(toIndex, 0, movedItem)
    this.items = newItems
  }
})

// 异步操作：加载剪贴板历史
export async function loadClipboardItems() {
  clipboardStore.loading = true
  clipboardStore.error = null
  
  try {
    const items = await getClipboardHistory()
    clipboardStore.items = items
  } catch (err) {
    console.error('加载剪贴板历史失败:', err)
    clipboardStore.error = err.message || '加载失败'
  } finally {
    clipboardStore.loading = false
  }
}

// 刷新剪贴板历史
export async function refreshClipboardHistory() {
  return await loadClipboardItems()
}

// 删除剪贴板项
export async function deleteClipboardItem(id) {
  try {
    await apiDeleteItem(id)
    clipboardStore.removeItem(id)
    return true
  } catch (err) {
    console.error('删除剪贴板项失败:', err)
    throw err
  }
}

// 清空剪贴板历史
export async function clearClipboardHistory() {
  try {
    await apiClearHistory()
    clipboardStore.clearAll()
    return true
  } catch (err) {
    console.error('清空剪贴板历史失败:', err)
    throw err
  }
}

// 粘贴剪贴板项
export async function pasteClipboardItem(id) {
  try {
    await apiPasteClipboardItem(id)
    return true
  } catch (err) {
    console.error('粘贴剪贴板项失败:', err)
    throw err
  }
}


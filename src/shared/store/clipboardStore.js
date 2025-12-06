import { proxy } from 'valtio'
import { listen } from '@tauri-apps/api/event'
import { 
  getClipboardHistory, 
  getClipboardTotalCount,
  deleteClipboardItem as apiDeleteItem,
  clearClipboardHistory as apiClearHistory,
  pasteClipboardItem as apiPasteClipboardItem
} from '@shared/api'

listen('paste-count-updated', (event) => {
  const id = event.payload
  const newItems = new Map(clipboardStore.items)
  for (const [index, item] of newItems.entries()) {
    if (item && item.id === id) {
      newItems.set(index, { ...item, paste_count: (item.paste_count || 0) + 1 })
      break
    }
  }
  clipboardStore.items = newItems
})

const CACHE_WINDOW_SIZE = 150 
const CACHE_BUFFER = 75    

// 剪贴板 Store
export const clipboardStore = proxy({
  items: new Map(),
  totalCount: 0,
  filter: '',
  contentType: 'all',
  selectedIds: new Set(),
  loading: false,
  error: null,
  loadingRanges: new Set(),
  currentViewRange: { start: 0, end: 50 }, 
  
  // 设置指定范围的数据
  setItemsInRange(startIndex, items) {
    const newItems = new Map(this.items)
    items.forEach((item, offset) => {
      newItems.set(startIndex + offset, item)
    })
    this.items = newItems
  },
  
  updateViewRange(startIndex, endIndex) {
    this.currentViewRange = { start: startIndex, end: endIndex }
    this.trimCache()
  },
  
  trimCache() {
    if (this.items.size <= CACHE_WINDOW_SIZE) return
    
    const { start, end } = this.currentViewRange
    const center = Math.floor((start + end) / 2)
    const keepStart = Math.max(0, center - CACHE_BUFFER)
    const keepEnd = Math.min(this.totalCount - 1, center + CACHE_BUFFER)
    
    const newItems = new Map()
    for (const [index, item] of this.items) {
      if (index >= keepStart && index <= keepEnd) {
        newItems.set(index, item)
      }
    }
    
    if (newItems.size < this.items.size) {
      this.items = newItems
    }
  },

  getItem(index) {
    return this.items.get(index)
  },
  
  // 检查指定索引是否已加载
  hasItem(index) {
    return this.items.has(index)
  },

  addItem(item) {
    this.items = new Map()
  },
  
  // 删除项
  removeItem(id) {
    this.items = new Map()
  },
  
  setFilter(value) {
    this.filter = value
  },
  
  setContentType(value) {
    this.contentType = value
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
    this.items = new Map()
    this.selectedIds = new Set()
    this.totalCount = 0
    this.currentViewRange = { start: 0, end: 50 }
  },
  
  // 记录正在加载的范围
  addLoadingRange(start, end) {
    this.loadingRanges.add(`${start}-${end}`)
  },
  
  removeLoadingRange(start, end) {
    this.loadingRanges.delete(`${start}-${end}`)
  },
  
  isRangeLoading(start, end) {
    return this.loadingRanges.has(`${start}-${end}`)
  }
})

// 加载指定范围的数据
export async function loadClipboardRange(startIndex, endIndex) {
  // 避免重复加载
  if (clipboardStore.isRangeLoading(startIndex, endIndex)) {
    return
  }
  
  // 检查是否所有数据都已加载
  let allLoaded = true
  for (let i = startIndex; i <= endIndex; i++) {
    if (!clipboardStore.hasItem(i)) {
      allLoaded = false
      break
    }
  }
  
  if (allLoaded) {
    return
  }
  
  clipboardStore.addLoadingRange(startIndex, endIndex)
  
  try {
    const limit = endIndex - startIndex + 1
    const result = await getClipboardHistory({
      offset: startIndex,
      limit,
      contentType: clipboardStore.contentType !== 'all' ? clipboardStore.contentType : undefined,
      search: clipboardStore.filter || undefined
    })
    
    // 将数据按索引存储
    clipboardStore.setItemsInRange(startIndex, result.items)
    
    // 更新总数
    if (result.total_count !== undefined) {
      clipboardStore.totalCount = result.total_count
    }
  } catch (err) {
    console.error(`加载范围 ${startIndex}-${endIndex} 失败:`, err)
    clipboardStore.error = err.message || '加载失败'
  } finally {
    clipboardStore.removeLoadingRange(startIndex, endIndex)
  }
}

export async function loadClipboardItems() {
  return await refreshClipboardHistory()
}

// 初始化加载
export async function initClipboardItems() {
  clipboardStore.loading = true
  clipboardStore.error = null
  
  try {
    clipboardStore.items = new Map()
    
    if (clipboardStore.contentType !== 'all' || clipboardStore.filter) {
      const result = await getClipboardHistory({
        offset: 0,
        limit: 50,
        contentType: clipboardStore.contentType !== 'all' ? clipboardStore.contentType : undefined,
        search: clipboardStore.filter || undefined
      })
      
      clipboardStore.totalCount = result.total_count
      clipboardStore.setItemsInRange(0, result.items)
    } else {
      const totalCount = await getClipboardTotalCount()
      clipboardStore.totalCount = totalCount
      
      if (totalCount > 0) {
        const endIndex = Math.min(49, totalCount - 1)
        await loadClipboardRange(0, endIndex)
      }
    }
  } catch (err) {
    console.error('初始化剪贴板失败:', err)
    clipboardStore.error = err.message || '加载失败'
  } finally {
    clipboardStore.loading = false
  }
}

// 刷新剪贴板历史
export async function refreshClipboardHistory() {
  clipboardStore.items = new Map()
  return await initClipboardItems()
}

// 删除剪贴板项
export async function deleteClipboardItem(id) {
  try {
    await apiDeleteItem(id)
    clipboardStore.removeItem(id)
    await refreshClipboardHistory()
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


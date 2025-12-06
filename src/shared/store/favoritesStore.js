import { proxy } from 'valtio'
import { listen } from '@tauri-apps/api/event'
import { 
  getFavoritesHistory,
  getFavoritesTotalCount,
  deleteFavorite as apiDeleteFavorite,
  pasteFavorite as apiPasteFavorite
} from '@shared/api/favorites'

listen('favorite-paste-count-updated', (event) => {
  const id = event.payload
  const newItems = new Map(favoritesStore.items)
  for (const [index, item] of newItems.entries()) {
    if (item && item.id === id) {
      newItems.set(index, { ...item, paste_count: (item.paste_count || 0) + 1 })
      break
    }
  }
  favoritesStore.items = newItems
})

const CACHE_WINDOW_SIZE = 150  
const CACHE_BUFFER = 75     

// 收藏 Store
export const favoritesStore = proxy({
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
  
  // 获取指定索引的项
  getItem(index) {
    return this.items.get(index)
  },
  
  // 检查指定索引是否已加载
  hasItem(index) {
    return this.items.has(index)
  },
  
  // 添加新项到开头（新收藏内容）
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
  
  // 移除加载中的范围
  removeLoadingRange(start, end) {
    this.loadingRanges.delete(`${start}-${end}`)
  },
  
  // 检查范围是否正在加载
  isRangeLoading(start, end) {
    return this.loadingRanges.has(`${start}-${end}`)
  }
})

// 加载指定范围的数据
export async function loadFavoritesRange(startIndex, endIndex, groupName = null) {
  if (favoritesStore.isRangeLoading(startIndex, endIndex)) {
    return
  }
  
  // 检查是否所有数据都已加载
  let allLoaded = true
  for (let i = startIndex; i <= endIndex; i++) {
    if (!favoritesStore.hasItem(i)) {
      allLoaded = false
      break
    }
  }
  
  if (allLoaded) {
    return
  }
  
  favoritesStore.addLoadingRange(startIndex, endIndex)
  
  try {
    // 如果没有指定分组，从 groupsStore 获取当前分组
    if (!groupName) {
      const { groupsStore } = await import('./groupsStore')
      groupName = groupsStore.currentGroup
    }
    
    const limit = endIndex - startIndex + 1
    const result = await getFavoritesHistory({
      offset: startIndex,
      limit,
      groupName,
      contentType: favoritesStore.contentType !== 'all' ? favoritesStore.contentType : undefined,
      search: favoritesStore.filter || undefined
    })
    
    // 将数据按索引存储
    favoritesStore.setItemsInRange(startIndex, result.items)
    
    // 更新总数
    if (result.total_count !== undefined) {
      favoritesStore.totalCount = result.total_count
    }
  } catch (err) {
    console.error(`加载范围 ${startIndex}-${endIndex} 失败:`, err)
    favoritesStore.error = err.message || '加载失败'
  } finally {
    favoritesStore.removeLoadingRange(startIndex, endIndex)
  }
}

// 初始化加载
export async function initFavorites(groupName = null) {
  favoritesStore.loading = true
  favoritesStore.error = null
  
  try {
    // 如果没有指定分组，从 groupsStore 获取当前分组
    if (!groupName) {
      const { groupsStore } = await import('./groupsStore')
      groupName = groupsStore.currentGroup
    }
    
    favoritesStore.items = new Map()
    
    if (favoritesStore.contentType !== 'all' || favoritesStore.filter) {
      const result = await getFavoritesHistory({
        offset: 0,
        limit: 50,
        groupName,
        contentType: favoritesStore.contentType !== 'all' ? favoritesStore.contentType : undefined,
        search: favoritesStore.filter || undefined
      })
      
      favoritesStore.totalCount = result.total_count
      favoritesStore.setItemsInRange(0, result.items)
    } else {
      const totalCount = await getFavoritesTotalCount(groupName)
      favoritesStore.totalCount = totalCount
      
      if (totalCount > 0) {
        const endIndex = Math.min(49, totalCount - 1)
        await loadFavoritesRange(0, endIndex, groupName)
      }
    }
  } catch (err) {
    console.error('初始化收藏列表失败:', err)
    favoritesStore.error = err.message || '加载失败'
  } finally {
    favoritesStore.loading = false
  }
}

// 刷新收藏列表
export async function refreshFavorites(groupName = null) {
  favoritesStore.items = new Map()
  return await initFavorites(groupName)
}

// 删除收藏项
export async function deleteFavorite(id) {
  try {
    const { showConfirm } = await import('@shared/utils/dialog')
    const i18n = (await import('@shared/i18n')).default
    const confirmed = await showConfirm(
      i18n.t('favorites.confirmDelete'),
      i18n.t('favorites.confirmDeleteTitle')
    )
    if (!confirmed) return false

    await apiDeleteFavorite(id)
    // 清空数据，触发重新加载
    favoritesStore.removeItem(id)
    // 刷新数据
    await refreshFavorites()
    return true
  } catch (err) {
    console.error('删除收藏项失败:', err)
    throw err
  }
}

// 粘贴收藏项
export async function pasteFavorite(id) {
  try {
    await apiPasteFavorite(id)
    return true
  } catch (err) {
    console.error('粘贴收藏项失败:', err)
    throw err
  }
}


import { proxy } from 'valtio'
import { 
  getFavorites,
  getFavoritesByGroup,
  deleteFavorite as apiDeleteFavorite,
  pasteFavorite as apiPasteFavorite
} from '@shared/api/favorites'

// 收藏 Store
export const favoritesStore = proxy({
  items: [],
  filter: '',
  selectedIds: new Set(),
  loading: false,
  error: null,
  
  setFilter(value) {
    this.filter = value
  },
  
  removeItem(id) {
    this.items = this.items.filter(item => item.id !== id)
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

// 异步操作：加载收藏列表
export async function loadFavorites(groupName = null) {
  favoritesStore.loading = true
  favoritesStore.error = null
  
  try {
    // 如果没有指定分组，从 groupsStore 获取当前分组
    if (!groupName) {
      const { groupsStore } = await import('./groupsStore')
      groupName = groupsStore.currentGroup
    }
    
    let items
    if (groupName === '全部') {
      items = await getFavorites()
    } else {
      items = await getFavoritesByGroup(groupName)
    }
    
    favoritesStore.items = items
    console.log('收藏列表加载成功，共', items.length, '条，分组:', groupName)
  } catch (err) {
    console.error('加载收藏列表失败:', err)
    favoritesStore.error = err.message || '加载失败'
  } finally {
    favoritesStore.loading = false
  }
}

// 刷新收藏列表
export async function refreshFavorites() {
  return await loadFavorites()
}

// 删除收藏项
export async function deleteFavorite(id) {
  try {
    await apiDeleteFavorite(id)
    favoritesStore.removeItem(id)
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


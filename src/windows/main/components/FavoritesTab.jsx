import { useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { favoritesStore } from '@shared/store'
import SearchBar from './SearchBar'
import FavoritesList from './FavoritesList'

function FavoritesTab({ contentFilter }) {
  const snap = useSnapshot(favoritesStore)

  // 根据搜索和筛选条件过滤收藏项
  const filteredItems = useMemo(() => {
    let filtered = snap.items

    // 根据类型筛选
    if (contentFilter && contentFilter !== 'all') {
      filtered = filtered.filter(item => {
        const type = item.content_type || item.type
        return type === contentFilter
      })
    }

    // 根据搜索关键词筛选
    if (snap.filter.trim()) {
      const keyword = snap.filter.toLowerCase()
      filtered = filtered.filter(item => {
        const title = item.title?.toLowerCase() || ''
        const content = item.content?.toLowerCase() || ''
        return title.includes(keyword) || content.includes(keyword)
      })
    }

    return filtered
  }, [snap.items, snap.filter, contentFilter])

  return (
    <div className="h-full flex flex-col">
      <SearchBar 
        value={snap.filter} 
        onChange={(value) => favoritesStore.setFilter(value)}
        placeholder="搜索收藏内容..."
      />
      <FavoritesList items={filteredItems} />
    </div>
  )
}

export default FavoritesTab


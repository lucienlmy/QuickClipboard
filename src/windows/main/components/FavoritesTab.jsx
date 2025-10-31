import { useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { favoritesStore } from '@shared/store'
import FavoritesList from './FavoritesList'

function FavoritesTab({ contentFilter, searchQuery }) {
  const snap = useSnapshot(favoritesStore)

  // 根据搜索和筛选条件过滤收藏项
  const filteredItems = useMemo(() => {
    let filtered = snap.items

    // 根据类型筛选
    if (contentFilter && contentFilter !== 'all') {
      filtered = filtered.filter(item => {
        const type = item.content_type || item.type
        if (contentFilter === 'text') {
          return type === 'text' || type === 'rich_text'
        }
        return type === contentFilter
      })
    }

    // 根据搜索关键词筛选
    if (searchQuery && searchQuery.trim()) {
      const keyword = searchQuery.toLowerCase()
      filtered = filtered.filter(item => {
        const title = item.title?.toLowerCase() || ''
        const content = item.content?.toLowerCase() || ''
        return title.includes(keyword) || content.includes(keyword)
      })
    }

    return filtered
  }, [snap.items, searchQuery, contentFilter])

  return (
    <div className="h-full flex flex-col">
      <FavoritesList items={filteredItems} />
    </div>
  )
}

export default FavoritesTab


import { useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { favoritesStore } from '@shared/store'
import { navigationStore } from '@shared/store/navigationStore'
import FavoritesList from './FavoritesList'

const FavoritesTab = forwardRef(({ contentFilter, searchQuery }, ref) => {
  const snap = useSnapshot(favoritesStore)
  const listRef = useRef(null)

  useEffect(() => {
    navigationStore.resetNavigation()
  }, [searchQuery, contentFilter])

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
  
  // 暴露导航方法给父组件
  useImperativeHandle(ref, () => ({
    navigateUp: () => listRef.current?.navigateUp?.(),
    navigateDown: () => listRef.current?.navigateDown?.(),
    executeCurrentItem: () => listRef.current?.executeCurrentItem?.()
  }))

  return (
    <div className="h-full flex flex-col">
      <FavoritesList ref={listRef} items={filteredItems} />
    </div>
  )
})

FavoritesTab.displayName = 'FavoritesTab'

export default FavoritesTab


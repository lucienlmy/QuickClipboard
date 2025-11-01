import { useMemo, useRef, forwardRef, useImperativeHandle, useEffect, useState } from 'react'
import { useSnapshot } from 'valtio'
import { favoritesStore } from '@shared/store'
import { navigationStore } from '@shared/store/navigationStore'
import { groupsStore } from '@shared/store/groupsStore'
import FavoritesList from './FavoritesList'
import FloatingToolbar from './FloatingToolbar'

const FavoritesTab = forwardRef(({ contentFilter, searchQuery }, ref) => {
  const snap = useSnapshot(favoritesStore)
  const groupsSnap = useSnapshot(groupsStore)
  const listRef = useRef(null)
  const [isAtTop, setIsAtTop] = useState(true)

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
  
  // 处理滚动状态变化
  const handleScrollStateChange = ({ atTop }) => {
    setIsAtTop(atTop)
  }
  
  // 处理返回顶部
  const handleScrollToTop = () => {
    listRef.current?.scrollToTop?.()
  }
  
  // 处理添加收藏
  const handleAddFavorite = () => {
    console.log('添加收藏项')
  }
  
  // 判断是否显示添加收藏按钮
  const shouldShowAddFavorite = true

  return (
    <div className="h-full flex flex-col relative">
      <FavoritesList 
        ref={listRef} 
        items={filteredItems}
        onScrollStateChange={handleScrollStateChange}
      />
      
      {/* 悬浮工具栏 */}
      <FloatingToolbar 
        showScrollTop={!isAtTop && filteredItems.length > 0}
        showAddFavorite={shouldShowAddFavorite}
        onScrollTop={handleScrollToTop}
        onAddFavorite={handleAddFavorite}
      />
    </div>
  )
})

FavoritesTab.displayName = 'FavoritesTab'

export default FavoritesTab


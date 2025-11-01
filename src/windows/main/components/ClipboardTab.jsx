import { useRef, forwardRef, useImperativeHandle, useEffect, useState } from 'react'
import { useSnapshot } from 'valtio'
import { clipboardStore } from '@shared/store/clipboardStore'
import { navigationStore } from '@shared/store/navigationStore'
import ClipboardList from './ClipboardList'
import FloatingToolbar from './FloatingToolbar'

const ClipboardTab = forwardRef(({ contentFilter, searchQuery }, ref) => {
  const snap = useSnapshot(clipboardStore)
  const listRef = useRef(null)
  const [isAtTop, setIsAtTop] = useState(true)

  useEffect(() => {
    navigationStore.resetNavigation()
  }, [searchQuery, contentFilter])

  // 过滤逻辑
  const filteredItems = snap.items.filter(item => {
    // 搜索过滤
    if (searchQuery && !item.content?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    
    // 类型过滤
    const contentType = item.content_type || item.type || 'text'
    if (contentFilter !== 'all') {
      if (contentFilter === 'text') {
        if (contentType !== 'text' && contentType !== 'rich_text') {
          return false
        }
      } else if (contentType !== contentFilter) {
        return false
      }
    }
    
    return true
  })
  
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

  return (
    <div className="h-full flex flex-col relative">
      {/* 列表 */}
      <ClipboardList 
        ref={listRef} 
        items={filteredItems}
        onScrollStateChange={handleScrollStateChange}
      />
      
      {/* 悬浮工具栏 */}
      <FloatingToolbar 
        showScrollTop={!isAtTop && filteredItems.length > 0}
        showAddFavorite={false}
        onScrollTop={handleScrollToTop}
      />
    </div>
  )
})

ClipboardTab.displayName = 'ClipboardTab'

export default ClipboardTab


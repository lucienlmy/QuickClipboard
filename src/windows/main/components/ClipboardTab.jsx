import { useRef, forwardRef, useImperativeHandle, useEffect, useState } from 'react'
import { useSnapshot } from 'valtio'
import { clipboardStore, refreshClipboardHistory } from '@shared/store/clipboardStore'
import { navigationStore } from '@shared/store/navigationStore'
import ClipboardList from './ClipboardList'
import FloatingToolbar from './FloatingToolbar'

const ClipboardTab = forwardRef(({ contentFilter, searchQuery }, ref) => {
  const snap = useSnapshot(clipboardStore)
  const listRef = useRef(null)
  const [isAtTop, setIsAtTop] = useState(true)

  useEffect(() => {
    clipboardStore.setContentType(contentFilter)
    clipboardStore.setFilter(searchQuery)
    refreshClipboardHistory()
    navigationStore.resetNavigation()
  }, [searchQuery, contentFilter])
  
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
        onScrollStateChange={handleScrollStateChange}
      />
      
      {/* 悬浮工具栏 */}
      <FloatingToolbar 
        showScrollTop={!isAtTop && snap.totalCount > 0}
        showAddFavorite={false}
        onScrollTop={handleScrollToTop}
      />
    </div>
  )
})

ClipboardTab.displayName = 'ClipboardTab'

export default ClipboardTab


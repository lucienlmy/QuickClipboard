import { Virtuoso } from 'react-virtuoso'
import { useRef, useCallback } from 'react'
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar'
import ClipboardItem from './ClipboardItem'

function ClipboardList({ items }) {
  const scrollerRef = useRef(null)
  
  // 应用自定义滚动条
  useCustomScrollbar(scrollerRef)

  const scrollerRefCallback = useCallback((element) => {
    scrollerRef.current = element
  }, [])

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          暂无剪贴板记录
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden custom-scrollbar-container">
      <Virtuoso
        data={items}
        scrollerRef={scrollerRefCallback}
        itemContent={(index, item) => (
          <div className="px-2.5 pb-2 pt-1">
            <ClipboardItem 
              item={item} 
              index={index}
            />
          </div>
        )}
        style={{ height: '100%' }}
      />
    </div>
  )
}

export default ClipboardList


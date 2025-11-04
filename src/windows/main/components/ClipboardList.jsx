import { Virtuoso } from 'react-virtuoso'
import { useCallback, useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar'
import { useSortableList } from '@shared/hooks/useSortable'
import { useNavigation } from '@shared/hooks/useNavigation'
import { clipboardStore, loadClipboardRange, loadClipboardItems, pasteClipboardItem } from '@shared/store/clipboardStore'
import { navigationStore } from '@shared/store/navigationStore'
import { moveClipboardItem } from '@shared/api'
import ClipboardItem from './ClipboardItem'

const ClipboardList = forwardRef(({ onScrollStateChange }, ref) => {
  const [scrollerElement, setScrollerElement] = useState(null)
  const virtuosoRef = useRef(null)
  const snap = useSnapshot(navigationStore)
  const clipSnap = useSnapshot(clipboardStore)

  const itemsArray = useMemo(() => {
    const arr = []
    for (let i = 0; i < clipSnap.totalCount; i++) {
      arr.push(clipSnap.items.get(i) || null)
    }
    return arr
  }, [clipSnap.items, clipSnap.totalCount])
  
  // 应用自定义滚动条
  useCustomScrollbar(scrollerElement)

  const scrollerRefCallback = useCallback((element) => {
    if (element) {
      setScrollerElement(element)
    }
  }, [])
  
  // 为剪贴板项生成唯一 ID (使用时间戳+内容作为key)
  const itemsWithId = useMemo(() => {
    return itemsArray.map((item, index) => {
      if (!item) {
        return { _sortId: `placeholder-${index}`, _isPlaceholder: true }
      }
      return {
        ...item,
        _sortId: `${item.created_at}-${index}`
      }
    })
  }, [itemsArray])
  
  // 处理拖拽结束
  const handleDragEnd = async (oldIndex, newIndex) => {
    if (oldIndex === newIndex) return
    
    try {
      await moveClipboardItem(oldIndex, newIndex)
      
      clipboardStore.items = new Map()
      
    } catch (error) {
      console.error('移动剪贴板项失败:', error)
      clipboardStore.items = new Map()
    }
  }
  
  // 拖拽上下文
  const {
    DndContext,
    SortableContext,
    DragOverlay,
    sensors,
    handleDragStart,
    handleDragEnd: onDragEnd,
    handleDragCancel,
    activeId,
    activeItem,
    strategy,
    modifiers,
    collisionDetection,
  } = useSortableList({ items: itemsWithId, onDragEnd: handleDragEnd })
  
  // 获取 activeItem 的索引
  const activeIndex = activeItem 
    ? itemsWithId.findIndex(item => item._sortId === activeId || item.id === activeId)
    : -1
  
  // 导航功能
  const {
    currentSelectedIndex,
    navigateUp,
    navigateDown,
    executeCurrentItem,
    handleItemHover,
    handleScrollStart,
    handleScrollEnd
  } = useNavigation({
    items: itemsWithId,
    virtuosoRef,
    onExecuteItem: async (item, index) => {
      try {
        await pasteClipboardItem(item.id)
        console.log('粘贴成功:', item.id)
      } catch (error) {
        console.error('粘贴失败:', error)
      }
    },
    enabled: snap.activeTab === 'clipboard'
  })
  
  // 根据可见范围加载数据
  const handleRangeChanged = useCallback(async (range) => {
    const { startIndex, endIndex } = range
    
    // 检查范围内是否有未加载的数据
    let needsLoad = false
    let rangeStart = -1
    let rangeEnd = -1
    
    for (let i = startIndex; i <= endIndex && i < clipSnap.totalCount; i++) {
      if (!clipSnap.items.has(i)) {
        needsLoad = true
        if (rangeStart === -1) {
          rangeStart = i
        }
        rangeEnd = i
      }
    }
    
    // 如果有未加载的数据，加载这个范围
    if (needsLoad && rangeStart !== -1) {
      // 扩展范围以预加载更多数据（前后各20项）
      const expandedStart = Math.max(0, rangeStart - 20)
      const expandedEnd = Math.min(clipSnap.totalCount - 1, rangeEnd + 20)
      
      await loadClipboardRange(expandedStart, expandedEnd)
    }
  }, [clipSnap.totalCount, clipSnap.items])
  
  // 首次加载：确保有 totalCount 时加载首屏数据
  useEffect(() => {
    if (clipSnap.totalCount > 0 && clipSnap.items.size === 0) {
      // 加载首屏（前50项）
      loadClipboardRange(0, Math.min(49, clipSnap.totalCount - 1))
    }
  }, [clipSnap.totalCount, clipSnap.items.size])
  
  // 暴露导航方法给父组件
  useImperativeHandle(ref, () => ({
    navigateUp,
    navigateDown,
    executeCurrentItem,
    scrollToTop: () => {
      virtuosoRef.current?.scrollToIndex({
        index: 0,
        align: 'start',
        behavior: 'smooth'
      })
    }
  }))

  if (clipSnap.totalCount === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          暂无剪贴板记录
        </p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={handleDragCancel}
      modifiers={modifiers}
    >
      <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden custom-scrollbar-container transition-colors duration-500">
        <SortableContext items={itemsWithId.map(item => item._sortId)} strategy={strategy}>
          <Virtuoso
            ref={virtuosoRef}
            totalCount={clipSnap.totalCount || 0}
            scrollerRef={scrollerRefCallback}
            atTopStateChange={(atTop) => {
              onScrollStateChange?.({ atTop })
            }}
            rangeChanged={handleRangeChanged}
            increaseViewportBy={{ top: 200, bottom: 200 }}
            itemContent={(index) => {
              // 根据索引获取对应的项
              const item = itemsWithId[index]
              
              // 如果是占位符或数据还没加载，显示骨架屏
              if (!item || item._isPlaceholder) {
                return (
                  <div className="px-2.5 pb-2 pt-1">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 h-20 animate-pulse">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    </div>
                  </div>
                )
              }
              
              return (
                <div 
                  className="px-2.5 pb-2 pt-1 animate-slide-in-left-fast"
                  style={{
                    animationDelay: `${Math.min(index * 20, 150)}ms`,
                    animationFillMode: 'backwards'
                  }}
                >
                  <ClipboardItem 
                    item={item} 
                    index={index}
                    sortId={item._sortId}
                    isSelected={currentSelectedIndex === index}
                    onHover={() => handleItemHover(index)}
                  />
                </div>
              )
            }}
            isScrolling={(scrolling) => {
              if (scrolling) {
                handleScrollStart()
              } else {
                handleScrollEnd()
              }
            }}
            style={{ height: '100%' }}
          />
        </SortableContext>
      </div>
      
      <DragOverlay>
        {activeItem && activeIndex !== -1 ? (
          <div className="px-2.5 pb-2 pt-1">
            <ClipboardItem 
              item={activeItem} 
              index={activeIndex}
              sortId={activeItem._sortId}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
})

ClipboardList.displayName = 'ClipboardList'

export default ClipboardList


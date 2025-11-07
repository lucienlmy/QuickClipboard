import { Virtuoso } from 'react-virtuoso'
import { useCallback, useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar'
import { useSortableList } from '@shared/hooks/useSortable'
import { useNavigation } from '@shared/hooks/useNavigation'
import { favoritesStore, loadFavoritesRange, pasteFavorite } from '@shared/store/favoritesStore'
import { groupsStore } from '@shared/store/groupsStore'
import { navigationStore } from '@shared/store/navigationStore'
import { settingsStore } from '@shared/store/settingsStore'
import { moveFavoriteItem } from '@shared/api'
import FavoriteItem from './FavoriteItem'

const FavoritesList = forwardRef(({ onScrollStateChange }, ref) => {
  const [scrollerElement, setScrollerElement] = useState(null)
  const virtuosoRef = useRef(null)
  const snap = useSnapshot(navigationStore)
  const favSnap = useSnapshot(favoritesStore)
  const groupsSnap = useSnapshot(groupsStore)
  const settings = useSnapshot(settingsStore)

  const itemsArray = useMemo(() => {
    const arr = []
    for (let i = 0; i < favSnap.totalCount; i++) {
      arr.push(favSnap.items.get(i) || null)
    }
    return arr
  }, [favSnap.items, favSnap.totalCount])
  
  // 应用自定义滚动条
  useCustomScrollbar(scrollerElement)

  const scrollerRefCallback = useCallback((element) => {
    if (element) {
      setScrollerElement(element)
    }
  }, [])
  
  // 为收藏项生成唯一 ID
  const itemsWithId = useMemo(() => {
    return itemsArray.map((item, index) => {
      if (!item) {
        return { _sortId: `placeholder-${index}`, _isPlaceholder: true }
      }
      return {
        ...item,
        _sortId: `${item.id}`
      }
    })
  }, [itemsArray])
  
  // 处理拖拽结束
  const handleDragEnd = async (oldIndex, newIndex) => {
    if (oldIndex === newIndex) return
    
    try {
      await moveFavoriteItem(groupsSnap.currentGroup, oldIndex, newIndex)

      favoritesStore.items = new Map()

    } catch (error) {
      console.error('移动收藏项失败:', error)
      favoritesStore.items = new Map()
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
        await pasteFavorite(item.id)
      } catch (error) {
        console.error('粘贴收藏失败:', error)
      }
    },
    enabled: snap.activeTab === 'favorites'
  })
  
  // 根据可见范围加载数据
  const handleRangeChanged = useCallback(async (range) => {
    const { startIndex, endIndex } = range
    
    // 检查范围内是否有未加载的数据
    let needsLoad = false
    let rangeStart = -1
    let rangeEnd = -1
    
    for (let i = startIndex; i <= endIndex && i < favSnap.totalCount; i++) {
      if (!favSnap.items.has(i)) {
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
      const expandedEnd = Math.min(favSnap.totalCount - 1, rangeEnd + 20)
      
      await loadFavoritesRange(expandedStart, expandedEnd, groupsSnap.currentGroup)
    }
  }, [favSnap.totalCount, favSnap.items, groupsSnap.currentGroup])
  
  useEffect(() => {
    if (favSnap.totalCount > 0 && favSnap.items.size === 0) {
      loadFavoritesRange(0, Math.min(49, favSnap.totalCount - 1), groupsSnap.currentGroup)
    }
  }, [favSnap.totalCount, favSnap.items.size])
  
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

  if (favSnap.totalCount === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          暂无收藏内容
        </p>
      </div>
    )
  }

  // 获取默认项高度
  const getDefaultItemHeight = () => {
    switch (settings.rowHeight) {
      case 'auto': return 90
      case 'large': return 120
      case 'medium': return 90
      case 'small': return 50
      default: return 90
    }
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
            totalCount={favSnap.totalCount || 0}
            scrollerRef={scrollerRefCallback}
            atTopStateChange={(atTop) => {
              onScrollStateChange?.({ atTop })
            }}
            rangeChanged={handleRangeChanged}
            increaseViewportBy={{ top: 200, bottom: 200 }}
            defaultItemHeight={getDefaultItemHeight()}
            itemContent={(index) => {
              const item = itemsWithId[index]

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
              
              const getSkeletonHeight = () => {
                switch (settings.rowHeight) {
                  case 'auto': return 'min-h-12 h-20'
                  case 'small': return 'h-12'
                  case 'medium': return 'h-20'
                  case 'large': return 'h-32'
                  default: return 'h-20'
                }
              }

              const animationDelay = Math.min(index * 20, 100)
              const isAutoHeight = settings.rowHeight === 'auto'
              
              return (
                <div className="px-2.5 pb-2 pt-1 relative">
                  {/* 骨架层 */}
                  <div 
                    className={`${isAutoHeight ? 'absolute inset-0' : ''} rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 ${getSkeletonHeight()} animate-pulse`}
                    style={{
                      animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite, fadeOut 0.3s ease-out ${animationDelay + 200}ms forwards`
                    }}
                  >
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                  
                  {/* 内容层 */}
                  <div 
                    className={`${isAutoHeight ? 'relative' : 'absolute inset-0 px-2.5 pb-2 pt-1'} animate-slide-in-left-fast`}
                    style={{
                      animationDelay: `${animationDelay}ms`,
                      animationFillMode: 'backwards'
                    }}
                  >
                    <FavoriteItem 
                      item={item} 
                      index={index}
                      sortId={item._sortId}
                      isSelected={currentSelectedIndex === index}
                      onHover={() => handleItemHover(index)}
                    />
                  </div>
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
            <FavoriteItem 
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

FavoritesList.displayName = 'FavoritesList'

export default FavoritesList


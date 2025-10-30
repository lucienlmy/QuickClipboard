import { Virtuoso } from 'react-virtuoso'
import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar'
import { useSortableList } from '@shared/hooks/useSortable'
import { favoritesStore, loadFavorites } from '@shared/store/favoritesStore'
import FavoriteItem from './FavoriteItem'

function FavoritesList({ items }) {
  const [scrollerElement, setScrollerElement] = useState(null)
  
  // 应用自定义滚动条
  useCustomScrollbar(scrollerElement)

  const scrollerRefCallback = useCallback((element) => {
    if (element) {
      setScrollerElement(element)
    }
  }, [])
  
  // 处理拖拽结束
  const handleDragEnd = async (oldIndex, newIndex) => {
    if (oldIndex === newIndex) return
    
    // 立即更新本地状态（乐观更新）
    favoritesStore.updateOrder(oldIndex, newIndex)
    
    // 异步调用后端 API
    try {
      const item = items[oldIndex]
      await invoke('move_quick_text_item', {
        itemId: item.id,
        toIndex: newIndex
      })
    } catch (error) {
      console.error('移动收藏项失败:', error)
      // 失败后重新加载以恢复正确状态
      await loadFavorites()
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
  } = useSortableList({ items, onDragEnd: handleDragEnd })
  
  // 获取 activeItem 的索引
  const activeIndex = activeItem 
    ? items.findIndex(item => item.id === activeId)
    : -1

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          暂无收藏内容
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
      <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden custom-scrollbar-container">
        <SortableContext items={items.map(item => item.id)} strategy={strategy}>
          <Virtuoso
            data={items}
            scrollerRef={scrollerRefCallback}
            itemContent={(index, item) => (
              <div className="px-2.5 pb-2 pt-1">
                <FavoriteItem 
                  item={item} 
                  index={index}
                />
              </div>
            )}
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
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export default FavoritesList


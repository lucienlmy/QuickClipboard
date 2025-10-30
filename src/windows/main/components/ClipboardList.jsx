import { Virtuoso } from 'react-virtuoso'
import { useCallback, useState, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar'
import { useSortableList } from '@shared/hooks/useSortable'
import { clipboardStore, loadClipboardItems } from '@shared/store/clipboardStore'
import ClipboardItem from './ClipboardItem'

function ClipboardList({ items }) {
  const [scrollerElement, setScrollerElement] = useState(null)
  
  // 应用自定义滚动条
  useCustomScrollbar(scrollerElement)

  const scrollerRefCallback = useCallback((element) => {
    if (element) {
      setScrollerElement(element)
    }
  }, [])
  
  // 为剪贴板项生成唯一 ID (使用时间戳+内容作为key)
  const itemsWithId = useMemo(() => {
    return items.map((item, index) => ({
      ...item,
      _sortId: `${item.created_at}-${index}`
    }))
  }, [items])
  
  // 处理拖拽结束
  const handleDragEnd = async (oldIndex, newIndex) => {
    if (oldIndex === newIndex) return
    
    // 立即更新本地状态
    clipboardStore.updateOrder(oldIndex, newIndex)
    
    // 异步调用后端 API
    try {
      await invoke('move_clipboard_item', {
        fromIndex: oldIndex,
        toIndex: newIndex
      })
    } catch (error) {
      console.error('移动剪贴板项失败:', error)
      // 失败后重新加载以恢复正确状态
      await loadClipboardItems()
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
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={handleDragCancel}
      modifiers={modifiers}
    >
      <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden custom-scrollbar-container">
        <SortableContext items={itemsWithId.map(item => item._sortId)} strategy={strategy}>
          <Virtuoso
            data={itemsWithId}
            scrollerRef={scrollerRefCallback}
            itemContent={(index, item) => (
              <div className="px-2.5 pb-2 pt-1">
                <ClipboardItem 
                  item={item} 
                  index={index}
                  sortId={item._sortId}
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
}

export default ClipboardList


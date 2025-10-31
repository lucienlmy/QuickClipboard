import { Virtuoso } from 'react-virtuoso'
import { useCallback, useState, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { useSnapshot } from 'valtio'
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar'
import { useSortableList } from '@shared/hooks/useSortable'
import { useNavigation } from '@shared/hooks/useNavigation'
import { clipboardStore, loadClipboardItems, pasteClipboardItem } from '@shared/store/clipboardStore'
import { navigationStore } from '@shared/store/navigationStore'
import ClipboardItem from './ClipboardItem'

const ClipboardList = forwardRef(({ items }, ref) => {
  const [scrollerElement, setScrollerElement] = useState(null)
  const virtuosoRef = useRef(null)
  const snap = useSnapshot(navigationStore)
  
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
  
  // 暴露导航方法给父组件
  useImperativeHandle(ref, () => ({
    navigateUp,
    navigateDown,
    executeCurrentItem
  }))

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
            ref={virtuosoRef}
            data={itemsWithId}
            scrollerRef={scrollerRefCallback}
            itemContent={(index, item) => (
              <div className="px-2.5 pb-2 pt-1">
                <ClipboardItem 
                  item={item} 
                  index={index}
                  sortId={item._sortId}
                  isSelected={currentSelectedIndex === index}
                  onHover={() => handleItemHover(index)}
                />
              </div>
            )}
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


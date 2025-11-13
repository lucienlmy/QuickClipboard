import { Virtuoso } from 'react-virtuoso';
import { useCallback, useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import { useSortableList } from '@shared/hooks/useSortable';
import { useNavigation } from '@shared/hooks/useNavigation';
import { clipboardStore, loadClipboardRange, pasteClipboardItem } from '@shared/store/clipboardStore';
import { navigationStore } from '@shared/store/navigationStore';
import { settingsStore } from '@shared/store/settingsStore';
import { moveClipboardItem } from '@shared/api';
import { getToolState } from '@shared/services/toolActions';
import ClipboardItem from './ClipboardItem';
const ClipboardList = forwardRef(({
  onScrollStateChange
}, ref) => {
  const [scrollerElement, setScrollerElement] = useState(null);
  const virtuosoRef = useRef(null);
  const currentRangeRef = useRef({
    startIndex: 0,
    endIndex: 0
  });
  const snap = useSnapshot(navigationStore);
  const clipSnap = useSnapshot(clipboardStore);
  const settings = useSnapshot(settingsStore);
  const itemsArray = useMemo(() => {
    return Array.from({
      length: clipSnap.totalCount
    }, (_, i) => clipSnap.items.get(i) || null);
  }, [clipSnap.items, clipSnap.totalCount]);
  useCustomScrollbar(scrollerElement);
  const scrollerRefCallback = useCallback(element => element && setScrollerElement(element), []);
  const itemsWithId = useMemo(() => {
    return itemsArray.map((item, index) => {
      if (!item) {
        return {
          _sortId: `placeholder-${index}`,
          _isPlaceholder: true
        };
      }
      return {
        ...item,
        _sortId: `${item.created_at}-${index}`
      };
    });
  }, [itemsArray]);
  const handleDragEnd = async (oldIndex, newIndex) => {
    if (oldIndex === newIndex) return;
    try {
      await moveClipboardItem(oldIndex, newIndex);
    } catch (error) {
      console.error('移动剪贴板项失败:', error);
    } finally {
      clipboardStore.items = new Map();
    }
  };
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
    collisionDetection
  } = useSortableList({
    items: itemsWithId,
    onDragEnd: handleDragEnd
  });
  const activeIndex = activeItem ? itemsWithId.findIndex(item => item._sortId === activeId || item.id === activeId) : -1;
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
        await pasteClipboardItem(item.id);
        // 粘贴后置顶
        const oneTimeEnabled = getToolState('one-time-paste-button');
        if (settings.pasteToTop && !oneTimeEnabled && typeof index === 'number' && index > 0) {
          try {
            await moveClipboardItem(index, 0);
          } finally {
            clipboardStore.items = new Map();
          }
        }
      } catch (error) {
        console.error('粘贴失败:', error);
      }
    },
    enabled: snap.activeTab === 'clipboard'
  });
  const handleRangeChanged = useCallback(async ({
    startIndex,
    endIndex
  }) => {
    currentRangeRef.current = {
      startIndex,
      endIndex
    };
    let rangeStart = -1,
      rangeEnd = -1;
    for (let i = startIndex; i <= endIndex && i < clipSnap.totalCount; i++) {
      if (!clipSnap.items.has(i)) {
        if (rangeStart === -1) rangeStart = i;
        rangeEnd = i;
      }
    }
    if (rangeStart !== -1) {
      await loadClipboardRange(Math.max(0, rangeStart - 20), Math.min(clipSnap.totalCount - 1, rangeEnd + 20));
    }
  }, [clipSnap.totalCount, clipSnap.items]);
  useEffect(() => {
    if (clipSnap.totalCount > 0 && clipSnap.items.size === 0) {
      const {
        startIndex,
        endIndex
      } = currentRangeRef.current;
      if (startIndex >= 0 && endIndex >= startIndex && endIndex < clipSnap.totalCount) {
        loadClipboardRange(Math.max(0, startIndex - 20), Math.min(clipSnap.totalCount - 1, endIndex + 20));
      } else {
        loadClipboardRange(0, Math.min(49, clipSnap.totalCount - 1));
      }
    }
  }, [clipSnap.totalCount, clipSnap.items.size]);
  useImperativeHandle(ref, () => ({
    navigateUp,
    navigateDown,
    executeCurrentItem,
    scrollToTop: (behavior = 'smooth') => {
      virtuosoRef.current?.scrollToIndex({
        index: 0,
        align: 'start',
        behavior
      });
    }
  }));
  if (clipSnap.totalCount === 0) {
    return <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          暂无剪贴板记录
        </p>
      </div>;
  }
  const getDefaultItemHeight = () => ({
    auto: 90,
    large: 120,
    medium: 90,
    small: 50
  })[settings.rowHeight] ?? 90;
  return <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={onDragEnd} onDragCancel={handleDragCancel} modifiers={modifiers}>
      <div className="flex-1 bg-gray-50 dark:bg-gray-800 overflow-hidden custom-scrollbar-container transition-colors duration-500 clipboard-list">
        <SortableContext items={itemsWithId.map(item => item._sortId)} strategy={strategy}>
          <Virtuoso ref={virtuosoRef} totalCount={clipSnap.totalCount || 0} scrollerRef={scrollerRefCallback} atTopStateChange={atTop => {
          onScrollStateChange?.({
            atTop
          });
        }} rangeChanged={handleRangeChanged} increaseViewportBy={{
          top: 200,
          bottom: 200
        }} defaultItemHeight={getDefaultItemHeight()} itemContent={index => {
          const item = itemsWithId[index];
          if (!item || item._isPlaceholder) {
            return <div className="px-2.5 pb-2 pt-1">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 h-20 animate-pulse">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    </div>
                  </div>;
          }
          const skeletonHeight = {
            auto: 'min-h-12 h-20',
            small: 'h-12',
            medium: 'h-20',
            large: 'h-32'
          }[settings.rowHeight] ?? 'h-20';
          const animationDelay = Math.min(index * 20, 100);
          const isAutoHeight = settings.rowHeight === 'auto';
          return <div className="px-2.5 pb-2 pt-1 relative">
                  <div className={`${isAutoHeight ? 'absolute inset-0' : ''} rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 ${skeletonHeight} animate-pulse`} style={{
              animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite, fadeOut 0.3s ease-out ${animationDelay + 200}ms forwards`
            }}>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                  <div className={`${isAutoHeight ? 'relative' : 'absolute inset-0 px-2.5 pb-2 pt-1'} animate-slide-in-left-fast`} style={{
              animationDelay: `${animationDelay}ms`,
              animationFillMode: 'backwards'
            }}>
                    <ClipboardItem item={item} index={index} sortId={item._sortId} isSelected={currentSelectedIndex === index} onHover={() => handleItemHover(index)} />
                  </div>
                </div>;
        }} isScrolling={scrolling => scrolling ? handleScrollStart() : handleScrollEnd()} style={{
          height: '100%'
        }} />
        </SortableContext>
      </div>

      <DragOverlay>
        {activeItem && activeIndex !== -1 && <div className="px-2.5 pb-2 pt-1">
            <ClipboardItem item={activeItem} index={activeIndex} sortId={activeItem._sortId} />
          </div>}
      </DragOverlay>
    </DndContext>;
});
ClipboardList.displayName = 'ClipboardList';
export default ClipboardList;
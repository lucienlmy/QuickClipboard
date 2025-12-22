import { Virtuoso } from 'react-virtuoso';
import { useCallback, useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import { useSortableList } from '@shared/hooks/useSortable';
import { useNavigation } from '@shared/hooks/useNavigation';
import { ROW_HEIGHT_CONFIG } from '@shared/hooks/useItemCommon';
import { clipboardStore, loadClipboardRange, pasteClipboardItem } from '@shared/store/clipboardStore';
import { navigationStore } from '@shared/store/navigationStore';
import { settingsStore } from '@shared/store/settingsStore';
import { moveClipboardItemToTop, moveClipboardItemById } from '@shared/api';
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
  const showShortcut = !clipSnap.filter && clipSnap.contentType === 'all';
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
      item._sortId = `${item.created_at}-${index}`;
      return item;
    });
  }, [itemsArray]);

  const handleDragEnd = async (oldIndex, newIndex) => {
    if (oldIndex === newIndex) return;
    const fromItem = itemsWithId[oldIndex];
    const toItem = itemsWithId[newIndex];

    if (fromItem?.is_pinned !== toItem?.is_pinned) {
      return;
    }

    try {
      if (fromItem?.id && toItem?.id) {
        await moveClipboardItemById(fromItem.id, toItem.id);
      }
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

  useEffect(() => {
    if (!activeId || !scrollerElement) return;

    const handleWheel = (e) => {
      e.preventDefault();
      scrollerElement.scrollTop += e.deltaY;
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [activeId, scrollerElement]);

  useEffect(() => {
    if (!activeId) return;
    document.body.classList.add('dragging-cursor');
    return () => {
      document.body.classList.remove('dragging-cursor');
    };
  }, [activeId]);

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
        if (settings.pasteToTop && !oneTimeEnabled && item.id && !item.is_pinned) {
          try {
            await moveClipboardItemToTop(item.id);
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

    clipboardStore.updateViewRange(startIndex, endIndex);

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
    executePlainTextPaste: async () => {
      const item = itemsWithId[currentSelectedIndex];
      if (item && !item._isPlaceholder) {
        try {
          const { pasteClipboardItem } = await import('@shared/api/clipboard');
          await pasteClipboardItem(item.id, 'plain');
          const oneTimeEnabled = getToolState('one-time-paste-button');
          if (settings.pasteToTop && !oneTimeEnabled && item.id && !item.is_pinned) {
            try {
              await moveClipboardItemToTop(item.id);
            } finally {
              clipboardStore.items = new Map();
            }
          }
        } catch (error) {
          console.error('纯文本粘贴失败:', error);
        }
      }
    },
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
  const rowConfig = ROW_HEIGHT_CONFIG[settings.rowHeight] || ROW_HEIGHT_CONFIG.medium;
  const isCardStyle = settings.listStyle === 'card';
  const defaultHeight = isCardStyle ? rowConfig.cardPx : rowConfig.px;
  const heightClass = isCardStyle ? rowConfig.cardClass : rowConfig.class;
  
  return <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={onDragEnd} onDragCancel={handleDragCancel} modifiers={modifiers}>
      <div className="flex-1 bg-gray-50 dark:bg-gray-800 overflow-hidden custom-scrollbar-container transition-colors duration-500 clipboard-list" data-no-drag>
        <SortableContext items={itemsWithId.map(item => item._sortId)} strategy={strategy}>
          <Virtuoso ref={virtuosoRef} totalCount={clipSnap.totalCount || 0} scrollerRef={scrollerRefCallback} atTopStateChange={atTop => {
          onScrollStateChange?.({
            atTop
          });
        }} rangeChanged={handleRangeChanged} increaseViewportBy={{
          top: 400,
          bottom: 400
        }} defaultItemHeight={defaultHeight} computeItemKey={index => {
          const item = itemsWithId[index];
          return item?.id || item?._sortId || `item-${index}`;
        }} itemContent={index => {
          const item = itemsWithId[index];
          if (!item || item._isPlaceholder) {
            return <div className={`${heightClass} ${isCardStyle ? 'px-2.5 pb-2 pt-1' : ''}`}>
                    <div className={`h-full ${isCardStyle ? 'rounded-lg border' : 'border-b'} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 animate-pulse`}>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    </div>
                  </div>;
          }
          
          const dragActive = Boolean(activeId);
          return <div className={`${heightClass} ${isCardStyle ? 'px-2.5 pb-2 pt-1' : ''}`}>
                    <ClipboardItem item={item} index={index} sortId={item._sortId} isSelected={currentSelectedIndex === index} onHover={() => handleItemHover(index)} isDragActive={dragActive} showShortcut={showShortcut} />
                  </div>;
        }} isScrolling={scrolling => scrolling ? handleScrollStart() : handleScrollEnd()} style={{
          height: '100%'
        }} />
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem && activeIndex !== -1 && (() => {
          const overlayClass = settings.rowHeight === 'auto' ? 'h-auto max-h-[350px]' : heightClass;
          return <div className={`${overlayClass} ${isCardStyle ? 'px-2.5 pb-2 pt-1' : ''}`}>
            <ClipboardItem item={activeItem} index={activeIndex} sortId={activeItem._sortId} isDragActive={true} showShortcut={showShortcut} />
          </div>;
        })()}
      </DragOverlay>
    </DndContext>;
});
ClipboardList.displayName = 'ClipboardList';
export default ClipboardList;
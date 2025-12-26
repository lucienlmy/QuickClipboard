import { Virtuoso } from 'react-virtuoso';
import { useCallback, useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import { useSortableList } from '@shared/hooks/useSortable';
import { useNavigation } from '@shared/hooks/useNavigation';
import { ROW_HEIGHT_CONFIG } from '@shared/hooks/useItemCommon';
import { favoritesStore, loadFavoritesRange, pasteFavorite } from '@shared/store/favoritesStore';
import { groupsStore } from '@shared/store/groupsStore';
import { navigationStore } from '@shared/store/navigationStore';
import { settingsStore } from '@shared/store/settingsStore';
import { moveFavoriteItemById } from '@shared/api';
import FavoriteItem from './FavoriteItem';

const SCROLL_DEBOUNCE_DELAY = 50;

const FavoritesList = forwardRef(({
  onScrollStateChange
}, ref) => {
  const [scrollerElement, setScrollerElement] = useState(null);
  const virtuosoRef = useRef(null);
  const currentRangeRef = useRef({
    startIndex: 0,
    endIndex: 0
  });
  const loadTimeoutRef = useRef(null);
  const lastLoadedRangeRef = useRef({ start: -1, end: -1 });
  const snap = useSnapshot(navigationStore);
  const favSnap = useSnapshot(favoritesStore);
  const groupsSnap = useSnapshot(groupsStore);
  const settings = useSnapshot(settingsStore);
  const itemsArray = useMemo(() => {
    return Array.from({
      length: favSnap.totalCount
    }, (_, i) => favSnap.items[i] || null);
  }, [favSnap.items, favSnap.totalCount]);
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
        _sortId: `${item.id}`
      };
    });
  }, [itemsArray]);

  const canDrag = groupsSnap.currentGroup !== '全部' && !favSnap.filter && favSnap.contentType === 'all';

  const handleDragEnd = async (oldIndex, newIndex) => {
    if (oldIndex === newIndex) return;
    
    const fromItem = itemsWithId[oldIndex];
    const toItem = itemsWithId[newIndex];
    
    if (!fromItem?.id || !toItem?.id) {
      console.error('无法移动：项目不存在或未加载');
      return;
    }
    
    try {
      await moveFavoriteItemById(groupsSnap.currentGroup, fromItem.id, toItem.id);
    } catch (error) {
      console.error('移动收藏项失败:', error);
    } finally {
      favoritesStore.items = {};
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
  const dragActive = Boolean(activeId);

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
        await pasteFavorite(item.id);
      } catch (error) {
        console.error('粘贴收藏失败:', error);
      }
    },
    enabled: snap.activeTab === 'favorites'
  });

  const handleRangeChanged = useCallback(({
    startIndex,
    endIndex
  }) => {
    currentRangeRef.current = {
      startIndex,
      endIndex
    };

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    loadTimeoutRef.current = setTimeout(() => {
      const lastRange = lastLoadedRangeRef.current;
      const bufferStart = Math.max(0, startIndex - 50);
      const bufferEnd = Math.min(favSnap.totalCount - 1, endIndex + 50);
      
      if (bufferStart >= lastRange.start && bufferEnd <= lastRange.end) {
        return;
      }

      favoritesStore.updateViewRange(startIndex, endIndex);

      let rangeStart = -1,
        rangeEnd = -1;
      for (let i = startIndex; i <= endIndex && i < favSnap.totalCount; i++) {
        if (!favoritesStore.hasItem(i)) {
          if (rangeStart === -1) rangeStart = i;
          rangeEnd = i;
        }
      }
      if (rangeStart !== -1) {
        const loadStart = Math.max(0, rangeStart - 50);
        const loadEnd = Math.min(favSnap.totalCount - 1, rangeEnd + 50);
        lastLoadedRangeRef.current = { start: loadStart, end: loadEnd };
        loadFavoritesRange(loadStart, loadEnd, groupsSnap.currentGroup);
      }
    }, SCROLL_DEBOUNCE_DELAY);
  }, [favSnap.totalCount, favSnap.items, groupsSnap.currentGroup]);

  const itemsCount = Object.keys(favSnap.items).length;
  
  useEffect(() => {
    if (favSnap.totalCount > 0 && itemsCount === 0) {
      lastLoadedRangeRef.current = { start: -1, end: -1 };
      
      const {
        startIndex,
        endIndex
      } = currentRangeRef.current;
      if (startIndex >= 0 && endIndex >= startIndex && endIndex < favSnap.totalCount) {
        loadFavoritesRange(Math.max(0, startIndex - 50), Math.min(favSnap.totalCount - 1, endIndex + 50), groupsSnap.currentGroup);
      } else {
        loadFavoritesRange(0, Math.min(49, favSnap.totalCount - 1), groupsSnap.currentGroup);
      }
    }
  }, [favSnap.totalCount, itemsCount, groupsSnap.currentGroup]);
  useImperativeHandle(ref, () => ({
    navigateUp,
    navigateDown,
    executeCurrentItem,
    executePlainTextPaste: async () => {
      const item = itemsWithId[currentSelectedIndex];
      if (item && !item._isPlaceholder) {
        try {
          const { pasteFavorite } = await import('@shared/api/favorites');
          await pasteFavorite(item.id, 'plain');
        } catch (error) {
          console.error('纯文本粘贴收藏失败:', error);
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
  if (favSnap.totalCount === 0) {
    return <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          暂无收藏内容
        </p>
      </div>;
  }
  const rowConfig = ROW_HEIGHT_CONFIG[settings.rowHeight] || ROW_HEIGHT_CONFIG.medium;
  const isCardStyle = settings.listStyle === 'card';
  const defaultHeight = isCardStyle ? rowConfig.cardPx : rowConfig.px;
  const heightClass = isCardStyle ? rowConfig.cardClass : rowConfig.class;
  
  return <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={onDragEnd} onDragCancel={handleDragCancel} modifiers={modifiers}>
      <div className="flex-1 bg-gray-50 dark:bg-gray-800 overflow-hidden custom-scrollbar-container transition-colors duration-500 favorites-list" data-no-drag>
        <SortableContext items={itemsWithId.map(item => item._sortId)} strategy={strategy}>
          <Virtuoso ref={virtuosoRef} totalCount={favSnap.totalCount || 0} scrollerRef={scrollerRefCallback} atTopStateChange={atTop => {
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
          const animationDelay = settings.uiAnimationEnabled !== false ? Math.min(index * 20, 100) : 0;
          return <div className={`${heightClass} ${isCardStyle ? 'px-2.5 pb-2 pt-1' : ''}`}>
                    <FavoriteItem item={item} index={index} sortId={item._sortId} isSelected={currentSelectedIndex === index} onHover={() => handleItemHover(index)} isDraggable={canDrag} isDragActive={dragActive} animationDelay={animationDelay} />
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
            <FavoriteItem item={activeItem} index={activeIndex} sortId={activeItem._sortId} isDragActive={true} />
          </div>;
        })()}
      </DragOverlay>
    </DndContext>;
});
FavoritesList.displayName = 'FavoritesList';
export default FavoritesList;
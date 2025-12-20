import { Virtuoso } from 'react-virtuoso';
import { useCallback, useState, useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { useCustomScrollbar } from '@shared/hooks/useCustomScrollbar';
import { useSortableList } from '@shared/hooks/useSortable';
import { useNavigation } from '@shared/hooks/useNavigation';
import { favoritesStore, loadFavoritesRange, pasteFavorite } from '@shared/store/favoritesStore';
import { groupsStore } from '@shared/store/groupsStore';
import { navigationStore } from '@shared/store/navigationStore';
import { settingsStore } from '@shared/store/settingsStore';
import { moveFavoriteItemById } from '@shared/api';
import FavoriteItem from './FavoriteItem';
const FavoritesList = forwardRef(({
  onScrollStateChange
}, ref) => {
  const [scrollerElement, setScrollerElement] = useState(null);
  const virtuosoRef = useRef(null);
  const currentRangeRef = useRef({
    startIndex: 0,
    endIndex: 0
  });
  const snap = useSnapshot(navigationStore);
  const favSnap = useSnapshot(favoritesStore);
  const groupsSnap = useSnapshot(groupsStore);
  const settings = useSnapshot(settingsStore);
  const itemsArray = useMemo(() => {
    return Array.from({
      length: favSnap.totalCount
    }, (_, i) => favSnap.items.get(i) || null);
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
      item._sortId = `${item.id}`;
      return item;
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
      favoritesStore.items = new Map();
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

  const handleRangeChanged = useCallback(async ({
    startIndex,
    endIndex
  }) => {
    currentRangeRef.current = {
      startIndex,
      endIndex
    };

    favoritesStore.updateViewRange(startIndex, endIndex);

    let rangeStart = -1,
      rangeEnd = -1;
    for (let i = startIndex; i <= endIndex && i < favSnap.totalCount; i++) {
      if (!favSnap.items.has(i)) {
        if (rangeStart === -1) rangeStart = i;
        rangeEnd = i;
      }
    }
    if (rangeStart !== -1) {
      await loadFavoritesRange(Math.max(0, rangeStart - 20), Math.min(favSnap.totalCount - 1, rangeEnd + 20), groupsSnap.currentGroup);
    }
  }, [favSnap.totalCount, favSnap.items, groupsSnap.currentGroup]);

  useEffect(() => {
    if (favSnap.totalCount > 0 && favSnap.items.size === 0) {
      const {
        startIndex,
        endIndex
      } = currentRangeRef.current;
      if (startIndex >= 0 && endIndex >= startIndex && endIndex < favSnap.totalCount) {
        loadFavoritesRange(Math.max(0, startIndex - 20), Math.min(favSnap.totalCount - 1, endIndex + 20), groupsSnap.currentGroup);
      } else {
        loadFavoritesRange(0, Math.min(49, favSnap.totalCount - 1), groupsSnap.currentGroup);
      }
    }
  }, [favSnap.totalCount, favSnap.items.size, groupsSnap.currentGroup]);
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
  if (favSnap.totalCount === 0) {
    return <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          暂无收藏内容
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
      <div className="flex-1 bg-gray-50 dark:bg-gray-800 overflow-hidden custom-scrollbar-container transition-colors duration-500 favorites-list" data-no-drag>
        <SortableContext items={itemsWithId.map(item => item._sortId)} strategy={strategy}>
          <Virtuoso ref={virtuosoRef} totalCount={favSnap.totalCount || 0} scrollerRef={scrollerRefCallback} atTopStateChange={atTop => {
          onScrollStateChange?.({
            atTop
          });
        }} rangeChanged={handleRangeChanged} increaseViewportBy={{
          top: 400,
          bottom: 400
        }} defaultItemHeight={getDefaultItemHeight()} computeItemKey={index => {
          const item = itemsWithId[index];
          return item?.id || item?._sortId || `item-${index}`;
        }} itemContent={index => {
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
          const uiAnimationEnabled = settings.uiAnimationEnabled !== false;
          return <div className="px-2.5 pb-2 pt-1 relative">
                  <div className={`${isAutoHeight ? 'absolute inset-0' : ''} rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 ${skeletonHeight} ${uiAnimationEnabled ? 'animate-pulse' : ''}`} style={uiAnimationEnabled ? {
              animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite, fadeOut 0.3s ease-out ${animationDelay + 200}ms forwards`
            } : {}}>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                  <div className={`${isAutoHeight ? 'relative' : 'absolute inset-0 px-2.5 pb-2 pt-1'} ${uiAnimationEnabled ? 'animate-slide-in-left-fast' : ''}`} style={uiAnimationEnabled ? {
              animationDelay: `${animationDelay}ms`,
              animationFillMode: 'backwards'
            } : {}}>
                    <FavoriteItem item={item} index={index} sortId={item._sortId} isSelected={currentSelectedIndex === index} onHover={() => handleItemHover(index)} isDraggable={canDrag} isDragActive={dragActive} />
                  </div>
                </div>;
        }} isScrolling={scrolling => scrolling ? handleScrollStart() : handleScrollEnd()} style={{
          height: '100%'
        }} />
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem && activeIndex !== -1 && (() => {
          const overlayHeight = {
            auto: 'h-auto max-h-[350px]',
            large: 'h-[120px]',
            medium: 'h-[90px]',
            small: 'h-[50px]'
          }[settings.rowHeight] ?? 'h-[90px]';
          return <div className={`px-2.5 pb-2 pt-1 ${overlayHeight}`}>
            <FavoriteItem item={activeItem} index={activeIndex} sortId={activeItem._sortId} isDragActive={true} />
          </div>;
        })()}
      </DragOverlay>
    </DndContext>;
});
FavoritesList.displayName = 'FavoritesList';
export default FavoritesList;
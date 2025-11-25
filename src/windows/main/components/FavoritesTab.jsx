import { useRef, forwardRef, useImperativeHandle, useEffect, useState } from 'react';
import { useSnapshot } from 'valtio';
import { favoritesStore, refreshFavorites } from '@shared/store';
import { navigationStore } from '@shared/store/navigationStore';
import { groupsStore } from '@shared/store/groupsStore';
import { openBlankEditor } from '@shared/api/textEditor';
import FavoritesList from './FavoritesList';
import FloatingToolbar from './FloatingToolbar';
const FavoritesTab = forwardRef(({
  contentFilter,
  searchQuery
}, ref) => {
  const snap = useSnapshot(favoritesStore);
  const listRef = useRef(null);
  const [isAtTop, setIsAtTop] = useState(true);
  useEffect(() => {
    favoritesStore.setContentType(contentFilter);
    favoritesStore.setFilter(searchQuery);
    refreshFavorites();
    navigationStore.resetNavigation();
  }, [searchQuery, contentFilter]);

  // 暴露导航方法给父组件
  useImperativeHandle(ref, () => ({
    navigateUp: () => listRef.current?.navigateUp?.(),
    navigateDown: () => listRef.current?.navigateDown?.(),
    executeCurrentItem: () => listRef.current?.executeCurrentItem?.()
  }));

  // 处理滚动状态变化
  const handleScrollStateChange = ({
    atTop
  }) => {
    setIsAtTop(atTop);
  };

  // 处理返回顶部
  const handleScrollToTop = () => {
    listRef.current?.scrollToTop?.();
  };

  // 处理添加收藏
  const handleAddFavorite = async () => {
    try {
      const currentGroup = groupsStore.currentGroup === '全部' ? null : groupsStore.currentGroup;
      await openBlankEditor(currentGroup);
    } catch (error) {
      console.error('打开文本编辑器失败：', error);
    }
  };

  // 判断是否显示添加收藏按钮
  const shouldShowAddFavorite = true;
  return <div className="h-full flex flex-col relative">
      <FavoritesList ref={listRef} onScrollStateChange={handleScrollStateChange} />
      
      {/* 悬浮工具栏 */}
      <FloatingToolbar showScrollTop={!isAtTop && snap.totalCount > 0} showAddFavorite={shouldShowAddFavorite} onScrollTop={handleScrollToTop} onAddFavorite={handleAddFavorite} />
    </div>;
});
FavoritesTab.displayName = 'FavoritesTab';
export default FavoritesTab;
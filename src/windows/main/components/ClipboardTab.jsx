import { useRef, forwardRef, useImperativeHandle, useEffect, useState } from 'react';
import { useSnapshot } from 'valtio';
import { listen } from '@tauri-apps/api/event';
import { clipboardStore, refreshClipboardHistory } from '@shared/store/clipboardStore';
import { navigationStore } from '@shared/store/navigationStore';
import { settingsStore } from '@shared/store/settingsStore';
import ClipboardList from './ClipboardList';
import FloatingToolbar from './FloatingToolbar';
const ClipboardTab = forwardRef(({
  contentFilter,
  searchQuery
}, ref) => {
  const snap = useSnapshot(clipboardStore);
  const settings = useSnapshot(settingsStore);
  const listRef = useRef(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const prevTotalCountRef = useRef(snap.totalCount);

  useEffect(() => {
    clipboardStore.setContentType(contentFilter);
    clipboardStore.setFilter(searchQuery);
    refreshClipboardHistory();
    if (searchQuery) {
      navigationStore.setSelectedIndex(0);
    } else {
      navigationStore.resetNavigation();
    }
  }, [searchQuery, contentFilter]);

  const scrollToTopIfEnabled = (delay = 50) => {
    if (settings.autoScrollToTopOnShow) {
      setTimeout(() => listRef.current?.scrollToTop?.('auto'), delay);
    }
  };

  useEffect(() => {
    if (snap.totalCount > prevTotalCountRef.current) {
      scrollToTopIfEnabled(100);
    }
    prevTotalCountRef.current = snap.totalCount;
  }, [snap.totalCount]);
  useEffect(() => {
    const setupListeners = async () => {
      const unlisten1 = await listen('window-show-animation', () => scrollToTopIfEnabled());
      const unlisten2 = await listen('edge-snap-bounce-animation', () => scrollToTopIfEnabled());
      return () => {
        unlisten1();
        unlisten2();
      };
    };
    let cleanup = setupListeners();
    return () => cleanup.then(fn => fn());
  }, [settings.autoScrollToTopOnShow]);

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
  return <div className="h-full flex flex-col relative">
      {/* 列表 */}
      <ClipboardList ref={listRef} onScrollStateChange={handleScrollStateChange} />
      
      {/* 悬浮工具栏 */}
      <FloatingToolbar showScrollTop={!isAtTop && snap.totalCount > 0} showAddFavorite={false} onScrollTop={handleScrollToTop} />
    </div>;
});
ClipboardTab.displayName = 'ClipboardTab';
export default ClipboardTab;
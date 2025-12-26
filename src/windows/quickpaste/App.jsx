import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { useSnapshot } from 'valtio';
import { useTranslation } from 'react-i18next';
import { navigationStore } from '@shared/store/navigationStore';
import { groupsStore } from '@shared/store/groupsStore';
import { clipboardStore, loadClipboardRange, pasteClipboardItem, initClipboardItems } from '@shared/store/clipboardStore';
import { favoritesStore, loadFavoritesRange, pasteFavorite, initFavorites } from '@shared/store/favoritesStore';
import { settingsStore } from '@shared/store/settingsStore';
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme';
import { useSettingsSync } from '@shared/hooks/useSettingsSync';
import { ImageContent, FileContent, HtmlContent, TextContent } from '@windows/main/components/ClipboardContent';
import { getPrimaryType } from '@shared/utils/contentType';
import { playScrollSound } from '@shared/api';

const ITEM_HEIGHT = 52;
const ITEM_PADDING = 8;

function QuickPasteWindow() {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHoveringCancel, setIsHoveringCancel] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const [scrollOffset, setScrollOffset] = useState(0);
  const navSnap = useSnapshot(navigationStore);
  const groupSnap = useSnapshot(groupsStore);
  const clipSnap = useSnapshot(clipboardStore);
  const favSnap = useSnapshot(favoritesStore);
  const settings = useSnapshot(settingsStore);
  const { theme, effectiveTheme, isDark } = useTheme();
  useSettingsSync();

  const isClipboardTab = navSnap.activeTab === 'clipboard';
  const currentItems = isClipboardTab ? clipSnap.items : favSnap.items;
  const totalCount = isClipboardTab ? clipSnap.totalCount : favSnap.totalCount;
  const itemsArray = useMemo(() => Array.from({ length: totalCount }, (_, i) => currentItems[i] || null), [currentItems, totalCount]);
  const title = isClipboardTab ? t('settings.quickpaste.window.clipboardHistory') : groupSnap.currentGroup;

  // 计算可见项目数量
  useEffect(() => {
    const updateVisibleCount = () => {
      if (containerRef.current) {
        const height = containerRef.current.clientHeight;
        const count = Math.floor(height / ITEM_HEIGHT);
        setVisibleCount(Math.max(1, count));
      }
    };

    updateVisibleCount();
    window.addEventListener('resize', updateVisibleCount);
    return () => window.removeEventListener('resize', updateVisibleCount);
  }, []);

  // 计算可见的项目范围
  const visibleItems = useMemo(() => {
    const items = [];
    for (let i = 0; i < visibleCount && i + scrollOffset < totalCount; i++) {
      items.push({
        index: i + scrollOffset,
        item: itemsArray[i + scrollOffset]
      });
    }
    return items;
  }, [scrollOffset, visibleCount, totalCount, itemsArray]);

  useEffect(() => {
    if (totalCount <= visibleCount) {
      setScrollOffset(0);
      return;
    }

    const middlePosition = Math.floor(visibleCount / 2);
    let idealOffset = activeIndex - middlePosition;

    idealOffset = Math.max(0, Math.min(idealOffset, totalCount - visibleCount));
    
    setScrollOffset(idealOffset);
  }, [activeIndex, visibleCount, totalCount]);

  useEffect(() => {
    const loadVisibleData = async () => {
      const start = scrollOffset;
      const end = Math.min(scrollOffset + visibleCount + 2, totalCount - 1);
      
      let needLoad = false;
      for (let i = start; i <= end; i++) {
        if (!(i in currentItems)) {
          needLoad = true;
          break;
        }
      }
      
      if (needLoad) {
        if (isClipboardTab) {
          await loadClipboardRange(start, end);
        } else {
          await loadFavoritesRange(groupSnap.currentGroup, start, end);
        }
      }
    };
    
    loadVisibleData();
  }, [scrollOffset, visibleCount, totalCount, currentItems, isClipboardTab, groupSnap.currentGroup]);

  useEffect(() => {
    const handleMouseLeave = () => setIsHoveringCancel(true);
    const handleMouseEnter = () => setIsHoveringCancel(false);

    document.documentElement.addEventListener('mouseleave', handleMouseLeave);
    document.documentElement.addEventListener('mouseenter', handleMouseEnter);
    return () => {
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      document.documentElement.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, []);
  const handleItemClick = useCallback((index) => {
    setActiveIndex(index);
  }, []);
  useEffect(() => {
    applyThemeToBody(theme, 'quickpaste');
  }, [theme, effectiveTheme]);

  // 窗口隐藏时执行粘贴
  useEffect(() => {
    const unlisten = listen('quickpaste-hide', async () => {
      if (isHoveringCancel) return;
      const item = itemsArray[activeIndex];
      if (!item) return;
      try {
        isClipboardTab ? await pasteClipboardItem(item.id) : await pasteFavorite(item.id);
      } catch (error) {
        console.error('粘贴失败:', error);
      }
    });
    return () => unlisten.then(fn => fn());
  }, [isHoveringCancel, activeIndex, itemsArray, isClipboardTab]);
  useEffect(() => {
    const unlisten = listen('quickpaste-show', async () => {
      try {
        if (navigationStore.activeTab === 'clipboard') {
          await initClipboardItems();
        } else {
          await initFavorites();
        }
      } catch (error) {
        console.error('刷新便捷粘贴数据失败:', error);
      }

      setActiveIndex(0);
      setScrollOffset(0);
      setIsHoveringCancel(false);
    });
    return () => unlisten.then(fn => fn());
  }, []);
  useEffect(() => {
    const unlisten = listen('navigation-changed', async event => {
      const { activeTab, currentGroup } = event.payload;
      navigationStore.activeTab = activeTab;
      if (currentGroup !== undefined) {
        groupsStore.currentGroup = currentGroup;
      }
      if (activeTab === 'clipboard') {
        await initClipboardItems();
      } else {
        await initFavorites();
      }
    });
    return () => unlisten.then(fn => fn());
  }, []);
  useEffect(() => {
    setActiveIndex(0);
    setScrollOffset(0);
  }, [navSnap.activeTab, groupSnap.currentGroup, totalCount]);

  // 滚轮切换项
  useEffect(() => {
    const handleWheel = (e) => {
      e.preventDefault();
      playScrollSound();
      setActiveIndex(prev => {
        const max = totalCount - 1;
        return e.deltaY > 0
          ? (prev < max ? prev + 1 : 0)
          : (prev > 0 ? prev - 1 : max);
      });
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [totalCount]);

  useEffect(() => {
    const unlisten = listen('quickpaste-next', () => {
      playScrollSound();
      setActiveIndex(prev => {
        const max = totalCount - 1;
        return prev < max ? prev + 1 : 0;
      });
    });
    return () => unlisten.then(fn => fn());
  }, [totalCount]);
  useEffect(() => {
    let resizeTimeout;
    const handleResize = async () => {
      const window = getCurrentWebviewWindow();
      const size = await window.innerSize();
      const scaleFactor = await window.scaleFactor();
      const logicalWidth = size.width / scaleFactor;
      const logicalHeight = size.height / scaleFactor;
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(async () => {
        try {
          await invoke('save_quickpaste_window_size', {
            width: Math.round(logicalWidth),
            height: Math.round(logicalHeight)
          });
        } catch (error) {
          console.error('保存窗口尺寸失败:', error);
        }
      }, 500);
    };
    const unlisten = listen('tauri://resize', handleResize);
    return () => {
      clearTimeout(resizeTimeout);
      unlisten.then(fn => fn());
    };
  }, []);

  const getTypeLabel = (item) => {
    if (!item || !item.content_type) return '';
    const primaryType = getPrimaryType(item.content_type);
    switch (primaryType) {
      case 'image': return t('filter.image');
      case 'file': return t('filter.file');
      case 'link': return t('filter.link');
      default: return t('filter.text');
    }
  };

  // 渲染内容
  const renderItemContent = (item) => {
    if (!item || !item.content_type) {
      return (
        <div className="w-full flex items-center">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">加载中...</span>
          </div>
        </div>
      );
    }

    const primaryType = getPrimaryType(item.content_type);

    if (primaryType === 'image') {
      return (
        <div className="w-full h-7 overflow-hidden rounded flex items-center">
          <ImageContent item={item} />
        </div>
      );
    }

    if (primaryType === 'file') {
      return (
        <div className="w-full h-7 overflow-hidden flex items-center">
          <FileContent item={item} compact={true} />
        </div>
      );
    }

    if (primaryType === 'rich_text') {
      if (settings.pasteWithFormat && item.html_content) {
        return (
          <div className="w-full h-7 overflow-hidden">
            <HtmlContent htmlContent={item.html_content} lineClampClass="line-clamp-1" />
          </div>
        );
      }
      return (
        <div className="w-full h-7 overflow-hidden">
          <TextContent content={item.content || ''} lineClampClass="line-clamp-1" />
        </div>
      );
    }

    return (
      <div className="w-full h-7 overflow-hidden">
        <TextContent content={item.content || ''} lineClampClass="line-clamp-1" />
      </div>
    );
  };

  return (
    <div className={`absolute inset-0 ${isDark ? 'dark' : ''}`}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        :root, html, body, #root { background: transparent !important; background-color: transparent !important; }
      `}</style>

      <div 
        ref={containerRef}
        className="w-full h-full flex flex-col justify-center overflow-hidden"
        style={{ padding: `${ITEM_PADDING}px` }}
      >
        {!totalCount ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="px-6 py-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-xl">
                  <i className={`ti ti-${isClipboardTab ? 'clipboard-off' : 'star-off'} text-gray-400 dark:text-gray-500 text-lg`} />
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  {isClipboardTab ? t('settings.quickpaste.window.emptyClipboard') : t('settings.quickpaste.window.emptyFavorites')}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div 
            className="flex flex-col items-center gap-1 transition-opacity duration-150"
            style={{ opacity: isHoveringCancel ? 0.4 : 1 }}
          >
            {/* 标题 */}
            <div className="flex items-center justify-center mb-0.5">
              <span 
                className="text-xs font-semibold text-white truncate"
                style={{ 
                  WebkitTextStroke: '0.5px rgba(0,0,0,0.8)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.5)'
                }}
              >
                {title} · {totalCount}
              </span>
            </div>
            
            {/* 项目列表 */}
            {visibleItems.map(({ index, item }) => {
              const active = activeIndex === index;
              
              return (
                <div
                  key={index}
                  className={`
                    w-full flex items-center gap-3 px-4 rounded-xl cursor-pointer
                    transition-all duration-100 ease-out origin-center
                    ${active
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-500/40 scale-100'
                      : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-md shadow-black/8 dark:shadow-black/20 scale-[0.92] opacity-80 hover:opacity-90 hover:shadow-lg'
                    }
                  `}
                  style={{ 
                    height: `${ITEM_HEIGHT - 8}px`,
                    border: '0.5px solid rgba(0,0,0,0.1)'
                  }}
                  onClick={() => handleItemClick(index)}
                >
                  {/* 序号 */}
                  <div className={`
                    flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs font-bold
                    ${active
                      ? 'bg-white/25 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }
                  `}>
                    {index + 1}
                  </div>

                  {/* 内容区域 */}
                  <div className={`
                    flex-1 min-w-0 text-sm
                    ${active ? 'text-white font-medium' : 'text-gray-700 dark:text-gray-200'}
                  `}>
                    {item ? renderItemContent(item) : (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full animate-pulse" />
                        <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
                      </div>
                    )}
                  </div>

                  {/* 类型标签 */}
                  {item && (
                    <div className={`
                      flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium
                      ${active
                        ? 'bg-white/20 text-white/90'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                      }
                    `}>
                      {getTypeLabel(item)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
export default QuickPasteWindow;
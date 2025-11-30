import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { Virtuoso } from 'react-virtuoso';
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
import logoIcon from '@/assets/icon1024.png';
function QuickPasteWindow() {
  const {
    t
  } = useTranslation();
  const virtuosoRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHoveringCancel, setIsHoveringCancel] = useState(false);
  const navSnap = useSnapshot(navigationStore);
  const groupSnap = useSnapshot(groupsStore);
  const clipSnap = useSnapshot(clipboardStore);
  const favSnap = useSnapshot(favoritesStore);
  const settings = useSnapshot(settingsStore);
  const {
    theme,
    effectiveTheme,
    isDark
  } = useTheme();
  useSettingsSync();

  const getRowHeightStyle = () => 'h-12';
  const isClipboardTab = navSnap.activeTab === 'clipboard';
  const currentItems = isClipboardTab ? clipSnap.items : favSnap.items;
  const totalCount = isClipboardTab ? clipSnap.totalCount : favSnap.totalCount;
  const itemsArray = useMemo(() => Array.from({
    length: totalCount
  }, (_, i) => currentItems.get(i) || null), [currentItems, totalCount]);
  const title = isClipboardTab ? t('settings.quickpaste.window.clipboardHistory') : groupSnap.currentGroup;

  // 处理点击取消
  const handleCancelClick = async () => {
    setIsHoveringCancel(true);
    const window = getCurrentWebviewWindow();
    await window.hide();
  };
  const handleItemClick = useCallback((item, index) => {
    if (!item) return;
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
      setIsHoveringCancel(false);
      virtuosoRef.current?.scrollToIndex({
        index: 0,
        align: 'start',
        behavior: 'auto'
      });

      const container = document.querySelector('.quickpaste-container');
      if (container) {
        container.style.animation = 'none';
        container.offsetHeight;
        container.style.animation = 'slideIn 0.3s ease-out';
      }
    });
    return () => unlisten.then(fn => fn());
  }, []);
  useEffect(() => {
    const unlisten = listen('navigation-changed', async event => {
      const {
        activeTab,
        currentGroup
      } = event.payload;
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
    virtuosoRef.current?.scrollToIndex({
      index: 0,
      align: 'start',
      behavior: 'auto'
    });
  }, [navSnap.activeTab, groupSnap.currentGroup, totalCount]);

  // 滚轮切换项
  useEffect(() => {
    const unlisten = listen('quickpaste-scroll', e => {
      setActiveIndex(prev => {
        const max = totalCount - 1;
        return e.payload.direction === 'up' ? prev > 0 ? prev - 1 : max : prev < max ? prev + 1 : 0;
      });
    });
    return () => unlisten.then(fn => fn());
  }, [totalCount]);
  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({
      index: activeIndex,
      align: 'center',
      behavior: 'auto'
    });
  }, [activeIndex]);
  const handleRangeChanged = useCallback(async ({
    startIndex,
    endIndex
  }) => {
    let start = -1,
      end = -1;
    for (let i = startIndex; i <= Math.min(endIndex, totalCount - 1); i++) {
      if (!currentItems.has(i)) {
        if (start === -1) start = i;
        end = i;
      }
    }
    if (start !== -1) {
      const s = Math.max(0, start - 10);
      const e = Math.min(totalCount - 1, end + 10);
      isClipboardTab ? await loadClipboardRange(s, e) : await loadFavoritesRange(groupSnap.currentGroup, s, e);
    }
  }, [totalCount, currentItems, isClipboardTab, groupSnap.currentGroup]);
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

  // 渲染内容
  const renderItemContent = item => {
    if (!item || !item.content_type) {
      return (
        <div className="w-full flex items-center">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400 dark:text-gray-500">加载中...</span>
          </div>
        </div>
      );
    }

    const primaryType = getPrimaryType(item.content_type);

    if (primaryType === 'image') {
      return (
        <div className="w-full h-8 overflow-hidden rounded bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 border border-gray-200/50 dark:border-gray-600/50 flex items-center">
          <ImageContent item={item} />
        </div>
      );
    }

    if (primaryType === 'file') {
      return (
        <div className="w-full h-8 overflow-hidden flex items-center">
          <FileContent item={item} compact={true} />
        </div>
      );
    }

    if (primaryType === 'rich_text') {
      if (settings.pasteWithFormat && item.html_content) {
        return (
          <div className="w-full h-8 overflow-hidden">
            <HtmlContent htmlContent={item.html_content} lineClampClass="line-clamp-1" />
          </div>
        );
      } else {
        return (
          <div className="w-full h-8 overflow-hidden">
            <TextContent content={item.content || ''} lineClampClass="line-clamp-1" />
          </div>
        );
      }
    }

    return (
      <div className="w-full h-8 overflow-hidden">
        <TextContent content={item.content || ''} lineClampClass="line-clamp-1" />
      </div>
    );
  };
  const outerContainerClasses = `
    absolute inset-0 flex items-center justify-center
    ${isDark ? 'dark' : ''}
  `.trim().replace(/\s+/g, ' ');

  return <div className={outerContainerClasses} style={{
    padding: '5px'
  }}>
    <div className="quickpaste-container w-full h-full flex flex-col bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl overflow-hidden" style={{
      borderRadius: '8px',
      boxShadow: '0 0 5px 1px rgba(0, 0, 0, 0.3), 0 0 3px 0 rgba(0, 0, 0, 0.2)'
    }}>
      <style>{`
          * { box-sizing: border-box; }
          .quickpaste-scrollbar-container {
            scrollbar-width: thin;
            scrollbar-color: rgba(156, 163, 175, 0.3) transparent;
          }
          .quickpaste-scrollbar-container::-webkit-scrollbar {
            width: 4px;
          }
          .quickpaste-scrollbar-container::-webkit-scrollbar-track {
            background: transparent;
          }
          .quickpaste-scrollbar-container::-webkit-scrollbar-thumb {
            background: rgba(156, 163, 175, 0.3);
            border-radius: 2px;
          }
          .quickpaste-scrollbar-container::-webkit-scrollbar-thumb:hover {
            background: rgba(156, 163, 175, 0.5);
          }
          .dark .quickpaste-scrollbar-container {
            scrollbar-color: rgba(75, 85, 99, 0.5) transparent;
          }
          .dark .quickpaste-scrollbar-container::-webkit-scrollbar-thumb {
            background: rgba(75, 85, 99, 0.5);
          }
          .dark .quickpaste-scrollbar-container::-webkit-scrollbar-thumb:hover {
            background: rgba(75, 85, 99, 0.7);
          }

        `}</style>

      {/* 顶部标题栏 */}
      <div className="flex-shrink-0 px-3 py-2 bg-gradient-to-br from-gray-50/80 dark:from-gray-800/80 via-transparent to-transparent backdrop-blur-sm border-b border-white/30 dark:border-gray-700/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg shadow-sm overflow-hidden">
            <img src={logoIcon} alt="QuickClipboard" className="w-full h-full object-contain" />
          </div>
          <h2 className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200 tracking-wide truncate overflow-hidden">
            {title}
          </h2>
          <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 bg-gradient-to-br from-gray-100 dark:from-gray-700 to-gray-50 dark:to-gray-600 rounded-full text-[10px] font-bold text-gray-600 dark:text-gray-300 shadow-inner">
            {totalCount}
          </span>
        </div>
      </div>

      {/* 列表 */}
      {!totalCount ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-gray-100 dark:from-gray-700 to-gray-50 dark:to-gray-600 rounded-xl mb-3 shadow-inner">
            <i className={`ti ti-${isClipboardTab ? 'clipboard-off' : 'star-off'} text-gray-400 dark:text-gray-500 text-lg`} />
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium text-center max-w-[120px]">
            {isClipboardTab ? t('settings.quickpaste.window.emptyClipboard') : t('settings.quickpaste.window.emptyFavorites')}
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden quickpaste-scrollbar-container">
          <Virtuoso
            ref={virtuosoRef}
            totalCount={totalCount}
            rangeChanged={handleRangeChanged}
            increaseViewportBy={{ top: 100, bottom: 100 }}
            style={{ height: '100%' }}
            itemContent={index => {
              const item = itemsArray[index];
              const active = activeIndex === index;

              return item ? (
                <div className="px-2 py-1.5 relative">
                  {active && (
                    <div className="absolute inset-0 m-1 rounded-lg border-2 border-blue-500 dark:border-blue-400 border-l-8 shadow-lg shadow-blue-500/30 pointer-events-none z-20" />
                  )}
                  <div className={`
                    relative pl-4 pr-3 py-3 rounded-lg cursor-pointer border shadow-sm
                    ${getRowHeightStyle()}
                    ${active
                      ? 'bg-blue-50/80 dark:bg-blue-900/25 border-transparent scale-[1.05]'
                      : 'bg-white/80 dark:bg-gray-800/70 hover:bg-gray-50 dark:hover:bg-gray-700/60 border-gray-200 dark:border-gray-700 hover:shadow'
                    }
                  `} onClick={() => handleItemClick(item, index)}>

                    {/* 内容区域 */}
                    <div className={`text-xs h-full flex items-center ${active ? 'text-gray-900 dark:text-gray-100 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                      {renderItemContent(item)}
                    </div>

                    {/* 序号 */}
                    <div className={`
                      absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-[10px] font-bold transition-all duration-200
                      ${active
                        ? 'w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-300/50 dark:ring-blue-400/30'
                        : 'w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }
                    `}>
                      {index + 1}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-2 py-1.5">
                  <div className={`
                    px-2 py-2 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg overflow-hidden border border-gray-200/50 dark:border-gray-700/30
                    ${getRowHeightStyle()}
                  `}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {/* 底部取消按钮 */}
      <div className={`
        flex-shrink-0 px-3 py-3 text-center text-[11px] font-semibold transition-all duration-300 overflow-hidden cursor-pointer
        ${isHoveringCancel
          ? 'bg-gradient-to-r from-red-500 via-red-600 to-red-500 text-white shadow-2xl shadow-red-500/40 transform scale-[1.02]'
          : 'bg-gradient-to-t from-red-50/70 dark:from-red-900/20 to-transparent text-red-600 dark:text-red-400 hover:from-red-100/70 dark:hover:from-red-900/30'
        }
      `} onMouseEnter={() => setIsHoveringCancel(true)} onMouseLeave={() => setIsHoveringCancel(false)} onClick={handleCancelClick}>
        <div className="flex items-center justify-center gap-2">
          <i className={`ti ti-${isHoveringCancel ? 'x' : 'chevron-down'} transition-all duration-200`} />
          <span className="truncate overflow-hidden font-bold tracking-wide">
            {isHoveringCancel ? t('settings.quickpaste.window.cancelHover') : t('settings.quickpaste.window.cancelNormal')}
          </span>
        </div>
      </div>
    </div>
  </div>;
}
export default QuickPasteWindow;
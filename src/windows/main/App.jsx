import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useSnapshot } from 'valtio';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { settingsStore } from '@shared/store/settingsStore';
import { groupsStore } from '@shared/store/groupsStore';
import { navigationStore } from '@shared/store/navigationStore';
import { toolsStore } from '@shared/store/toolsStore';
import { useWindowDrag } from '@shared/hooks/useWindowDrag';
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme';
import { useSettingsSync } from '@shared/hooks/useSettingsSync';
import { useNavigationKeyboard } from '@shared/hooks/useNavigationKeyboard';
import { useWindowAnimation } from '@shared/hooks/useWindowAnimation';
import { applyBackgroundImage, clearBackgroundImage } from '@shared/utils/backgroundManager';
import { promptDisableWinVHotkeyIfNeeded } from '@shared/api/system';
import TitleBar from './components/TitleBar';
import TabNavigation from './components/TabNavigation';
import ClipboardTab from './components/ClipboardTab';
import FavoritesTab from './components/FavoritesTab';
const EmojiTab = lazy(() => import('./components/EmojiTab'));
import FooterBar from './components/FooterBar';
import GroupsPopup from './components/GroupsPopup';
import ToastContainer from '@shared/components/common/ToastContainer';

function App() {
  const {
    t
  } = useTranslation();
  const settings = useSnapshot(settingsStore);
  const {
    theme,
    darkThemeStyle,
    backgroundImagePath
  } = settings;
  const {
    effectiveTheme,
    isDark,
    isBackground
  } = useTheme();
  const [activeTab, setActiveTab] = useState('clipboard');
  const [contentFilter, setContentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [emojiMode, setEmojiMode] = useState('emoji'); // 'emoji' | 'symbols' | 'images'
  const clipboardTabRef = useRef(null);
  const favoritesTabRef = useRef(null);
  const groupsPopupRef = useRef(null);
  const searchRef = useRef(null);

  // 监听设置变更事件
  useSettingsSync();

  // 启动时检查 Win+V
  useEffect(() => {
    const checkWinV = async () => {
      try {
        if (settings.toggleShortcut === 'Win+V') {
          await promptDisableWinVHotkeyIfNeeded();
        }
      } catch (error) {
        console.error('调用 Win+V 禁用提示命令失败:', error);
      }
    };

    checkWinV();
  }, []);

  // 窗口动画
  useWindowAnimation();

  // 同步当前标签页到导航store
  useEffect(() => {
    navigationStore.setActiveTab(activeTab);
  }, [activeTab]);
  useEffect(() => {
    const setupListeners = async () => {
      const handleWindowShow = async () => {
        try {
          const { saveCurrentFocus } = await import('@shared/api/window');
          await saveCurrentFocus();
        } catch (err) {
          console.warn('保存焦点失败:', err);
        }
        
        if (settingsStore.autoClearSearch) {
          setSearchQuery('');
        }
        if (settingsStore.autoFocusSearch) {
            setTimeout(() => {
                searchRef.current?.focus?.();
            }, 200);
        }
      };
      const unlisten1 = await listen('window-show-animation', handleWindowShow);
      const unlisten2 = await listen('edge-snap-show', handleWindowShow);
      const unlisten3 = await listen('paste-plain-text-selected', () => {
        if (activeTab === 'clipboard' && clipboardTabRef.current?.executePlainTextPaste) {
          clipboardTabRef.current.executePlainTextPaste();
        } else if (activeTab === 'favorites' && favoritesTabRef.current?.executePlainTextPaste) {
          favoritesTabRef.current.executePlainTextPaste();
        }
      });
      
      return () => {
        unlisten1();
        unlisten2();
        unlisten3();
      };
    };
    let cleanup = setupListeners();
    return () => cleanup.then(fn => fn());
  }, [activeTab]);

  useEffect(() => {
    const handleMouseEnter = async () => {
      try {
        const { saveCurrentFocus } = await import('@shared/api/window');
        await saveCurrentFocus();
      } catch (err) {
        console.warn('鼠标进入时保存焦点失败:', err);
      }
    };

    document.addEventListener('mouseenter', handleMouseEnter);
    return () => {
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, []);
  useEffect(() => {
    let resizeTimer = null;
    let moveTimer = null;
    const handleResize = async () => {
      if (!settingsStore.rememberWindowSize) {
        return;
      }
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(async () => {
        try {
          const appWindow = getCurrentWindow();
          const size = await appWindow.outerSize();
          const {
            saveWindowSize
          } = await import('@shared/api/settings');
          await saveWindowSize(size.width, size.height);
        } catch (error) {
          console.error('保存窗口大小失败:', error);
        }
      }, 500);
    };
    const handleMove = async () => {
      if (settingsStore.windowPositionMode !== 'remember') {
        return;
      }
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(async () => {
        try {
          const appWindow = getCurrentWindow();
          const position = await appWindow.outerPosition();
          const {
            saveWindowPosition
          } = await import('@shared/api/settings');
          await saveWindowPosition(position.x, position.y);
        } catch (error) {
          console.error('保存窗口位置失败:', error);
        }
      }, 500);
    };
    const setupListeners = async () => {
      const appWindow = getCurrentWindow();
      const unlistenResize = await appWindow.onResized(handleResize);
      const unlistenMove = await appWindow.onMoved(handleMove);
      return () => {
        unlistenResize();
        unlistenMove();
      };
    };
    let cleanup = setupListeners();
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      if (moveTimer) clearTimeout(moveTimer);
      cleanup.then(fn => fn());
    };
  }, []);

  // 主内容区域拖拽，排除所有交互元素和列表项
  const contentDragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]', 'a', 'input', 'textarea'],
    allowChildren: true
  });

  // 应用主题到body
  useEffect(() => {
    applyThemeToBody(theme, 'main');
  }, [theme, effectiveTheme]);

  // 应用背景图片（仅在背景主题时）
  useEffect(() => {
    if (isBackground && backgroundImagePath) {
      applyBackgroundImage({
        containerSelector: '.main-container',
        backgroundImagePath,
        windowName: 'main'
      });
    } else {
      clearBackgroundImage('.main-container');
    }
  }, [isBackground, backgroundImagePath]);

  // 处理分组切换
  const handleGroupChange = async groupName => {
    groupsStore.setCurrentGroup(groupName);
    // 重置导航索引
    navigationStore.resetNavigation();
    // 重新加载收藏列表
    const {
      initFavorites
    } = await import('@shared/store/favoritesStore');
    await initFavorites(groupName);
  };

  // 导航键盘事件处理
  const handleNavigateUp = () => {
    if (activeTab === 'clipboard' && clipboardTabRef.current?.navigateUp) {
      clipboardTabRef.current.navigateUp();
    } else if (activeTab === 'favorites' && favoritesTabRef.current?.navigateUp) {
      favoritesTabRef.current.navigateUp();
    }
  };
  const handleNavigateDown = () => {
    if (activeTab === 'clipboard' && clipboardTabRef.current?.navigateDown) {
      clipboardTabRef.current.navigateDown();
    } else if (activeTab === 'favorites' && favoritesTabRef.current?.navigateDown) {
      favoritesTabRef.current.navigateDown();
    }
  };
  const handleExecuteItem = () => {
    if (activeTab === 'clipboard' && clipboardTabRef.current?.executeCurrentItem) {
      clipboardTabRef.current.executeCurrentItem();
    } else if (activeTab === 'favorites' && favoritesTabRef.current?.executeCurrentItem) {
      favoritesTabRef.current.executeCurrentItem();
    }
  };
  const handleTabLeft = () => {
    setActiveTab(currentTab => {
      const tabs = ['clipboard', 'favorites', 'emoji'];
      const currentIndex = tabs.indexOf(currentTab);
      if (currentIndex === -1) return tabs[tabs.length - 1];
      return tabs[currentIndex === 0 ? tabs.length - 1 : currentIndex - 1];
    });
  };
  const handleTabRight = () => {
    setActiveTab(currentTab => {
      const tabs = ['clipboard', 'favorites', 'emoji'];
      const currentIndex = tabs.indexOf(currentTab);
      if (currentIndex === -1) return tabs[0];
      return tabs[currentIndex === tabs.length - 1 ? 0 : currentIndex + 1];
    });
  };
  const handleFocusSearch = () => {
    if (searchRef.current?.focus) {
      searchRef.current.focus();
    }
  };

  // 处理搜索框内的导航操作
  const handleSearchNavigate = direction => {
    if (direction === 'up') {
      handleNavigateUp();
    } else if (direction === 'down') {
      handleNavigateDown();
    } else if (direction === 'execute') {
      handleExecuteItem();
    }
  };

  // 固定/取消固定窗口
  const handleTogglePin = async () => {
    try {
      await toolsStore.handleToolClick('pin-button');
    } catch (error) {
      console.error('切换窗口固定状态失败:', error);
    }
  };

  // 切换到上一个分组
  const handlePreviousGroup = () => {
    if (activeTab !== 'favorites') {
      setActiveTab('favorites');
    }
    const groups = groupsStore.groups;
    if (groups.length === 0) return;
    const currentIndex = groups.findIndex(g => g.name === groupsStore.currentGroup);
    const prevIndex = currentIndex <= 0 ? groups.length - 1 : currentIndex - 1;
    const prevGroup = groups[prevIndex];
    groupsStore.setCurrentGroup(prevGroup.name);
    handleGroupChange(prevGroup.name);
    if (groupsPopupRef.current?.showTemporarily) {
      groupsPopupRef.current.showTemporarily();
    }
  };

  // 切换到下一个分组
  const handleNextGroup = () => {
    if (activeTab !== 'favorites') {
      setActiveTab('favorites');
    }
    const groups = groupsStore.groups;
    if (groups.length === 0) return;
    const currentIndex = groups.findIndex(g => g.name === groupsStore.currentGroup);
    const nextIndex = currentIndex >= groups.length - 1 ? 0 : currentIndex + 1;
    const nextGroup = groups[nextIndex];
    groupsStore.setCurrentGroup(nextGroup.name);
    handleGroupChange(nextGroup.name);
    if (groupsPopupRef.current?.showTemporarily) {
      groupsPopupRef.current.showTemporarily();
    }
  };

  // 设置全局键盘导航
  useNavigationKeyboard({
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onExecuteItem: handleExecuteItem,
    onTabLeft: handleTabLeft,
    onTabRight: handleTabRight,
    onFocusSearch: handleFocusSearch,
    onTogglePin: handleTogglePin,
    onPreviousGroup: handlePreviousGroup,
    onNextGroup: handleNextGroup,
    enabled: true
  });
  const outerContainerClasses = `
    h-screen w-screen 
    ${isDark ? 'dark' : ''}
  `.trim().replace(/\s+/g, ' ');
  const containerClasses = `
    main-container 
    h-full w-full
    flex ${settings.titleBarPosition === 'left' || settings.titleBarPosition === 'right' ? 'flex-row' : 'flex-col'}
    overflow-hidden
    transition-colors duration-500 ease-in-out
    ${isDark ? 'bg-gray-900' : ''}
    ${!isDark ? 'bg-white' : ''}
  `.trim().replace(/\s+/g, ' ');
  const TitleBarComponent = <TitleBar ref={searchRef} searchQuery={searchQuery} onSearchChange={setSearchQuery} searchPlaceholder={t('search.placeholder')} onNavigate={handleSearchNavigate} position={settings.titleBarPosition} />;
  const TabNavigationComponent = <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} contentFilter={contentFilter} onFilterChange={setContentFilter} emojiMode={emojiMode} onEmojiModeChange={setEmojiMode} />;
  const ContentComponent = <div ref={contentDragRef} className="flex-1 overflow-hidden relative">
      {activeTab === 'clipboard' && <ClipboardTab ref={clipboardTabRef} contentFilter={contentFilter} searchQuery={searchQuery} />}
      {activeTab === 'favorites' && <FavoritesTab ref={favoritesTabRef} contentFilter={contentFilter} searchQuery={searchQuery} />}
      {activeTab === 'emoji' && <Suspense fallback={null}><EmojiTab emojiMode={emojiMode} onEmojiModeChange={setEmojiMode} /></Suspense>}
    </div>;
  const FooterComponent = <FooterBar>
      <GroupsPopup ref={groupsPopupRef} activeTab={activeTab} onTabChange={setActiveTab} onGroupChange={handleGroupChange} />
    </FooterBar>;
  const renderLayout = () => {
    switch (settings.titleBarPosition) {
      case 'top':
        return <>
            {TitleBarComponent}
            {TabNavigationComponent}
            {ContentComponent}
            {FooterComponent}
          </>;
      case 'bottom':
        return <>
            {TabNavigationComponent}
            {ContentComponent}
            {FooterComponent}
            {TitleBarComponent}
          </>;
      case 'left':
        return <>
            <div className="flex flex-col h-full">
              {TitleBarComponent}
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              {TabNavigationComponent}
              {ContentComponent}
              {FooterComponent}
            </div>
          </>;
      case 'right':
        return <>
            <div className="flex-1 flex flex-col overflow-hidden">
              {TabNavigationComponent}
              {ContentComponent}
              {FooterComponent}
            </div>
            <div className="flex flex-col h-full">
              {TitleBarComponent}
            </div>
          </>;
      default:
        return <>
            {TitleBarComponent}
            {TabNavigationComponent}
            {ContentComponent}
            {FooterComponent}
          </>;
    }
  };
  return <div className={outerContainerClasses} style={{
    padding: '5px'
  }}>
      <div className={containerClasses} style={{
      borderRadius: '8px',
      boxShadow: '0 0 5px 1px rgba(0, 0, 0, 0.3), 0 0 3px 0 rgba(0, 0, 0, 0.2)'
    }}>
        {renderLayout()}
        <ToastContainer />
      </div>
    </div>;
}
export default App;
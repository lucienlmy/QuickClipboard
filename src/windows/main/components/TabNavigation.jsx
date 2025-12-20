import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import TabButton from './TabButton';
import FilterButton from './FilterButton';

function TabNavigation({
  activeTab,
  onTabChange,
  contentFilter,
  onFilterChange,
  emojiMode,
  onEmojiModeChange
}) {
  const {
    t
  } = useTranslation();
  const settings = useSnapshot(settingsStore);
  const uiAnimationEnabled = settings.uiAnimationEnabled !== false;
  const tabsRef = useRef({});
  const filtersRef = useRef({});
  const emojiModesRef = useRef({});
  const [tabIndicator, setTabIndicator] = useState({
    width: 0,
    left: 0
  });
  const [filterIndicator, setFilterIndicator] = useState({
    width: 0,
    left: 0
  });
  const [emojiModeIndicator, setEmojiModeIndicator] = useState({
    width: 0,
    left: 0
  });
  const [tabAnimationKey, setTabAnimationKey] = useState(0);
  const [filterAnimationKey, setFilterAnimationKey] = useState(0);
  const [emojiModeAnimationKey, setEmojiModeAnimationKey] = useState(0);

  const tabs = [{
    id: 'clipboard',
    label: t('clipboard.title') || '剪贴板',
    icon: 'ti ti-clipboard-text'
  }, {
    id: 'favorites',
    label: t('favorites.title') || '收藏',
    icon: 'ti ti-star'
  }, {
    id: 'emoji',
    label: t('emoji.title') || '符号',
    icon: 'ti ti-mood-smile'
  }];

  const emojiModes = [{
    id: 'emoji',
    label: t('emoji.emoji') || 'Emoji',
    icon: 'ti ti-mood-smile',
    emoji: '😀'
  }, {
    id: 'symbols',
    label: t('emoji.symbols') || '符号',
    icon: 'ti ti-math-symbols'
  }, {
    id: 'images',
    label: t('emoji.images') || '图片',
    icon: 'ti ti-photo-star'
  }];

  const filters = [{
    id: 'all',
    label: t('filter.all') || '全部',
    icon: "ti ti-category"
  }, {
    id: 'text',
    label: t('filter.text') || '文本',
    icon: "ti ti-file-text"
  }, {
    id: 'image',
    label: t('filter.image') || '图片',
    icon: "ti ti-photo"
  }, {
    id: 'file',
    label: t('filter.file') || '文件',
    icon: "ti ti-folder"
  }, {
    id: 'link',
    label: t('filter.link') || '链接',
    icon: "ti ti-link"
  }];

  const updateTabIndicator = useCallback(() => {
    const activeElement = tabsRef.current[activeTab];
    if (activeElement) {
      setTabIndicator({
        width: activeElement.offsetWidth,
        left: activeElement.offsetLeft
      });
    }
  }, [activeTab]);

  const updateFilterIndicator = useCallback(() => {
    const activeElement = filtersRef.current[contentFilter];
    if (activeElement) {
      setFilterIndicator({
        width: activeElement.offsetWidth,
        left: activeElement.offsetLeft
      });
    }
  }, [contentFilter]);

  const updateEmojiModeIndicator = useCallback(() => {
    const activeElement = emojiModesRef.current[emojiMode];
    if (activeElement) {
      setEmojiModeIndicator({
        width: activeElement.offsetWidth,
        left: activeElement.offsetLeft
      });
    }
  }, [emojiMode]);

  useEffect(() => {
    updateTabIndicator();
    setTimeout(() => {
      setTabAnimationKey(prev => prev + 1);
    }, 300);
  }, [updateTabIndicator]);

  useEffect(() => {
    updateFilterIndicator();
    setTimeout(() => {
      setFilterAnimationKey(prev => prev + 1);
    }, 300);
  }, [updateFilterIndicator]);

  useEffect(() => {
    updateEmojiModeIndicator();
    setTimeout(() => {
      setEmojiModeAnimationKey(prev => prev + 1);
    }, 300);
  }, [updateEmojiModeIndicator]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      updateTabIndicator();
      updateFilterIndicator();
      updateEmojiModeIndicator();
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateTabIndicator, updateFilterIndicator, updateEmojiModeIndicator]);

  const handleEmojiModeChange = (id) => {
    onEmojiModeChange(id);
  };

  return <div className="tab-navigation flex-shrink-0 bg-gray-100 dark:bg-gray-900 border-b border-gray-300/80 dark:border-gray-700/30 shadow-sm transition-colors duration-500 tab-bar">
    <div className="flex items-stretch h-9 whitespace-nowrap">
      {/* 左侧：标签切换 - 50% */}
      <div className="flex-1 flex items-center px-2 relative">
        <div className="flex items-center justify-center gap-1 w-full relative">
          {/* 滑动指示器 */}
          <div className={`absolute rounded-lg pointer-events-none ${uiAnimationEnabled ? 'transition-all duration-300 ease-out' : ''}`} style={{
            width: `${tabIndicator.width}px`,
            height: '28px',
            left: `${tabIndicator.left}px`,
            top: '50%',
            transform: 'translateY(-50%)'
          }}>
            <div key={`tab-bounce-${tabAnimationKey}`} className={`w-full h-full rounded-lg bg-blue-500 ${uiAnimationEnabled ? 'animate-button-bounce' : ''}`} />
          </div>
          {tabs.map((tab, index) => <TabButton key={tab.id} id={tab.id} label={tab.label} icon={tab.icon} isActive={activeTab === tab.id} onClick={onTabChange} index={index} buttonRef={el => tabsRef.current[tab.id] = el} />)}
        </div>
      </div>

      {/* 分隔线 */}
      <div className="w-px bg-gray-400/60 dark:bg-gray-600/60 my-1.5" />

      {/* 右侧：内容筛选，Emoji/符号切换 - 50% */}
      <div className="flex-1 flex items-center px-1 relative">
        <div className={`flex items-center justify-center gap-1 relative ${activeTab === 'emoji' ? 'w-full' : 'mx-auto'}`}>
          {/* 滑动指示器 */}
          <div className={`absolute rounded-lg pointer-events-none ${uiAnimationEnabled ? 'transition-all duration-300 ease-out' : ''}`} style={{
            width: `${activeTab === 'emoji' ? emojiModeIndicator.width : filterIndicator.width}px`,
            height: '28px',
            left: `${activeTab === 'emoji' ? emojiModeIndicator.left : filterIndicator.left}px`,
            top: '50%',
            transform: 'translateY(-50%)'
          }}>
            <div key={activeTab === 'emoji' ? `emoji-mode-bounce-${emojiModeAnimationKey}` : `filter-bounce-${filterAnimationKey}`} className={`w-full h-full rounded-lg bg-blue-500 ${uiAnimationEnabled ? 'animate-button-bounce' : ''}`} />
          </div>
          {activeTab === 'emoji'
            ? emojiModes.map(mode => (
                <div key={mode.id} ref={el => emojiModesRef.current[mode.id] = el} className="relative flex-1 h-7">
                  <button
                    onClick={() => handleEmojiModeChange(mode.id)}
                    title={mode.label}
                    className={`relative z-10 flex items-center justify-center w-full h-full rounded-lg focus:outline-none ${uiAnimationEnabled ? 'hover:scale-105' : ''} ${
                      emojiMode === mode.id
                        ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
                        : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                    style={uiAnimationEnabled ? {
                      transitionProperty: 'transform, box-shadow, background-color, color',
                      transitionDuration: '200ms, 200ms, 500ms, 500ms'
                    } : {}}
                  >
                    {mode.emoji ? <span style={{ fontSize: 16 }}>{mode.emoji}</span> : <i className={mode.icon} style={{ fontSize: 16 }} />}
                  </button>
                </div>
              ))
            : filters.map(filter => <FilterButton key={filter.id} id={filter.id} label={filter.label} icon={filter.icon} isActive={contentFilter === filter.id} onClick={onFilterChange} buttonRef={el => filtersRef.current[filter.id] = el} />)
          }
        </div>
      </div>
    </div>
  </div>;
}
export default TabNavigation;
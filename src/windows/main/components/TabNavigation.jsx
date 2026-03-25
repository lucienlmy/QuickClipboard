import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import TabButton from './TabButton';
import FilterButton from './FilterButton';
import GroupsPopup from './GroupsPopup';
import Tooltip from '@shared/components/common/Tooltip.jsx';

const FILTER_BUTTON_SIZE = 28;
const FILTER_BUTTON_GAP = 4;
const GROUP_BUTTON_WIDTH = 60;
const RIGHT_SECTION_PADDING = 8;
const FILTER_MEDIUM_MIN_WIDTH = FILTER_BUTTON_SIZE * 4 + FILTER_BUTTON_GAP * 4 + GROUP_BUTTON_WIDTH + RIGHT_SECTION_PADDING;
const FILTER_FULL_MIN_WIDTH = FILTER_BUTTON_SIZE * 5 + FILTER_BUTTON_GAP * 5 + GROUP_BUTTON_WIDTH + RIGHT_SECTION_PADDING;
const FILTER_IDS = ['all', 'text', 'image', 'file', 'link'];

function TabNavigation({
  activeTab,
  onTabChange,
  contentFilter,
  onFilterChange,
  emojiMode,
  onEmojiModeChange,
  onGroupChange,
  groupsPopupRef
}) {
  const {
    t
  } = useTranslation();
  const settings = useSnapshot(settingsStore);
  const uiAnimationEnabled = settings.uiAnimationEnabled !== false;
  const tabsRef = useRef({});
  const filtersRef = useRef({});
  const emojiModesRef = useRef({});
  const rightAreaRef = useRef(null);
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
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [collapsedVisibleFilterCount, setCollapsedVisibleFilterCount] = useState(3);

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

  const isFilterAutoExpanded = collapsedVisibleFilterCount >= 5;
  const shouldExpandFilters = isFilterAutoExpanded || isFilterExpanded;
  const shouldHideGroupButton = !isFilterAutoExpanded && shouldExpandFilters;
  const expandableFilters = filters.slice(collapsedVisibleFilterCount);
  const expandedExtraWidth = expandableFilters.length > 0
    ? expandableFilters.length * FILTER_BUTTON_SIZE + (expandableFilters.length - 1) * FILTER_BUTTON_GAP
    : 0;

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
    const activeFilterIndex = FILTER_IDS.indexOf(contentFilter);
    const isHiddenInCollapsedState = !shouldExpandFilters && activeFilterIndex >= collapsedVisibleFilterCount;

    if (isHiddenInCollapsedState) {
      setFilterIndicator({
        width: 0,
        left: 0
      });
      return;
    }

    if (!activeElement) {
      return;
    }

    setFilterIndicator({
      width: activeElement.offsetWidth,
      left: activeElement.offsetLeft
    });
  }, [contentFilter, shouldExpandFilters, collapsedVisibleFilterCount]);

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
  }, [updateFilterIndicator, activeTab]);

  useEffect(() => {
    if (activeTab === 'emoji') {
      return undefined;
    }
    const timer = setTimeout(() => {
      setFilterAnimationKey(prev => prev + 1);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [contentFilter, activeTab]);

  useEffect(() => {
    updateEmojiModeIndicator();
    setTimeout(() => {
      setEmojiModeAnimationKey(prev => prev + 1);
    }, 300);
  }, [updateEmojiModeIndicator]);

  useEffect(() => {
    setIsFilterExpanded(false);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'emoji') {
      setCollapsedVisibleFilterCount(3);
      return undefined;
    }

    const target = rightAreaRef.current;
    if (!target) {
      return undefined;
    }

    const updateAutoExpanded = () => {
      const width = target.clientWidth;
      const nextCollapsedVisibleCount = width >= FILTER_FULL_MIN_WIDTH
        ? 5
        : width >= FILTER_MEDIUM_MIN_WIDTH
          ? 4
          : 3;
      setCollapsedVisibleFilterCount(prev => (prev === nextCollapsedVisibleCount ? prev : nextCollapsedVisibleCount));
    };

    updateAutoExpanded();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateAutoExpanded);
      return () => {
        window.removeEventListener('resize', updateAutoExpanded);
      };
    }

    const observer = new ResizeObserver(() => {
      updateAutoExpanded();
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [activeTab]);

  useEffect(() => {
    if (isFilterAutoExpanded) {
      setIsFilterExpanded(false);
    }
  }, [isFilterAutoExpanded]);

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

  const handleFilterAreaMouseEnter = () => {
    if (isFilterAutoExpanded) {
      return;
    }
    setIsFilterExpanded(true);
  };

  const handleFilterAreaMouseLeave = () => {
    if (isFilterAutoExpanded) {
      return;
    }
    setIsFilterExpanded(false);
  };

  return <div className="tab-navigation flex-shrink-0 bg-qc-panel border-b border-qc-border shadow-sm transition-colors duration-500 tab-bar">
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
      <div
        className="w-[1.5px] my-1.5 shrink-0"
        style={{ backgroundColor: 'var(--bg-titlebar-border, var(--qc-border-strong))', opacity: 0.95 }}
      />

      {/* 右侧：内容筛选，Emoji/符号切换 - 50% */}
      <div ref={rightAreaRef} className="tab-navigation-right flex-1 flex items-center pl-1 pr-0 relative">
        <div
          className={`flex items-center justify-center gap-1 relative ${
            activeTab === 'emoji' || isFilterAutoExpanded ? 'w-full' : 'mx-auto'
          }`}
          onMouseLeave={activeTab === 'emoji' ? undefined : handleFilterAreaMouseLeave}
        >
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
                  <Tooltip content={mode.label} placement="bottom" asChild>
                    <button
                      onClick={() => handleEmojiModeChange(mode.id)}
                      className={`relative z-10 flex items-center justify-center w-full h-full rounded-lg focus:outline-none ${uiAnimationEnabled ? 'hover:scale-105' : ''} ${
                        emojiMode === mode.id
                          ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
                          : 'text-qc-fg-muted hover:bg-qc-hover'
                      }`}
                      style={uiAnimationEnabled ? {
                        transitionProperty: 'transform, box-shadow, background-color, color',
                        transitionDuration: '200ms, 200ms, 500ms, 500ms'
                      } : {}}
                    >
                      {mode.emoji ? <span style={{ fontSize: 16 }}>{mode.emoji}</span> : <i className={mode.icon} style={{ fontSize: 16 }} />}
                    </button>
                  </Tooltip>
                </div>
              ))
            : (
                <>
                  {isFilterAutoExpanded ? (
                    <div className="flex items-center justify-evenly flex-1" onMouseEnter={handleFilterAreaMouseEnter}>
                      {filters.map(filter => (
                        <FilterButton
                          key={filter.id}
                          id={filter.id}
                          label={filter.label}
                          icon={filter.icon}
                          isActive={contentFilter === filter.id}
                          onClick={onFilterChange}
                          buttonRef={el => {
                            filtersRef.current[filter.id] = el;
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1" onMouseEnter={handleFilterAreaMouseEnter}>
                      {filters.slice(0, collapsedVisibleFilterCount).map(filter => (
                        <FilterButton
                          key={filter.id}
                          id={filter.id}
                          label={filter.label}
                          icon={filter.icon}
                          isActive={contentFilter === filter.id}
                          onClick={onFilterChange}
                          buttonRef={el => {
                            filtersRef.current[filter.id] = el;
                          }}
                        />
                      ))}

                      <div
                        className={`flex items-center gap-1 overflow-hidden shrink-0 ${uiAnimationEnabled ? 'transition-all duration-300 ease-out' : ''}`}
                        style={{
                          width: shouldExpandFilters ? `${expandedExtraWidth}px` : '0px',
                          opacity: shouldExpandFilters ? 1 : 0,
                          pointerEvents: shouldExpandFilters ? 'auto' : 'none'
                        }}
                      >
                        {expandableFilters.map(filter => (
                          <FilterButton
                            key={filter.id}
                            id={filter.id}
                            label={filter.label}
                            icon={filter.icon}
                            isActive={contentFilter === filter.id}
                            onClick={onFilterChange}
                            buttonRef={el => {
                              filtersRef.current[filter.id] = el;
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    className={`overflow-visible shrink-0 ${uiAnimationEnabled ? 'transition-all duration-300 ease-out' : ''}`}
                    style={{
                      width: shouldHideGroupButton ? '0px' : `${GROUP_BUTTON_WIDTH}px`,
                      opacity: shouldHideGroupButton ? 0 : 1,
                      pointerEvents: shouldHideGroupButton ? 'none' : 'auto'
                    }}
                  >
                    <GroupsPopup
                      ref={groupsPopupRef}
                      activeTab={activeTab}
                      onTabChange={onTabChange}
                      onGroupChange={onGroupChange}
                      mode="tab"
                    />
                  </div>
                </>
              )
          }
        </div>
      </div>
    </div>
  </div>;
}
export default TabNavigation;

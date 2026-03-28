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
  groupsPopupRef,
  navigationMode = 'horizontal'
}) {
  const {
    t
  } = useTranslation();
  const settings = useSnapshot(settingsStore);
  const uiAnimationEnabled = settings.uiAnimationEnabled !== false;
  const isSidebarLayout = navigationMode === 'sidebar';
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isGroupsPanelOpen, setIsGroupsPanelOpen] = useState(false);
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
  const groupButtonWidth = isSidebarLayout ? 92 : GROUP_BUTTON_WIDTH;
  const sidebarShowLabel = isSidebarLayout ? !isSidebarCollapsed : true;

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
    if (isSidebarLayout) {
      return undefined;
    }

    updateTabIndicator();
    setTimeout(() => {
      setTabAnimationKey(prev => prev + 1);
    }, 300);
  }, [updateTabIndicator, isSidebarLayout]);

  useEffect(() => {
    if (!isSidebarLayout) {
      setIsSidebarCollapsed(false);
    }
  }, [isSidebarLayout]);

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
      if (!isSidebarLayout) {
        updateTabIndicator();
      }
      updateFilterIndicator();
      updateEmojiModeIndicator();
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateTabIndicator, updateFilterIndicator, updateEmojiModeIndicator, isSidebarLayout]);

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

  const renderSidebarButton = ({
    id,
    label,
    icon,
    emoji,
    isActive,
    onClick,
    buttonRef,
    showLabel = true
  }) => {
    const handleClick = () => {
      onClick(id);
    };

    return (
      <div ref={buttonRef} className={showLabel ? 'relative inline-flex h-9 w-full' : 'relative inline-flex h-9 w-10'}>
        <Tooltip content={label} placement="right" asChild>
          <button
            onClick={handleClick}
            className={`
              relative z-10 flex items-center h-9 rounded-lg
              ${showLabel ? 'justify-start gap-2 px-3 w-full whitespace-nowrap' : 'justify-center gap-0 px-0 w-10'}
              focus:outline-none
              ${uiAnimationEnabled ? 'hover:scale-[1.01]' : ''}
              ${isActive
                ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
                : 'text-qc-fg-muted hover:bg-qc-hover'}
            `}
            style={uiAnimationEnabled ? {
              transitionProperty: 'transform, box-shadow, background-color, color',
              transitionDuration: '200ms, 200ms, 500ms, 500ms'
            } : {}}
          >
            {emoji ? <span style={{ fontSize: 16 }}>{emoji}</span> : <i className={icon} style={{ fontSize: 16 }} />}
            {showLabel && (
              <span className="text-[12px] font-medium leading-none truncate">
                {label}
              </span>
            )}
          </button>
        </Tooltip>
      </div>
    );
  };

  if (isSidebarLayout) {
    return <div className="tab-navigation flex-shrink-0 h-full w-fit min-w-fit bg-qc-panel shadow-sm transition-colors duration-500 tab-bar">
      <div className="flex h-full min-h-0 w-fit">
        <div className="flex h-full min-h-0 flex-col w-fit border-r border-qc-border">
          <div className="grid grid-cols-[max-content] gap-1 p-2 pb-2 w-max justify-items-stretch">
            {tabs.map((tab, index) => (
              <TabButton
                key={tab.id}
                id={tab.id}
                label={tab.label}
                icon={tab.icon}
                isActive={activeTab === tab.id}
                onClick={onTabChange}
                index={index}
                buttonRef={el => { tabsRef.current[tab.id] = el; }}
                navigationMode="sidebar"
                showLabel={sidebarShowLabel}
              />
            ))}
          </div>

          <div
            className="mx-2 h-px shrink-0"
            style={{ backgroundColor: 'var(--bg-titlebar-border, var(--qc-border-strong))', opacity: 0.95 }}
          />

          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 w-max">
            <div className="grid grid-cols-[max-content] gap-1 w-max justify-items-stretch">
              {activeTab === 'emoji'
                ? emojiModes.map(mode => renderSidebarButton({
                    id: mode.id,
                    label: mode.label,
                    icon: mode.icon,
                    emoji: mode.emoji,
                    isActive: emojiMode === mode.id,
                    onClick: handleEmojiModeChange,
                    showLabel: sidebarShowLabel,
                    buttonRef: el => {
                      emojiModesRef.current[mode.id] = el;
                    }
                  }))
                : filters.map(filter => renderSidebarButton({
                    id: filter.id,
                    label: filter.label,
                    icon: filter.icon,
                    isActive: contentFilter === filter.id,
                    onClick: onFilterChange,
                    showLabel: sidebarShowLabel,
                    buttonRef: el => {
                      filtersRef.current[filter.id] = el;
                    }
                  }))
              }
            </div>
          </div>

          <div
            className="mx-2 h-px shrink-0"
            style={{ backgroundColor: 'var(--bg-titlebar-border, var(--qc-border-strong))', opacity: 0.95 }}
          />

          <div className="px-2 py-2">
            <Tooltip content="分组" placement="right" asChild>
              <button
                type="button"
                onClick={() => groupsPopupRef.current?.togglePopup?.()}
                className={`relative z-10 flex items-center h-9 rounded-lg focus:outline-none transition-all duration-200 ${
                  sidebarShowLabel
                    ? `justify-start gap-2 px-3 w-full ${
                        isGroupsPanelOpen
                          ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
                          : 'text-qc-fg-muted hover:bg-qc-hover'
                      }`
                    : `justify-start gap-2 px-3 w-10 overflow-hidden ${
                        isGroupsPanelOpen
                          ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
                          : 'text-qc-fg-muted hover:bg-qc-hover'
                      }`
                }`}
              >
                <i className="ti ti-folders" style={{ fontSize: 16 }} />
                {sidebarShowLabel && (
                  <span className="text-[12px] font-medium leading-none whitespace-nowrap">
                    分组
                  </span>
                )}
              </button>
            </Tooltip>
          </div>

          <div className="mt-auto p-2 pt-1">
            <Tooltip content={sidebarShowLabel ? '收起侧边栏' : '展开侧边栏'} placement="right" asChild>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(prev => !prev)}
                className={`relative z-10 flex items-center h-9 rounded-lg focus:outline-none transition-all duration-200 ${
                  sidebarShowLabel
                    ? 'justify-start gap-2 px-3 w-full text-qc-fg-muted hover:bg-qc-hover'
                    : 'justify-start gap-2 px-3 w-10 text-qc-fg-muted hover:bg-qc-hover overflow-hidden'
                }`}
              >
                <i
                  className={isSidebarCollapsed ? 'ti ti-layout-sidebar-right-expand' : 'ti ti-layout-sidebar-left-collapse'}
                  style={{ fontSize: 16 }}
                />
                {sidebarShowLabel && (
                  <span className="text-[12px] font-medium leading-none whitespace-nowrap">
                    收起
                  </span>
                )}
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex h-full min-h-0 shrink-0">
          <GroupsPopup
            ref={groupsPopupRef}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onGroupChange={onGroupChange}
            onOpenChange={setIsGroupsPanelOpen}
            mode="sidebar"
          />
        </div>
      </div>
    </div>;
  }

  return <div className={`tab-navigation flex-shrink-0 bg-qc-panel shadow-sm transition-colors duration-500 tab-bar ${
    isSidebarLayout
      ? 'w-[190px] min-w-[190px] h-full border-r border-qc-border'
      : 'border-b border-qc-border'
  }`}>
    <div className={isSidebarLayout ? 'flex h-full min-h-0 flex-col' : 'flex items-stretch h-9 whitespace-nowrap'}>
      <div className={isSidebarLayout ? 'flex flex-col gap-1 p-2 pb-1' : 'flex-1 flex items-center px-2 relative'}>
        <div className={isSidebarLayout ? 'flex flex-col gap-1 w-full' : 'flex items-center justify-center gap-1 w-full relative'}>
          {!isSidebarLayout && (
            <div className={`absolute rounded-lg pointer-events-none ${uiAnimationEnabled ? 'transition-all duration-300 ease-out' : ''}`} style={{
              width: `${tabIndicator.width}px`,
              height: '28px',
              left: `${tabIndicator.left}px`,
              top: '50%',
              transform: 'translateY(-50%)'
            }}>
              <div key={`tab-bounce-${tabAnimationKey}`} className={`w-full h-full rounded-lg bg-blue-500 ${uiAnimationEnabled ? 'animate-button-bounce' : ''}`} />
            </div>
          )}
          {tabs.map((tab, index) => <TabButton key={tab.id} id={tab.id} label={tab.label} icon={tab.icon} isActive={activeTab === tab.id} onClick={onTabChange} index={index} buttonRef={el => tabsRef.current[tab.id] = el} navigationMode={isSidebarLayout ? 'sidebar' : 'horizontal'} />)}
        </div>
      </div>

      {!isSidebarLayout && (
        <div
          className="w-[1.5px] my-1.5 shrink-0"
          style={{ backgroundColor: 'var(--bg-titlebar-border, var(--qc-border-strong))', opacity: 0.95 }}
        />
      )}

      <div ref={rightAreaRef} className={isSidebarLayout ? 'tab-navigation-right flex-1 flex items-end px-2 pb-2 relative' : 'tab-navigation-right flex-1 flex items-center pl-1 pr-0 relative'}>
        <div
          className={`flex items-center justify-center gap-1 relative ${
            activeTab === 'emoji' || isFilterAutoExpanded ? 'w-full' : 'mx-auto'
          }`}
          onMouseLeave={activeTab === 'emoji' ? undefined : handleFilterAreaMouseLeave}
        >
          {!isSidebarLayout && (
            <div className={`absolute rounded-lg pointer-events-none ${uiAnimationEnabled ? 'transition-all duration-300 ease-out' : ''}`} style={{
              width: `${activeTab === 'emoji' ? emojiModeIndicator.width : filterIndicator.width}px`,
              height: '28px',
              left: `${activeTab === 'emoji' ? emojiModeIndicator.left : filterIndicator.left}px`,
              top: '50%',
              transform: 'translateY(-50%)'
            }}>
              <div key={activeTab === 'emoji' ? `emoji-mode-bounce-${emojiModeAnimationKey}` : `filter-bounce-${filterAnimationKey}`} className={`w-full h-full rounded-lg bg-blue-500 ${uiAnimationEnabled ? 'animate-button-bounce' : ''}`} />
            </div>
          )}
          {activeTab === 'emoji'
            ? emojiModes.map(mode => (
                <div key={mode.id} ref={el => emojiModesRef.current[mode.id] = el} className="relative flex-1 h-7">
                  <Tooltip content={mode.label} placement={isSidebarLayout ? 'right' : 'bottom'} asChild>
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
                      width: shouldHideGroupButton ? '0px' : `${groupButtonWidth}px`,
                      opacity: shouldHideGroupButton ? 0 : 1,
                      pointerEvents: shouldHideGroupButton ? 'none' : 'auto'
                    }}
                  >
                    <GroupsPopup
                      ref={groupsPopupRef}
                      activeTab={activeTab}
                      onTabChange={onTabChange}
                      onGroupChange={onGroupChange}
                      mode={isSidebarLayout ? 'tab-sidebar' : 'tab'}
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

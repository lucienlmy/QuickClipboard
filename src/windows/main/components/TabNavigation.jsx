import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
import { chatStore } from '@shared/store/chatStore';
import TabButton from './TabButton';
import FilterButton from './FilterButton';
import GroupsPopup from './GroupsPopup';
import Tooltip from '@shared/components/common/Tooltip.jsx';

const FILTER_BUTTON_SIZE = 28;
const FILTER_BUTTON_GAP = 4;
const GROUP_BUTTON_WIDTH = 60;
const FILTER_IDS = ['all', 'text', 'image', 'file', 'link'];

function getCollapsedFilterWidth(filterCount, groupButtonWidth) {
  if (filterCount <= 0) {
    return groupButtonWidth;
  }

  return filterCount * FILTER_BUTTON_SIZE
    + (filterCount - 1) * FILTER_BUTTON_GAP
    + FILTER_BUTTON_GAP
    + groupButtonWidth;
}

function getVisibleFilterCountByWidth(width, groupButtonWidth) {
  for (let count = FILTER_IDS.length; count >= 1; count -= 1) {
    if (width >= getCollapsedFilterWidth(count, groupButtonWidth)) {
      return count;
    }
  }

  return 1;
}

function getChatDeviceDisplayName(device) {
  const name = typeof device?.device_name === 'string' ? device.device_name.trim() : '';
  if (name) return name;
  const id = typeof device?.device_id === 'string' ? device.device_id.trim() : '';
  return id;
}

function getChatDeviceTooltip(device) {
  const name = getChatDeviceDisplayName(device);
  const id = typeof device?.device_id === 'string' ? device.device_id.trim() : '';
  if (name && id && name !== id) {
    return `${name} (${id})`;
  }
  return name || id;
}

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
  const chat = useSnapshot(chatStore);
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
  const [sidebarFixedWidth, setSidebarFixedWidth] = useState(null);
  const [isChatDeviceDropdownOpen, setIsChatDeviceDropdownOpen] = useState(false);
  const sidebarTabsMainRef = useRef(null);
  const chatDropdownRef = useRef(null);
  const filterCollapseTimerRef = useRef(null);

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
  }, {
    id: 'chat',
    label: t('chat.title'),
    icon: 'ti ti-message-circle'
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
  const expandableFilters = filters.slice(collapsedVisibleFilterCount);
  const useFloatingExpandedFilters = !isFilterAutoExpanded && collapsedVisibleFilterCount <= 2 && expandableFilters.length > 0;
  const shouldExpandFilters = isFilterAutoExpanded || isFilterExpanded;
  const shouldHideGroupButton = !useFloatingExpandedFilters && !isFilterAutoExpanded && shouldExpandFilters;
  const expandedExtraWidth = expandableFilters.length > 0
    ? expandableFilters.length * FILTER_BUTTON_SIZE + (expandableFilters.length - 1) * FILTER_BUTTON_GAP
    : 0;
  const groupButtonWidth = isSidebarLayout ? 92 : GROUP_BUTTON_WIDTH;
  const sidebarShowLabel = isSidebarLayout ? !isSidebarCollapsed : true;
  const unreadByDevice = chat.unreadByDevice || {};
  const totalChatUnread = Object.values(unreadByDevice).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const currentChatDevice = chat.connectedDevices.find((d) => d.device_id === chat.currentDeviceId) || null;

  const getBadgeText = (count) => {
    const n = Number(count) || 0;
    if (n <= 0) return '';
    return n > 99 ? '99+' : String(n);
  };

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
    return () => {
      if (filterCollapseTimerRef.current) {
        clearTimeout(filterCollapseTimerRef.current);
        filterCollapseTimerRef.current = null;
      }
    };
  }, []);

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
    if (isSidebarLayout) {
      setCollapsedVisibleFilterCount(FILTER_IDS.length);
      return undefined;
    }

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
      const nextCollapsedVisibleCount = getVisibleFilterCountByWidth(width, groupButtonWidth);
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
  }, [activeTab, isSidebarLayout, groupButtonWidth]);

  useEffect(() => {
    if (isFilterAutoExpanded) {
      setIsFilterExpanded(false);
    }
  }, [isFilterAutoExpanded]);

  useEffect(() => {
    if (!isSidebarLayout) {
      setSidebarFixedWidth(null);
      return;
    }

    const updateSidebarWidth = () => {
      const el = sidebarTabsMainRef.current;
      if (!el) return;
      const width = Math.ceil(el.getBoundingClientRect().width);
      if (Number.isFinite(width) && width > 0) {
        setSidebarFixedWidth(width);
      }
    };

    updateSidebarWidth();
    const id = requestAnimationFrame(updateSidebarWidth);
    window.addEventListener('resize', updateSidebarWidth);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', updateSidebarWidth);
    };
  }, [isSidebarLayout, sidebarShowLabel, tabs.length]);

  useEffect(() => {
    if (activeTab !== 'chat') {
      setIsChatDeviceDropdownOpen(false);
      return;
    }
    chatStore.init();
    chatStore.refreshDevices();
  }, [activeTab]);

  useEffect(() => {
    if (!isChatDeviceDropdownOpen) return;
    const onPointerDown = (event) => {
      if (!chatDropdownRef.current) return;
      if (!chatDropdownRef.current.contains(event.target)) {
        setIsChatDeviceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isChatDeviceDropdownOpen]);

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
    if (filterCollapseTimerRef.current) {
      clearTimeout(filterCollapseTimerRef.current);
      filterCollapseTimerRef.current = null;
    }
    setIsFilterExpanded(true);
  };

  const handleFilterAreaMouseLeave = (event) => {
    if (isFilterAutoExpanded) {
      return;
    }
    const nextTarget = event?.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    if (filterCollapseTimerRef.current) {
      clearTimeout(filterCollapseTimerRef.current);
    }
    filterCollapseTimerRef.current = setTimeout(() => {
      setIsFilterExpanded(false);
      filterCollapseTimerRef.current = null;
    }, 180);
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
              ${showLabel ? 'justify-start gap-2 px-3 w-full min-w-0 whitespace-nowrap' : 'justify-center gap-0 px-0 w-10'}
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
              <span className="text-[12px] font-medium leading-none truncate flex-1 min-w-0 text-left">
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
        <div
          className="flex h-full min-h-0 flex-col border-r border-qc-border"
          style={sidebarFixedWidth ? { width: `${sidebarFixedWidth}px`, minWidth: `${sidebarFixedWidth}px` } : undefined}
        >
          <div ref={sidebarTabsMainRef} className="grid grid-cols-[max-content] gap-1 p-2 pb-2 w-max justify-items-stretch">
            {tabs.map((tab, index) => (
              <TabButton
                key={tab.id}
                id={tab.id}
                label={tab.label}
                icon={tab.icon}
                badgeCount={tab.id === 'chat' ? totalChatUnread : 0}
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

          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 w-full min-w-0">
            <div className="grid grid-cols-1 gap-1 w-full min-w-0 justify-items-stretch">
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
                : activeTab === 'chat'
                  ? (
                    <>
                      {chat.connectedDevices.length === 0 ? (
                        <Tooltip content={t('chat.device.none')} placement="right" asChild>
                          <div
                            className={`h-9 rounded-lg border border-dashed border-qc-border text-qc-fg-muted text-[12px] ${
                              sidebarShowLabel ? 'w-full px-3 flex items-center' : 'w-10 flex items-center justify-center'
                            }`}
                          >
                            {sidebarShowLabel ? t('chat.device.none') : <i className="ti ti-plug-x" style={{ fontSize: 14 }} />}
                          </div>
                        </Tooltip>
                      ) : (
                        chat.connectedDevices.map((d) => {
                          const isActive = chat.currentDeviceId === d.device_id;
                          return (
                            <Tooltip key={d.device_id} content={getChatDeviceTooltip(d)} placement="right" asChild>
                              <button
                                type="button"
                                onClick={() => chatStore.selectDevice(d.device_id)}
                                className={`relative z-10 flex items-center h-9 rounded-lg focus:outline-none transition-all duration-200 ${
                                  sidebarShowLabel
                                    ? 'justify-start gap-2 px-3 w-full min-w-0 whitespace-nowrap'
                                    : 'justify-center gap-0 px-0 w-10'
                                } ${
                                  isActive
                                    ? 'bg-blue-500 text-white shadow-md hover:bg-blue-500'
                                    : 'text-qc-fg-muted hover:bg-qc-hover'
                                }`}
                              >
                                <i className="ti ti-device-desktop" style={{ fontSize: 16 }} />
                                {sidebarShowLabel && (
                                  <span className="text-[12px] font-medium leading-none truncate flex-1 min-w-0 text-left">
                                    {getChatDeviceDisplayName(d)}
                                  </span>
                                )}
                                {(Number(unreadByDevice[d.device_id]) || 0) > 0 && (
                                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
                                    {getBadgeText(Number(unreadByDevice[d.device_id]) || 0)}
                                  </span>
                                )}
                              </button>
                            </Tooltip>
                          );
                        })
                      )}
                    </>
                  )
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

          {activeTab !== 'chat' && (
            <>
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
            </>
          )}

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
          {tabs.map((tab, index) => (
            <TabButton
              key={tab.id}
              id={tab.id}
              label={tab.label}
              icon={tab.icon}
              badgeCount={tab.id === 'chat' ? totalChatUnread : 0}
              isActive={activeTab === tab.id}
              onClick={onTabChange}
              index={index}
              buttonRef={el => tabsRef.current[tab.id] = el}
              navigationMode={isSidebarLayout ? 'sidebar' : 'horizontal'}
            />
          ))}
        </div>
      </div>

      {!isSidebarLayout && (
        <div
          className="w-[1.5px] my-1.5 shrink-0"
          style={{ backgroundColor: 'var(--bg-titlebar-border, var(--qc-border-strong))', opacity: 0.95 }}
        />
      )}

      <div ref={rightAreaRef} className={isSidebarLayout ? 'tab-navigation-right flex-1 flex items-end px-2 pb-2 relative min-w-0' : 'tab-navigation-right flex-1 flex items-center pl-1 pr-1 relative min-w-0'}>
        {activeTab === 'chat' ? (
          <div ref={chatDropdownRef} className="relative w-full min-w-0" data-no-drag>
            <button
              type="button"
              data-no-drag
              onClick={() => {
                if (chat.connectedDevices.length === 0) return;
                setIsChatDeviceDropdownOpen((prev) => !prev);
              }}
              className="w-full min-w-0 h-7 rounded-lg border border-qc-border bg-qc-panel text-qc-fg text-sm px-2 flex items-center justify-between hover:bg-qc-hover"
            >
              <span className="flex-1 min-w-0 truncate text-left pr-2">
                {currentChatDevice ? getChatDeviceDisplayName(currentChatDevice) : t('chat.device.none')}
              </span>
              <i className={`ti ${isChatDeviceDropdownOpen ? 'ti-chevron-up' : 'ti-chevron-down'} text-[14px] text-qc-fg-muted`} />
            </button>
            {isChatDeviceDropdownOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[80] max-h-56 overflow-y-auto rounded-lg border border-qc-border bg-qc-panel shadow-lg backdrop-blur-sm">
                {chat.connectedDevices.length === 0 ? (
                  <div className="h-8 px-2 text-xs text-qc-fg-muted flex items-center">
                    {t('chat.device.none')}
                  </div>
                ) : (
                  chat.connectedDevices.map((d) => {
                    const unread = Number(unreadByDevice[d.device_id]) || 0;
                    const isCurrent = chat.currentDeviceId === d.device_id;
                    return (
                      <button
                        key={d.device_id}
                        type="button"
                        data-no-drag
                        onClick={() => {
                          chatStore.selectDevice(d.device_id);
                          setIsChatDeviceDropdownOpen(false);
                        }}
                        className={`w-full h-8 px-2 text-left text-xs flex items-center gap-2 ${
                          isCurrent ? 'bg-blue-500 text-white' : 'text-qc-fg hover:bg-qc-hover'
                        }`}
                        title={getChatDeviceTooltip(d)}
                      >
                        <span className="flex-1 truncate">{getChatDeviceDisplayName(d)}</span>
                        {unread > 0 && (
                          <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center shrink-0">
                            {getBadgeText(unread)}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : (
        <div
          className={`flex min-w-0 max-w-full items-center gap-1 relative ${
            activeTab === 'emoji' || isFilterAutoExpanded
              ? 'w-full justify-center'
              : useFloatingExpandedFilters
                ? 'ml-auto overflow-visible'
                : 'ml-auto overflow-hidden'
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
            : activeTab === 'chat'
              ? null
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
                    <div className="relative flex items-center gap-1" onMouseEnter={handleFilterAreaMouseEnter}>
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

                      {useFloatingExpandedFilters ? (
                        <div
                          className={`absolute right-0 top-[calc(100%+6px)] z-[75] box-content flex w-7 flex-col items-center gap-1 rounded-lg border border-qc-border bg-qc-panel py-1 shadow-lg ${
                            uiAnimationEnabled ? 'transition-all duration-200 ease-out' : ''
                          }`}
                          style={{
                            opacity: shouldExpandFilters ? 1 : 0,
                            transform: shouldExpandFilters ? 'translateY(0)' : 'translateY(-4px)',
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
                              tooltipPlacement="left"
                              buttonRef={el => {
                                filtersRef.current[filter.id] = el;
                              }}
                            />
                          ))}
                        </div>
                      ) : (
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
                      )}
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
        )}
      </div>
    </div>
  </div>;
}
export default TabNavigation;

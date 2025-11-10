import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState, useCallback } from 'react';
import TabButton from './TabButton';
import FilterButton from './FilterButton';
function TabNavigation({
  activeTab,
  onTabChange,
  contentFilter,
  onFilterChange
}) {
  const {
    t
  } = useTranslation();
  const tabsRef = useRef({});
  const filtersRef = useRef({});
  const [tabIndicator, setTabIndicator] = useState({
    width: 0,
    left: 0
  });
  const [filterIndicator, setFilterIndicator] = useState({
    width: 0,
    left: 0
  });
  const [tabAnimationKey, setTabAnimationKey] = useState(0);
  const [filterAnimationKey, setFilterAnimationKey] = useState(0);
  const tabs = [{
    id: 'clipboard',
    label: t('clipboard.title') || '剪贴板'
  }, {
    id: 'favorites',
    label: t('favorites.title') || '收藏'
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

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      updateTabIndicator();
      updateFilterIndicator();
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updateTabIndicator, updateFilterIndicator]);
  return <div className="tab-navigation flex-shrink-0 bg-gray-100 dark:bg-gray-900 border-b border-gray-300/80 dark:border-gray-700/30 shadow-sm transition-colors duration-500 tab-bar">
    <div className="flex items-stretch h-9">
      {/* 左侧：标签切换 - 50% */}
      <div className="flex-1 flex items-center px-2 relative">
        <div className="flex items-center justify-center gap-1 w-full relative">
          {/* 滑动指示器 */}
          <div className="absolute rounded-lg transition-all duration-300 ease-out pointer-events-none" style={{
            width: `${tabIndicator.width}px`,
            height: '28px',
            left: `${tabIndicator.left}px`,
            top: '50%',
            transform: 'translateY(-50%)'
          }}>
            <div key={`tab-bounce-${tabAnimationKey}`} className="w-full h-full rounded-lg bg-blue-500 animate-button-bounce" />
          </div>
          {tabs.map((tab, index) => <TabButton key={tab.id} id={tab.id} label={tab.label} isActive={activeTab === tab.id} onClick={onTabChange} index={index} buttonRef={el => tabsRef.current[tab.id] = el} />)}
        </div>
      </div>

      {/* 分隔线 */}
      <div className="w-px bg-gray-400/60 dark:bg-gray-600/60 my-1.5" />

      {/* 右侧：内容筛选 - 50% */}
      <div className="flex-1 flex items-center px-2 relative">
        <div className="flex items-center justify-center gap-1 mx-auto relative">
          {/* 滑动指示器 */}
          <div className="absolute rounded-lg transition-all duration-300 ease-out pointer-events-none" style={{
            width: `${filterIndicator.width}px`,
            height: '28px',
            left: `${filterIndicator.left}px`,
            top: '50%',
            transform: 'translateY(-50%)'
          }}>
            <div key={`filter-bounce-${filterAnimationKey}`} className="w-full h-full rounded-lg bg-blue-500 animate-button-bounce" />
          </div>
          {filters.map(filter => <FilterButton key={filter.id} id={filter.id} label={filter.label} icon={filter.icon} isActive={contentFilter === filter.id} onClick={onFilterChange} buttonRef={el => filtersRef.current[filter.id] = el} />)}
        </div>
      </div>
    </div>
  </div>;
}
export default TabNavigation;
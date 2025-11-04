import { IconCategory, IconFileText, IconPhoto, IconFolder, IconLink } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { useRef, useEffect, useState, useCallback } from 'react'

function TabNavigation({ activeTab, onTabChange, contentFilter, onFilterChange }) {
  const { t } = useTranslation()
  const tabsRef = useRef({})
  const filtersRef = useRef({})
  const [tabIndicator, setTabIndicator] = useState({ width: 0, left: 0 })
  const [filterIndicator, setFilterIndicator] = useState({ width: 0, left: 0 })

  const tabs = [
    { id: 'clipboard', label: t('clipboard.title') || '剪贴板' },
    { id: 'favorites', label: t('favorites.title') || '收藏' }
  ]

  const filters = [
    { id: 'all', label: t('filter.all') || '全部', icon: IconCategory },
    { id: 'text', label: t('filter.text') || '文本', icon: IconFileText },
    { id: 'image', label: t('filter.image') || '图片', icon: IconPhoto },
    { id: 'file', label: t('filter.file') || '文件', icon: IconFolder },
    { id: 'link', label: t('filter.link') || '链接', icon: IconLink }
  ]

  const updateTabIndicator = useCallback(() => {
    const activeElement = tabsRef.current[activeTab]
    if (activeElement) {
      setTabIndicator({
        width: activeElement.offsetWidth,
        left: activeElement.offsetLeft
      })
    }
  }, [activeTab])

  const updateFilterIndicator = useCallback(() => {
    const activeElement = filtersRef.current[contentFilter]
    if (activeElement) {
      setFilterIndicator({
        width: activeElement.offsetWidth,
        left: activeElement.offsetLeft
      })
    }
  }, [contentFilter])

  useEffect(() => {
    updateTabIndicator()
  }, [updateTabIndicator])

  useEffect(() => {
    updateFilterIndicator()
  }, [updateFilterIndicator])

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      updateTabIndicator()
      updateFilterIndicator()
    }

    window.addEventListener('resize', handleResize)
    
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [updateTabIndicator, updateFilterIndicator])

  return (
    <div className="tab-navigation flex-shrink-0 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-300/80 dark:border-gray-700/30 shadow-sm">
      <div className="flex items-stretch h-9">
        {/* 左侧：标签切换 - 50% */}
        <div className="flex-1 flex items-center px-2 relative">
          <div className="flex items-center justify-center gap-1 w-full relative">
            {/* 滑动指示器 */}
            <div
              className="absolute bg-blue-500 rounded-lg transition-all duration-300 ease-out pointer-events-none"
              style={{
                width: `${tabIndicator.width}px`,
                height: '28px',
                left: `${tabIndicator.left}px`,
                top: '50%',
                transform: 'translateY(-50%)'
              }}
            />
            {tabs.map(tab => (
              <button
                key={tab.id}
                ref={el => tabsRef.current[tab.id] = el}
                onClick={() => onTabChange(tab.id)}
                className={`relative z-10 flex-1 max-w-[140px] py-1 text-sm font-medium rounded-lg transition-all duration-200 focus:outline-none active:scale-100 ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40 hover:shadow-sm'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 分隔线 */}
        <div className="w-px bg-gradient-to-b from-transparent via-gray-400/60 to-transparent dark:via-gray-600/60 my-1.5" />

        {/* 右侧：内容筛选 - 50% */}
        <div className="flex-1 flex items-center px-2 relative">
          <div className="flex items-center justify-center gap-1 mx-auto relative">
            {/* 滑动指示器 */}
            <div
              className="absolute bg-blue-500 rounded-lg transition-all duration-300 ease-out pointer-events-none"
              style={{
                width: `${filterIndicator.width}px`,
                height: '28px',
                left: `${filterIndicator.left}px`,
                top: '50%',
                transform: 'translateY(-50%)'
              }}
            />
            {filters.map(filter => {
              const Icon = filter.icon
              return (
                <button
                  key={filter.id}
                  ref={el => filtersRef.current[filter.id] = el}
                  onClick={() => onFilterChange(filter.id)}
                  title={filter.label}
                  className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200 focus:outline-none active:scale-100 ${
                    contentFilter === filter.id
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-gray-700/40 hover:shadow-sm hover:scale-105 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon size={16} />
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TabNavigation


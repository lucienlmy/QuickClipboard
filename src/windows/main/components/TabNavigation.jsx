import { IconCategory, IconFileText, IconPhoto, IconFolder, IconLink } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

function TabNavigation({ activeTab, onTabChange, contentFilter, onFilterChange }) {
  const { t } = useTranslation()

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

  return (
    <div className="tab-navigation flex-shrink-0 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-300/80 dark:border-gray-700/30 shadow-sm">
      <div className="flex items-stretch h-9">
        {/* 左侧：标签切换 - 50% */}
        <div className="flex-1 flex items-center justify-center gap-1 px-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 max-w-[140px] py-1 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-700/60 hover:shadow-sm hover:scale-102'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 分隔线 */}
        <div className="w-px bg-gradient-to-b from-transparent via-gray-400/60 to-transparent dark:via-gray-600/60 my-1.5" />

        {/* 右侧：内容筛选 - 50% */}
        <div className="flex-1 flex items-center justify-center gap-1 px-2">
          {filters.map(filter => {
            const Icon = filter.icon
            return (
              <button
                key={filter.id}
                onClick={() => onFilterChange(filter.id)}
                title={filter.label}
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200 ${
                  contentFilter === filter.id
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white/80 dark:hover:bg-gray-700/60 hover:shadow-sm hover:scale-105 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Icon size={16} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TabNavigation


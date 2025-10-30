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
    <div className="flex-shrink-0 bg-gray-200 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
      <div className="flex items-stretch h-11">
        {/* 左侧：标签切换 - 50% */}
        <div className="flex-1 flex items-center justify-center gap-1 px-3">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 max-w-[140px] py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 分隔线 */}
        <div className="w-px bg-gray-300 dark:bg-gray-600 my-2" />

        {/* 右侧：内容筛选 - 50% */}
        <div className="flex-1 flex items-center justify-center gap-1 px-3">
          {filters.map(filter => {
            const Icon = filter.icon
            return (
              <button
                key={filter.id}
                onClick={() => onFilterChange(filter.id)}
                title={filter.label}
                className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
                  contentFilter === filter.id
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <Icon size={18} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TabNavigation


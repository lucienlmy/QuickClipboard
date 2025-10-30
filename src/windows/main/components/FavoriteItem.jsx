import { pasteFavorite } from '@shared/store/favoritesStore'
import { useItemCommon } from '@shared/hooks/useItemCommon.jsx'

function FavoriteItem({ item, index }) {
  const {
    settings,
    getHeightClass,
    contentType,
    formatTime,
    renderContent
  } = useItemCommon(item)
  
  // 点击粘贴
  const handleClick = async () => {
    try {
      await pasteFavorite(item.id)
    } catch (err) {
      console.error('粘贴收藏项失败:', err)
    }
  }

  // 判断是否显示标题（纯文本和富文本显示标题）
  const shouldShowTitle = () => {
    return (contentType === 'text' || contentType === 'rich_text') && item.title
  }

  // 小行高模式（不显示标题）
  if (settings.rowHeight === 'small') {
    return (
      <div
        className={`group relative flex flex-col px-2.5 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700/50 rounded-md cursor-pointer transition-all border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm ${getHeightClass()}`}
        onClick={handleClick}
      >
        {/* 浮动的序号 */}
        <div className="absolute top-1 right-2 pointer-events-none">
          <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-1 py-0.5 rounded-lg font-semibold min-w-[16px] text-center leading-tight">
            {index + 1}
          </span>
        </div>

        {/* 内容区域 */}
        <div className="flex items-center gap-2 h-full overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden h-full">
            {renderContent(true)}
          </div>
        </div>
      </div>
    )
  }

  // 中/大行高模式
  return (
    <div
      className={`group relative flex flex-col px-2.5 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700/50 rounded-md cursor-pointer transition-all border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm ${getHeightClass()}`}
      onClick={handleClick}
    >
      {/* 浮动的序号 */}
      <div className="absolute top-1 right-2 pointer-events-none">
        <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-1 py-0.5 rounded-lg font-semibold min-w-[16px] text-center leading-tight">
          {index + 1}
        </span>
      </div>

      {/* 时间戳 */}
      <div className="flex-shrink-0 mb-0.5">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatTime()}
        </span>
      </div>

      {/* 标题（如果有） */}
      {shouldShowTitle() && (
        <div className="flex-shrink-0 mb-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate pr-16">
            {item.title}
          </p>
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex items-center gap-2 flex-1 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden h-full">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

export default FavoriteItem

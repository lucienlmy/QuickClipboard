import { pasteClipboardItem } from '@shared/api'
import { useItemCommon } from '@shared/hooks/useItemCommon.jsx'
import { useSortable, CSS } from '@shared/hooks/useSortable'

function ClipboardItem({ item, index, onClick, sortId }) {
  const {
    settings,
    getHeightClass,
    getLineClampClass,
    contentType,
    formatTime,
    renderContent
  } = useItemCommon(item)
  
  // 拖拽功能
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId || `clipboard-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'move',
    zIndex: isDragging ? 1000 : 'auto',
  }

  // 处理点击粘贴
  const handleClick = async () => {
    if (onClick) {
      onClick(item, index)
    } else {
      // 默认行为：粘贴
      try {
        await pasteClipboardItem(item.id)
        console.log('粘贴成功:', item.id)
      } catch (error) {
        console.error('粘贴失败:', error)
      }
    }
  }

  // 获取简短显示内容（用于小行高模式）
  const getShortContent = () => {
    if (contentType === 'image') {
      return '[图片]'
    } else if (contentType === 'file') {
      try {
        if (item.content?.startsWith('files:')) {
          const filesData = JSON.parse(item.content.substring(6))
          return `${filesData.files.length} 个文件`
        }
      } catch (e) {
        return '[文件]'
      }
      return '[文件]'
    } else if (contentType === 'rich_text') {
      // 富文本显示纯文本内容
      return item.content || '[富文本]'
    }
    return item.content || ''
  }

  // 快捷键提示
  const getShortcut = () => {
    if (index < 9) {
      return `Ctrl+${index + 1}`
    }
    return null
  }

  const isSmallHeight = settings.rowHeight === 'small'

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`group relative flex flex-col px-2.5 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700/50 rounded-md cursor-move transition-all border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm ${getHeightClass()}`}
    >
      {/* 悬浮序号和快捷键提示 */}
      <div className="absolute top-1 right-2 flex flex-col items-end gap-1 pointer-events-none">
        {/* 序号 */}
        <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-1 py-0.5 rounded-lg font-semibold min-w-[16px] text-center leading-tight">
          {index + 1}
        </span>
        {/* 快捷键 */}
        {getShortcut() && (
          <span className="text-[9px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-medium leading-tight">
            {getShortcut()}
          </span>
        )}
      </div>

      {isSmallHeight ? (
        // 小行高模式：显示内容（隐藏时间）
        <div className="flex items-center gap-2 h-full overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden h-full">
            {(contentType === 'image' || contentType === 'file') ? (
              // 图片和文件：显示实际内容（紧凑模式）
              renderContent(true)
            ) : (
              // 文本和富文本：显示文字内容
              <p className={`text-sm text-gray-800 dark:text-gray-200 break-all leading-relaxed ${getLineClampClass()}`}>
                {getShortContent()}
              </p>
            )}
          </div>
        </div>
      ) : (
        // 中/大行高模式：显示完整内容
        <>
          {/* 时间戳 */}
          <div className="flex items-center flex-shrink-0 mb-0.5">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatTime()}
            </span>
          </div>

          {/* 内容区 */}
          <div className="flex-1 min-w-0 overflow-hidden h-full w-full">
            {renderContent()}
          </div>
        </>
      )}
    </div>
  )
}

export default ClipboardItem

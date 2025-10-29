import { IconCalendar } from '@tabler/icons-react'

function FooterBar() {
  return (
    <div className="flex-shrink-0 h-7 flex items-center justify-between px-3 bg-gray-200 dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
      {/* 左侧快捷键提示 */}
      <div className="flex items-center gap-4">
        <span>Win+V: 显示/隐藏</span>
        <span>Ctrl+数字: 粘贴对应历史</span>
      </div>
      
      {/* 右侧日历图标 */}
      <button 
        className="w-5 h-5 flex items-center justify-center hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        title="日历"
      >
        <IconCalendar size={14} />
      </button>
    </div>
  )
}

export default FooterBar


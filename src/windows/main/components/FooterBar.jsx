function FooterBar({ children }) {
  return (
    <div className="flex-shrink-0 h-7 flex items-center justify-between px-3 bg-gray-200 dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 relative">
      {/* 左侧快捷键提示 */}
      <div className="flex items-center gap-3 text-[10px]">
        <span>Win+V 显隐</span>
        <span>Ctrl+1~9 快速粘贴</span>
      </div>
      
      {/* 右侧自定义内容区域 */}
      <div className="flex items-center">
        {children}
      </div>
    </div>
  )
}

export default FooterBar


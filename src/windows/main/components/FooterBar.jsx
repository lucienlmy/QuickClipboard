import { useTranslation } from 'react-i18next'
import { useWindowDrag } from '@shared/hooks/useWindowDrag'

function FooterBar({ children }) {
  const { t } = useTranslation()
  
  // 使用自定义窗口拖拽，排除右侧自定义内容区域和所有按钮
  const dragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]'],
    allowChildren: true
  })

  return (
    <div 
      ref={dragRef}
      className="flex-shrink-0 h-7 flex items-center justify-between px-3 bg-gray-200 dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 relative"
    >
      {/* 左侧快捷键提示 */}
      <div className="flex items-center gap-3 text-[10px]">
        <span>Win+V {t('footer.openClipboard')}</span>
        <span>Ctrl+1~9 {t('footer.pasteShortcut')}</span>
      </div>
      
      {/* 右侧自定义内容区域 - 标记为不可拖拽区域 */}
      <div className="flex items-center" data-no-drag>
        {children}
      </div>
    </div>
  )
}

export default FooterBar


import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { IconSettings, IconRowInsertBottom, IconLayoutGrid } from '@tabler/icons-react'
import { useWindowDrag } from '@shared/hooks/useWindowDrag'
import { settingsStore } from '@shared/store/settingsStore'
import BottomMenuPopup from './BottomMenuPopup'

function FooterBar({ children }) {
  const { t } = useTranslation()
  const settings = useSnapshot(settingsStore)
  
  // 使用自定义窗口拖拽，排除右侧自定义内容区域和所有按钮
  const dragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]'],
    allowChildren: true
  })

  // 定义菜单项配置
  const menuItems = [
    {
      id: 'rowHeight',
      label: '行高',
      icon: IconRowInsertBottom,
      currentValue: settings.rowHeight,
      options: [
        { value: 'large', label: '大' },
        { value: 'medium', label: '中' },
        { value: 'small', label: '小' }
      ],
      onSelect: (value) => settingsStore.setRowHeight(value)
    },
    {
      id: 'fileDisplayMode',
      label: '文件显示模式',
      icon: IconLayoutGrid,
      currentValue: settings.fileDisplayMode,
      options: [
        { value: 'detailed', label: '详细信息' },
        { value: 'iconOnly', label: '仅图标' }
      ],
      onSelect: (value) => settingsStore.setFileDisplayMode(value)
    }
  ]

  return (
    <div 
      ref={dragRef}
      className="flex-shrink-0 h-5 flex items-center px-3 bg-gray-200 dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 relative"
    >
      {/* 左侧快捷键提示 */}
      <div className="flex items-center gap-2 text-[10px]">
        <span>Win+V {t('footer.openClipboard')}</span>
        {/* <span>Ctrl+1~9 {t('footer.pasteShortcut')}</span> */}
      </div>
      
      {/* 右侧区域 - 绝对定位固定在右侧，标记为不可拖拽区域 */}
      <div 
        className="absolute right-3 top-0 h-full flex items-center gap-2 pl-4" 
        data-no-drag
      >
        {/* 渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-200 to-gray-200 dark:via-gray-900 dark:to-gray-900" />
        
        {/* 内容层 */}
        <div className="relative flex items-center gap-2">
          <BottomMenuPopup
            icon={IconSettings}
            label="设置"
            title="显示设置"
            menuItems={menuItems}
            width={120}
          />
          
          {/* 自定义内容（分组按钮） */}
          {children}
        </div>
      </div>
    </div>
  )
}

export default FooterBar


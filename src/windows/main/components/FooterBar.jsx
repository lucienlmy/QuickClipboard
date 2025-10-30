import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { IconMenu2, IconCheck } from '@tabler/icons-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useWindowDrag } from '@shared/hooks/useWindowDrag'
import { settingsStore } from '@shared/store/settingsStore'

function FooterBar({ children }) {
  const { t } = useTranslation()
  const settings = useSnapshot(settingsStore)
  
  // 使用自定义窗口拖拽，排除右侧自定义内容区域和所有按钮
  const dragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]'],
    allowChildren: true
  })

  const rowHeightOptions = [
    { value: 'large', label: '大', height: '120px' },
    { value: 'medium', label: '中', height: '90px' },
    { value: 'small', label: '小', height: '50px' }
  ]

  return (
    <div 
      ref={dragRef}
      className="flex-shrink-0 h-7 flex items-center px-3 bg-gray-200 dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 relative"
    >
      {/* 左侧快捷键提示 */}
      <div className="flex items-center gap-3 text-[10px]">
        <span>Win+V {t('footer.openClipboard')}</span>
        <span>Ctrl+1~9 {t('footer.pasteShortcut')}</span>
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
          {/* 行高菜单 */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button 
                className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                title="行高"
              >
                <IconMenu2 size={12} />
                <span className="text-[10px]">行高</span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[100px] bg-white dark:bg-gray-800 rounded-lg p-1 shadow-lg border border-gray-200 dark:border-gray-700"
                sideOffset={5}
                align="end"
                side="top"
              >
                {rowHeightOptions.map(option => (
                  <DropdownMenu.Item
                    key={option.value}
                    onClick={() => settingsStore.setRowHeight(option.value)}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs outline-none cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                  >
                    <span>{option.label}</span>
                    {settings.rowHeight === option.value && (
                      <IconCheck size={12} className="text-blue-500" />
                    )}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          
          {/* 自定义内容（分组按钮） */}
          {children}
        </div>
      </div>
    </div>
  )
}

export default FooterBar


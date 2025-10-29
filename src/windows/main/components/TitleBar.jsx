import { IconApps } from '@tabler/icons-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'

function TitleBar() {
  const { t } = useTranslation()

  return (
    <div 
      className="flex-shrink-0 h-10 flex items-center justify-between px-2.5 bg-gray-200 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700"
      data-tauri-drag-region
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5">
        <div className="w-7 h-7 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-blue-500">
            <rect x="8" y="2" width="8" height="4" rx="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          </svg>
        </div>
      </div>

      {/* 工具按钮 */}
      <div className="flex items-center gap-1">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button 
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
              title={t('common.settings')}
            >
              <IconApps size={18} />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[200px] bg-white dark:bg-gray-800 rounded-lg p-1 shadow-lg border border-gray-200 dark:border-gray-700"
              sideOffset={5}
            >
              <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm outline-none cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                {t('common.settings')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  )
}

export default TitleBar


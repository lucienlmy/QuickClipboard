import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconX, IconMinus, IconSquare, IconSearch, IconSettings } from '@tabler/icons-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function SettingsHeader() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const currentWindow = getCurrentWindow()

  const handleMinimize = async () => {
    await currentWindow.minimize()
  }

  const handleMaximize = async () => {
    await currentWindow.toggleMaximize()
  }

  const handleClose = async () => {
    await currentWindow.close()
  }

  return (
    <header data-tauri-drag-region className="flex-shrink-0 h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-5">
      <div className="flex items-center gap-3">
        <IconSettings size={20} className="text-gray-600 dark:text-gray-400" />
        <h1 className="text-base font-semibold text-gray-900 dark:text-white">
          {t('settings.title')}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('settings.searchPlaceholder')}
            className="pl-9 pr-4 py-1.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56"
          />
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={handleMinimize}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="最小化"
          >
            <IconMinus size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          
          <button
            onClick={handleMaximize}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="最大化"
          >
            <IconSquare size={16} className="text-gray-600 dark:text-gray-400" />
          </button>
          
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
            title="关闭"
          >
            <IconX size={16} className="text-gray-600 dark:text-gray-400 hover:text-red-600" />
          </button>
        </div>
      </div>
    </header>
  )
}

export default SettingsHeader


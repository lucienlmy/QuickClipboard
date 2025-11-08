import { useTranslation } from 'react-i18next'
import { IconEdit, IconMinus, IconSquare, IconX } from '@tabler/icons-react'
import { getCurrentWindow } from '@tauri-apps/api/window'

function TitleBar({ title, hasChanges }) {
  const { t } = useTranslation()
  const window = getCurrentWindow()

  const handleMinimize = () => {
    window.minimize()
  }

  const handleMaximize = () => {
    window.toggleMaximize()
  }

  const handleClose = () => {
    window.close()
  }

  return (
    <div
      className="h-12 flex items-center justify-between px-4 bg-white/80 border-b border-gray-200/80 backdrop-blur-sm dark:bg-gray-800/80 dark:border-gray-700/80"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2 flex-1 min-w-0 pointer-events-none">
        <IconEdit size={18} className="text-gray-700 dark:text-gray-200 flex-shrink-0" />
        <h1 className="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">
          {title || t('textEditor.title')}
          {hasChanges && <span className="ml-1 text-amber-500">*</span>}
        </h1>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 pointer-events-auto">
        <button
          className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 transition-colors dark:hover:bg-gray-700 dark:text-gray-300"
          onClick={handleMinimize}
          title={t('common.minimize')}
        >
          <IconMinus size={16} />
        </button>
        <button
          className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 transition-colors dark:hover:bg-gray-700 dark:text-gray-300"
          onClick={handleMaximize}
          title={t('common.maximize')}
        >
          <IconSquare size={14} />
        </button>
        <button
          className="w-9 h-9 flex items-center justify-center rounded hover:bg-red-500 hover:text-white text-gray-600 dark:text-gray-300 transition-colors"
          onClick={handleClose}
          title={t('common.close')}
        >
          <IconX size={16} />
        </button>
      </div>
    </div>
  )
}

export default TitleBar


import { useTranslation } from 'react-i18next'
import { IconDeviceFloppy, IconX } from '@tabler/icons-react'

function StatusBar({ charCount, lineCount, hasChanges, onSave, onCancel }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-14 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
        <span className="whitespace-nowrap">{t('textEditor.charCount', { count: charCount })}</span>
        <span className="whitespace-nowrap">{t('textEditor.lineCount', { count: lineCount })}</span>
        {hasChanges && (
          <span className="text-orange-500 whitespace-nowrap">{t('textEditor.unsaved')}</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          className="flex items-center gap-2 px-3 h-9 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium transition-colors"
          onClick={onCancel}
        >
          <IconX size={16} />
          <span className="hidden sm:inline">{t('common.cancel')}</span>
        </button>
        <button
          className="flex items-center gap-2 px-3 h-9 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
          onClick={onSave}
        >
          <IconDeviceFloppy size={16} />
          <span className="hidden sm:inline">{t('common.save')}</span>
        </button>
      </div>
    </div>
  )
}

export default StatusBar


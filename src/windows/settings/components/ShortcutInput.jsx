import { useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

function ShortcutInput({ value, onChange, onReset, presets = [] }) {
  const { t } = useTranslation()
  const [isListening, setIsListening] = useState(false)

  const handleKeyDown = (e) => {
    if (!isListening) return
    
    e.preventDefault()
    const keys = []
    
    if (e.ctrlKey) keys.push('Ctrl')
    if (e.altKey) keys.push('Alt')
    if (e.shiftKey) keys.push('Shift')
    if (e.metaKey) keys.push('Win')
    
    if (e.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      keys.push(e.key)
    }
    
    if (keys.length > 1) {
      onChange(keys.join('+'))
      setIsListening(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value || ''}
          onClick={() => setIsListening(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsListening(false)}
          readOnly
          placeholder={t('settings.shortcuts.clickToSet')}
          className="px-3 py-2 w-48 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        />
        
        {onReset && (
          <button
            onClick={onReset}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
            title={t('settings.common.reset')}
          >
            <IconRefresh className="w-4 h-4" />
          </button>
        )}
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('settings.shortcuts.commonShortcuts')}:
          </span>
          {presets.map((preset) => (
            <button
              key={preset}
              onClick={() => onChange(preset)}
              className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ShortcutInput


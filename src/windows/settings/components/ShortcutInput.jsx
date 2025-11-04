import { useState } from 'react'
import { IconRefresh, IconAlertCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

function ShortcutInput({ value, onChange, onReset, presets = [], hasError = false, errorMessage = null }) {
  const { t } = useTranslation()
  const [isListening, setIsListening] = useState(false)

  const handleKeyDown = (e) => {
    if (!isListening) return
    
    e.preventDefault()
    e.stopPropagation()
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return
    }
    
    const keys = []
    
    // 添加修饰键
    if (e.ctrlKey) keys.push('Ctrl')
    if (e.altKey) keys.push('Alt')
    if (e.shiftKey) keys.push('Shift')
    if (e.metaKey) keys.push('Win')
    
    // 映射特殊键名
    let mainKey = e.key
    const keyMap = {
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      'Escape': 'Escape',
      'Enter': 'Enter',
      'Tab': 'Tab',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      ' ': 'Space',
    }
    
    if (keyMap[e.key]) {
      mainKey = keyMap[e.key]
    } else if (e.key.length === 1) {
      mainKey = e.key.toUpperCase()
    }
    
    keys.push(mainKey)
    
    const shortcut = keys.join('+')
    onChange(shortcut)
    setIsListening(false)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="text"
            value={isListening ? t('settings.shortcuts.listening') : (value || '')}
            onClick={() => setIsListening(true)}
            onKeyDown={handleKeyDown}
            onBlur={() => setIsListening(false)}
            readOnly
            placeholder={t('settings.shortcuts.clickToSet')}
            className={`
              px-3 py-2 pr-8 w-48 text-sm border rounded-lg
              bg-white dark:bg-gray-700 
              focus:outline-none cursor-pointer
              transition-all duration-200
              ${hasError 
                ? 'text-red-600 dark:text-red-400 border-red-500 dark:border-red-500 ring-2 ring-red-500/30 dark:ring-red-500/30' 
                : isListening 
                  ? 'text-gray-900 dark:text-white border-blue-500 ring-2 ring-blue-500/50 dark:border-blue-400 dark:ring-blue-400/50' 
                  : 'text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }
            `}
          />
          {value && !isListening && !hasError && (
            <button
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors"
              title={t('settings.common.clear')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {hasError && (
            <div 
              className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500 cursor-help" 
              title={errorMessage || '快捷键冲突'}
            >
              <IconAlertCircle size={16} strokeWidth={2.5} />
            </div>
          )}
        </div>
        
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


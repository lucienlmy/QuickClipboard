import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { settingsStore } from '@shared/store/settingsStore'
import { toolsStore } from '@shared/store/toolsStore'
import i18n from '@shared/i18n'

// 监听设置变更事件并同步到当前窗口（跨窗口设置同步）
export function useSettingsSync() {
  useEffect(() => {
    let unlisten = null

    // 监听设置变更事件
    const setupListener = async () => {
      try {
        unlisten = await listen('settings-changed', (event) => {
          console.log('收到设置变更事件:', event.payload)
          
          // 批量更新设置
          if (event.payload && typeof event.payload === 'object') {
            settingsStore.updateSettings(event.payload)
            
            if (event.payload.language !== undefined && event.payload.language !== i18n.language) {
              i18n.changeLanguage(event.payload.language)
            }
            
            if (event.payload.aiTranslationEnabled !== undefined) {
              const value = event.payload.aiTranslationEnabled
              localStorage.setItem('tool-state-ai-translation-button', JSON.stringify(value))
              toolsStore.states['ai-translation-button'] = value
            }
            if (event.payload.pasteWithFormat !== undefined) {
              const value = event.payload.pasteWithFormat
              localStorage.setItem('tool-state-format-toggle-button', JSON.stringify(value))
              toolsStore.states['format-toggle-button'] = value
            }
          }
        })
        
        console.log('设置同步监听器已启动')
      } catch (error) {
        console.error('设置监听器启动失败:', error)
      }
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
        console.log('设置同步监听器已清理')
      }
    }
  }, [])
}


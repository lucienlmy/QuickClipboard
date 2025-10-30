import { invoke } from '@tauri-apps/api/core'

// 工具状态管理
const toolStates = {
  'pin-button': false,
  'one-time-paste-button': false,
  'ai-translation-button': false,
  'format-toggle-button': true,
  'music-player-button': false
}

// 获取工具状态
export function getToolState(toolId) {
  return toolStates[toolId] ?? false
}

// 设置工具状态
export function setToolState(toolId, state) {
  toolStates[toolId] = state
 
  try {
    localStorage.setItem(`tool-state-${toolId}`, JSON.stringify(state))
  } catch (error) {
    console.error(`保存工具状态失败 ${toolId}:`, error)
  }
}

// 初始化工具状态
export async function initializeToolStates() {
  Object.keys(toolStates).forEach(toolId => {
    try {
      const saved = localStorage.getItem(`tool-state-${toolId}`)
      if (saved !== null) {
        toolStates[toolId] = JSON.parse(saved)
      }
    } catch (error) {
      console.error(`恢复工具状态失败 ${toolId}:`, error)
    }
  })
  
  // 从后端获取设置并同步状态
  try {
    const settings = await invoke('get_settings')
    if (settings.ai_translation_enabled !== undefined) {
      toolStates['ai-translation-button'] = settings.ai_translation_enabled
    }
    if (settings.paste_with_format !== undefined) {
      toolStates['format-toggle-button'] = settings.paste_with_format

      const { settingsStore } = await import('@shared/store/settingsStore')
      settingsStore.setPasteWithFormat(settings.paste_with_format)
    }
  } catch (error) {
    console.error('从后端获取设置失败:', error)
  }
}

// 工具操作处理器
export const toolActions = {
  // 窗口固定
  'pin-button': async () => {
    const currentState = getToolState('pin-button')
    const newState = !currentState
    
    try {
      await invoke('set_window_pinned', { pinned: newState })
      setToolState('pin-button', newState)
      return newState
    } catch (error) {
      console.error('设置窗口固定状态失败:', error)
      throw error
    }
  },
  
  // 打开设置
  'settings-button': async () => {
    try {
      await invoke('open_settings_window')
    } catch (error) {
      console.error('打开设置窗口失败:', error)
      throw error
    }
  },
  
  // 截图
  'screenshot-button': async () => {
    try {
      await invoke('start_builtin_screenshot')
    } catch (error) {
      console.error('启动截图失败:', error)
      throw error
    }
  },
  
  // 一次性粘贴
  'one-time-paste-button': async () => {
    const currentState = getToolState('one-time-paste-button')
    const newState = !currentState
    setToolState('one-time-paste-button', newState)

    window.dispatchEvent(new CustomEvent('one-time-paste-changed', {
      detail: { enabled: newState }
    }))
    
    return newState
  },
  
  // AI翻译
  'ai-translation-button': async () => {
    const currentState = getToolState('ai-translation-button')
    const newState = !currentState
    
    try {
      // 检查AI翻译配置
      const hasConfig = await invoke('check_ai_translation_config')
      if (!hasConfig && newState) {
        console.warn('AI翻译未配置')
      }
      
      // 保存到后端设置
      await invoke('save_settings', {
        settings: { ai_translation_enabled: newState }
      })
      
      // 启用/禁用快捷键
      if (newState) {
        await invoke('enable_ai_translation_cancel_shortcut')
      } else {
        await invoke('disable_ai_translation_cancel_shortcut')
      }
      
      setToolState('ai-translation-button', newState)
      
      // 触发自定义事件
      window.dispatchEvent(new CustomEvent('ai-translation-changed', {
        detail: { enabled: newState }
      }))
      
      return newState
    } catch (error) {
      console.error('切换AI翻译失败:', error)
      throw error
    }
  },
  
  // 格式切换
  'format-toggle-button': async () => {
    const currentState = getToolState('format-toggle-button')
    const newState = !currentState
    
    try {
      // 保存到后端设置
      await invoke('save_settings', {
        settings: { paste_with_format: newState }
      })
      
      setToolState('format-toggle-button', newState)
      
      const { settingsStore } = await import('@shared/store/settingsStore')
      settingsStore.setPasteWithFormat(newState)
      
      // 触发自定义事件
      window.dispatchEvent(new CustomEvent('format-mode-changed', {
        detail: { withFormat: newState }
      }))
      
      return newState
    } catch (error) {
      console.error('切换格式模式失败:', error)
      throw error
    }
  },
  
  // 音乐播放器
  'music-player-button': async () => {
    const currentState = getToolState('music-player-button')
    const newState = !currentState
    setToolState('music-player-button', newState)
    return newState
  }
}

// 执行工具操作
export async function executeToolAction(toolId) {
  const action = toolActions[toolId]
  if (!action) {
    console.warn(`工具 ${toolId} 没有对应的操作`)
    return null
  }
  
  try {
    return await action()
  } catch (error) {
    console.error(`执行工具操作失败 ${toolId}:`, error)
    throw error
  }
}


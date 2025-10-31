import { proxy } from 'valtio'
import { 
  defaultSettings, 
  loadSettingsFromBackend, 
  saveSettingsToBackend 
} from '@shared/services/settingsService'

// 设置 Store
export const settingsStore = proxy({
  ...defaultSettings,
  
  // UI 专属设置（localStorage）
  language: 'zh-CN',
  fontSize: 14,
  rowHeight: 'medium',
  
  darkThemeStyle: 'classic',
  
  // 加载设置
  async loadSettings() {
    const settings = await loadSettingsFromBackend()
    
    // 更新所有设置到 store
    Object.keys(settings).forEach(key => {
      if (key in this && key !== 'loadSettings' && key !== 'saveSetting' && key !== 'saveAllSettings' && key !== 'updateSettings') {
        this[key] = settings[key]
      }
    })
    
    return settings
  },
  
  // 保存单个设置项
  async saveSetting(key, value, options = {}) {
    this[key] = value
    
    // 收集当前所有设置
    const currentSettings = this.getAllSettings()
    const result = await saveSettingsToBackend(currentSettings, options)
    
    return result
  },
  
  // 保存所有设置
  async saveAllSettings() {
    const currentSettings = this.getAllSettings()
    return await saveSettingsToBackend(currentSettings)
  },
  
  // 批量更新设置（不保存）
  updateSettings(updates) {
    Object.keys(updates).forEach(key => {
      if (key in this && key !== 'loadSettings' && key !== 'saveSetting' && key !== 'saveAllSettings' && key !== 'updateSettings' && key !== 'getAllSettings') {
        this[key] = updates[key]
      }
    })
  },
  
  // 获取所有设置（排除方法）
  getAllSettings() {
    const settings = {}
    Object.keys(defaultSettings).forEach(key => {
      if (key in this) {
        settings[key] = this[key]
      }
    })
    return settings
  },
  
  // 主题设置
  setTheme(theme) {
    this.saveSetting('theme', theme)
  },
  
  // 暗色主题风格设置
  setDarkThemeStyle(style) {
    this.saveSetting('darkThemeStyle', style)
  },
  
  // 语言设置
  setLanguage(lang) {
    this.language = lang
    localStorage.setItem('language', lang)
  },
  
  // 字体大小
  setFontSize(size) {
    this.fontSize = size
    localStorage.setItem('fontSize', String(size))
  },
  
  // 行高
  setRowHeight(height) {
    this.rowHeight = height
    localStorage.setItem('rowHeight', height)
  },
  
  // 粘贴格式
  setPasteWithFormat(withFormat) {
    this.saveSetting('pasteWithFormat', withFormat)
  }
})

// 初始化设置
export async function initSettings() {
  // 从 localStorage 恢复 UI 设置
  const language = localStorage.getItem('language')
  const fontSize = localStorage.getItem('fontSize')
  const rowHeight = localStorage.getItem('rowHeight')
  
  if (language) settingsStore.language = language
  if (fontSize) settingsStore.fontSize = parseInt(fontSize)
  if (rowHeight) settingsStore.rowHeight = rowHeight
  
  // 从后端加载所有配置
  await settingsStore.loadSettings()
}


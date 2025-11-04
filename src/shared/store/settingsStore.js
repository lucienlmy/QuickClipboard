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
  fontSize: 14,
  rowHeight: 'medium',
  fileDisplayMode: 'detailed',
  
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
  async setLanguage(lang) {
    await this.saveSetting('language', lang)
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
  
  // 文件显示模式
  setFileDisplayMode(mode) {
    this.fileDisplayMode = mode
    localStorage.setItem('fileDisplayMode', mode)
  },
  
  // 粘贴格式
  setPasteWithFormat(withFormat) {
    this.saveSetting('pasteWithFormat', withFormat)
  }
})

// 初始化设置
export async function initSettings() {
  // 从 localStorage 恢复 UI 设置
  const fontSize = localStorage.getItem('fontSize')
  const rowHeight = localStorage.getItem('rowHeight')
  const fileDisplayMode = localStorage.getItem('fileDisplayMode')
  
  if (fontSize) settingsStore.fontSize = parseInt(fontSize)
  if (rowHeight) settingsStore.rowHeight = rowHeight
  if (fileDisplayMode) settingsStore.fileDisplayMode = fileDisplayMode
  
  // 从后端加载所有配置
  await settingsStore.loadSettings()
 
  if (settingsStore.language) {
    const i18n = (await import('@shared/i18n')).default
    await i18n.changeLanguage(settingsStore.language)
  }
}


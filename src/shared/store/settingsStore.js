import { proxy } from 'valtio'

// 设置 Store
export const settingsStore = proxy({
  theme: 'light',
  language: 'zh-CN',
  fontSize: 14,
  autoStart: false,
  
  setTheme(theme) {
    this.theme = theme
    localStorage.setItem('theme', theme)
  },
  
  setLanguage(lang) {
    this.language = lang
    localStorage.setItem('language', lang)
  },
  
  setFontSize(size) {
    this.fontSize = size
    localStorage.setItem('fontSize', String(size))
  },
  
  toggleAutoStart() {
    this.autoStart = !this.autoStart
    localStorage.setItem('autoStart', String(this.autoStart))
  }
})

// 初始化：从本地存储恢复设置
export function initSettings() {
  const theme = localStorage.getItem('theme')
  const language = localStorage.getItem('language')
  const fontSize = localStorage.getItem('fontSize')
  const autoStart = localStorage.getItem('autoStart')
  
  if (theme) settingsStore.theme = theme
  if (language) settingsStore.language = language
  if (fontSize) settingsStore.fontSize = parseInt(fontSize)
  if (autoStart) settingsStore.autoStart = autoStart === 'true'
}


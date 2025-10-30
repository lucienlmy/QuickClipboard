import { proxy } from 'valtio'

// 设置 Store
export const settingsStore = proxy({
  theme: 'light',
  language: 'zh-CN',
  fontSize: 14,
  autoStart: false,
  rowHeight: 'medium', // 'large' | 'medium' | 'small'
  pasteWithFormat: true,
  
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
  },
  
  setRowHeight(height) {
    this.rowHeight = height
    localStorage.setItem('rowHeight', height)
  },
  
  setPasteWithFormat(withFormat) {
    this.pasteWithFormat = withFormat
    localStorage.setItem('pasteWithFormat', String(withFormat))
  }
})

// 初始化：从本地存储恢复设置
export function initSettings() {
  const theme = localStorage.getItem('theme')
  const language = localStorage.getItem('language')
  const fontSize = localStorage.getItem('fontSize')
  const autoStart = localStorage.getItem('autoStart')
  const rowHeight = localStorage.getItem('rowHeight')
  const pasteWithFormat = localStorage.getItem('pasteWithFormat')
  
  if (theme) settingsStore.theme = theme
  if (language) settingsStore.language = language
  if (fontSize) settingsStore.fontSize = parseInt(fontSize)
  if (autoStart) settingsStore.autoStart = autoStart === 'true'
  if (rowHeight) settingsStore.rowHeight = rowHeight
  if (pasteWithFormat !== null) settingsStore.pasteWithFormat = pasteWithFormat === 'true'
}


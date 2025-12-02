import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'
import darkThemeCss from '../styles/dark-theme.css?inline'
import backgroundThemeCss from '../styles/theme-background.css?inline'

// 系统主题媒体查询
let systemThemeMediaQuery = null
if (typeof window !== 'undefined' && window.matchMedia) {
  systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  
  // 监听系统主题变化
  systemThemeMediaQuery.addEventListener('change', (e) => {
    settingsStore.systemIsDark = e.matches
  })
}

// 获取实际应用的主题
export function getEffectiveTheme(theme, systemIsDark = settingsStore.systemIsDark) {
  if (theme === 'auto') {
    return systemIsDark ? 'dark' : 'light'
  }
  return theme
}

// 动态加载/卸载暗色主题CSS
let darkThemeStyleElement = null
let backgroundThemeStyleElement = null

function loadDarkThemeCSS() {
  if (darkThemeStyleElement) return

  darkThemeStyleElement = document.createElement('style')
  darkThemeStyleElement.id = 'dark-theme-classic'
  darkThemeStyleElement.textContent = darkThemeCss
  document.head.appendChild(darkThemeStyleElement)
}

function unloadDarkThemeCSS() {
  if (darkThemeStyleElement) {
    document.head.removeChild(darkThemeStyleElement)
    darkThemeStyleElement = null
  }
}

function loadBackgroundThemeCSS() {
  if (backgroundThemeStyleElement) return

  backgroundThemeStyleElement = document.createElement('style')
  backgroundThemeStyleElement.id = 'background-theme'
  backgroundThemeStyleElement.textContent = backgroundThemeCss
  document.head.appendChild(backgroundThemeStyleElement)
}

function unloadBackgroundThemeCSS() {
  if (backgroundThemeStyleElement) {
    document.head.removeChild(backgroundThemeStyleElement)
    backgroundThemeStyleElement = null
  }
}

export function useTheme() {
  const { theme, darkThemeStyle, backgroundImagePath, systemIsDark } = useSnapshot(settingsStore)

  // 动态加载/卸载暗色主题CSS
  useEffect(() => {
    const effectiveTheme = getEffectiveTheme(theme, systemIsDark)
    const isDark = effectiveTheme === 'dark'

    if (isDark && darkThemeStyle === 'classic') {
      loadDarkThemeCSS()
    } else {
      // 否则卸载 CSS
      unloadDarkThemeCSS()
    }

    if (theme === 'background') {
      loadBackgroundThemeCSS()
    } else {
      unloadBackgroundThemeCSS()
    }
  }, [theme, darkThemeStyle, systemIsDark])

  // 计算实际应用的主题
  const effectiveTheme = getEffectiveTheme(theme, systemIsDark)

  // 判断是否为暗色主题
  const isDark = effectiveTheme === 'dark'

  // 判断是否为背景主题
  const isBackground = theme === 'background'

  return {
    theme,
    effectiveTheme,
    isDark,
    isBackground,
    backgroundImagePath,
    darkThemeStyle
  }
}

export function applyThemeToBody(theme, windowName = '') {
  if (typeof document === 'undefined') return

  const body = document.body
  const effectiveTheme = getEffectiveTheme(theme)

  // 移除所有主题类
  body.classList.remove('theme-light', 'theme-dark', 'theme-background', 'has-dynamic-titlebar')

  // 添加窗口专属类名（防止多窗口CSS冲突）
  if (windowName) {
    body.classList.add(`window-${windowName}`)
  }

  // 应用主题类
  if (theme === 'background') {
    body.classList.add('theme-background')
  } else if (effectiveTheme === 'dark') {
    body.classList.add('theme-dark')
  } else {
    body.classList.add('theme-light')
  }
}


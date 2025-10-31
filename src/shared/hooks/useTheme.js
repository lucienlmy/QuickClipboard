import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'

// 监听系统主题变化
let systemThemeMediaQuery = null
let systemIsDark = false

// 初始化系统主题检测
if (typeof window !== 'undefined' && window.matchMedia) {
  systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemIsDark = systemThemeMediaQuery.matches
}

// 获取实际应用的主题
export function getEffectiveTheme(theme) {
  if (theme === 'auto') {
    return systemIsDark ? 'dark' : 'light'
  }
  return theme
}

export function useTheme() {
  const { theme, backgroundImagePath } = useSnapshot(settingsStore)

  useEffect(() => {
    // 监听系统主题变化
    const handleSystemThemeChange = (e) => {
      systemIsDark = e.matches

      if (settingsStore.theme === 'auto') {
        // 强制更新
        settingsStore.updateSettings({ theme: 'auto' })
      }
    }

    if (systemThemeMediaQuery) {
      systemThemeMediaQuery.addEventListener('change', handleSystemThemeChange)
      return () => {
        systemThemeMediaQuery.removeEventListener('change', handleSystemThemeChange)
      }
    }
  }, [])

  // 计算实际应用的主题
  const effectiveTheme = getEffectiveTheme(theme)
  
  // 判断是否为暗色主题
  const isDark = effectiveTheme === 'dark'
  
  // 判断是否为背景主题
  const isBackground = theme === 'background'

  return {
    theme,
    effectiveTheme,
    isDark,
    isBackground,
    backgroundImagePath
  }
}

// 应用主题类到 body
export function applyThemeToBody(theme, windowName = '') {
  if (typeof document === 'undefined') return

  const body = document.body
  const effectiveTheme = getEffectiveTheme(theme)

  // 移除所有主题类
  body.classList.remove('theme-light', 'theme-dark', 'theme-background')

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


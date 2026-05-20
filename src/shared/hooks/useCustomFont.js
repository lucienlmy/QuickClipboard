import { useEffect, useRef } from 'react'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'
import { convertFileSrc } from '@tauri-apps/api/core'

const LOCAL_FAMILY = 'CustomFont'

function buildOverrideCSS(family) {
  return `*{font-family:"${family}","Segoe UI","Microsoft YaHei",sans-serif!important}`
}

let styleElement = null

function injectOverride(family) {
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = 'custom-font-override'
    document.head.appendChild(styleElement)
  }
  styleElement.textContent = buildOverrideCSS(family)
}

function removeOverride() {
  if (styleElement) {
    document.head.removeChild(styleElement)
    styleElement = null
  }
}

async function loadLocalFont(filePath) {
  settingsStore.customFontStatus = 'loading'
  try {
    const assetUrl = convertFileSrc(filePath, 'asset')
    const font = new FontFace(LOCAL_FAMILY, `url(${assetUrl})`)
    await font.load()
    document.fonts.add(font)
    settingsStore.customFontStatus = 'loaded'
    return true
  } catch (e) {
    console.error('Failed to load local font:', e)
    settingsStore.customFontStatus = 'error'
    return false
  }
}

function loadUrlFont(url) {
  settingsStore.customFontStatus = 'loading'
  return new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.id = 'custom-font-link'
    link.onload = () => {
      settingsStore.customFontStatus = 'loaded'
      resolve(true)
    }
    link.onerror = () => {
      settingsStore.customFontStatus = 'error'
      resolve(false)
    }
    document.head.appendChild(link)
  })
}

function removeFontResources() {
  const link = document.getElementById('custom-font-link')
  if (link) document.head.removeChild(link)
}

export function useCustomFont() {
  const { customFontEnabled, customFontType, customFontPath, customFontUrl, customFontFamily } = useSnapshot(settingsStore)
  const prevRef = useRef({ enabled: false, type: '', path: '', url: '', family: '' })

  useEffect(() => {
    const prev = prevRef.current

    if (!customFontEnabled) {
      if (prev.enabled) {
        removeOverride()
        removeFontResources()
        settingsStore.customFontStatus = 'idle'
      }
      prevRef.current = { enabled: false, type: '', path: '', url: '', family: '' }
      return
    }

    const typeChanged = prev.type !== customFontType
    const pathChanged = prev.path !== customFontPath
    const urlChanged = prev.url !== customFontUrl
    const familyChanged = prev.family !== customFontFamily
    const justEnabled = !prev.enabled

    const needReload = justEnabled || typeChanged || familyChanged
      || (customFontType === 'file' && pathChanged)
      || (customFontType === 'url' && urlChanged)

    if (needReload) {
      removeOverride()
      removeFontResources()
      settingsStore.customFontStatus = 'idle'

      if (customFontType === 'file' && customFontPath) {
        loadLocalFont(customFontPath).then((ok) => {
          if (ok) injectOverride(LOCAL_FAMILY)
        })
      } else if (customFontType === 'url' && customFontUrl && customFontFamily) {
        loadUrlFont(customFontUrl).then((ok) => {
          if (ok) injectOverride(customFontFamily)
        })
      }
    }

    prevRef.current = {
      enabled: customFontEnabled,
      type: customFontType,
      path: customFontPath,
      url: customFontUrl,
      family: customFontFamily
    }
  }, [customFontEnabled, customFontType, customFontPath, customFontUrl, customFontFamily])
}

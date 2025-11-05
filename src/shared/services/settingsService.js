import {
  reloadSettings,
  saveSettings as saveSettingsApi,
  setEdgeHideEnabled as setEdgeHideEnabledApi,
  getAllWindowsInfo,
  hideMainWindowIfAutoShown,
  getAppVersion as getAppVersionApi,
  isPortableMode as isPortableModeApi
} from '@shared/api'
import { emit } from '@tauri-apps/api/event'
import { toast } from '@shared/store/toastStore'

// 默认设置配置
export const defaultSettings = {
  // 常规设置
  autoStart: false,
  startHidden: false,
  showStartupNotification: true,
  historyLimit: 100,
  language: 'zh-CN',
  
  // 外观设置
  theme: 'light',
  darkThemeStyle: 'classic',
  opacity: 0.9,
  backgroundImagePath: '',
  clipboardAnimationEnabled: true,
  
  // 快捷键设置
  toggleShortcut: 'Alt+V',
  previewShortcut: 'Ctrl+`',
  screenshotShortcut: 'Ctrl+Shift+A',
  numberShortcuts: true,
  numberShortcutsModifier: 'Ctrl',
  
  // 剪贴板窗口快捷键
  navigateUpShortcut: 'ArrowUp',
  navigateDownShortcut: 'ArrowDown',
  tabLeftShortcut: 'ArrowLeft',
  tabRightShortcut: 'ArrowRight',
  focusSearchShortcut: 'Tab',
  hideWindowShortcut: 'Escape',
  executeItemShortcut: 'Ctrl+Enter',
  previousGroupShortcut: 'Ctrl+ArrowUp',
  nextGroupShortcut: 'Ctrl+ArrowDown',
  togglePinShortcut: 'Ctrl+P',
  
  // 剪贴板设置
  clipboardMonitor: true,
  ignoreDuplicates: true,
  saveImages: true,
  autoScrollToTopOnShow: false,
  autoClearSearch: false,
  windowPositionMode: 'smart',
  rememberWindowSize: false,
  titleBarPosition: 'top',
  edgeHideEnabled: true,
  edgeSnapPosition: null,
  edgeHideOffset: 3,
  autoFocusSearch: false,
  sidebarHoverDelay: 0.5,
  pasteWithFormat: true,
  
  // 音效设置
  soundEnabled: true,
  soundVolume: 50,
  copySoundPath: '',
  pasteSoundPath: '',
  
  // 预览窗口设置
  previewEnabled: true,
  previewItemsCount: 5,
  previewAutoPaste: true,
  previewScrollSound: true,
  previewScrollSoundPath: 'sounds/roll.mp3',
  
  // 截屏设置
  screenshot_enabled: true,
  screenshot_shortcut: 'Ctrl+Shift+A',
  screenshot_quality: 85,
  screenshot_auto_save: false,
  screenshot_show_hints: true,
  screenshot_element_detection: 'all',
  screenshot_magnifier_enabled: true,
  screenshot_hints_enabled: true,
  screenshot_color_include_format: true,
  
  // AI 配置
  aiTranslationEnabled: false,
  aiApiKey: '',
  aiModel: 'Qwen/Qwen2-7B-Instruct',
  aiBaseUrl: 'https://api.siliconflow.cn/v1',
  aiTargetLanguage: 'auto',
  aiTranslateOnCopy: false,
  aiTranslateOnPaste: true,
  aiTranslationPrompt: '请将以下文本翻译成{target_language}，严格保持原文的所有格式、换行符、段落结构和空白字符，只返回翻译结果，不要添加任何解释或修改格式：',
  aiInputSpeed: 50,
  aiNewlineMode: 'auto',
  aiOutputMode: 'stream',
  
  // 鼠标设置
  mouseMiddleButtonEnabled: true,
  mouseMiddleButtonModifier: 'None',
  
  // 应用过滤
  appFilterEnabled: false,
  appFilterMode: 'blacklist',
  appFilterList: [],
  
  // 保存的窗口状态
  savedWindowPosition: null,
  savedWindowSize: null
}

// 从 Tauri 后端加载设置
export async function loadSettingsFromBackend() {
  try {
    const savedSettings = await reloadSettings()
    
    // 合并默认设置和保存的设置
    const mergedSettings = { ...defaultSettings, ...savedSettings }
    
    return mergedSettings
  } catch (error) {
    console.error('加载设置失败:', error)
    return { ...defaultSettings }
  }
}

// 保存设置到 Tauri 后端
export async function saveSettingsToBackend(settings, options = {}) {
  const { showToast = true } = options
  
  try {
    await saveSettingsApi(settings)
    
    await emit('settings-changed', settings)
    
    if (showToast) {
      toast.success('设置已保存')
    }
    return { success: true }
  } catch (error) {
    console.error('保存设置失败:', error)
    if (showToast) {
      toast.error('保存设置失败')
    }
    return { success: false, error: error.message }
  }
}

// 保存单个设置项
export async function saveSingleSetting(key, value, allSettings) {
  const updatedSettings = { ...allSettings, [key]: value }
  return await saveSettingsToBackend(updatedSettings)
}

// 获取应用版本
export async function getAppVersion() {
  try {
    const versionInfo = await getAppVersionApi()
    return versionInfo
  } catch (error) {
    console.error('获取版本信息失败:', error)
    return { version: '未知' }
  }
}


// 检查是否为便携版模式
export async function isPortableMode() {
  try {
    return await isPortableModeApi()
  } catch (error) {
    console.error('检查便携版模式失败:', error)
    return false
  }
}

// 设置贴边隐藏
export async function setEdgeHideEnabled(enabled) {
  try {
    await setEdgeHideEnabledApi(enabled)
    return { success: true }
  } catch (error) {
    console.error('更新贴边隐藏设置失败:', error)
    return { success: false, error: error.message }
  }
}

// 获取所有窗口信息（用于应用过滤）
export async function getAllWindowsInfoService() {
  try {
    return await getAllWindowsInfo()
  } catch (error) {
    console.error('获取应用列表失败:', error)
    return []
  }
}

// 隐藏主窗口（如果是自动显示的）
export async function hideMainWindowIfAutoShownService() {
  try {
    await hideMainWindowIfAutoShown()
  } catch (error) {
    console.error('隐藏主窗口失败:', error)
  }
}


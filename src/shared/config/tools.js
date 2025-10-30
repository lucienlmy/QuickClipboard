import { 
  IconPin, 
  IconSettings, 
  IconCamera, 
  IconTrash, 
  IconLanguage, 
  IconTypography, 
  IconMusic 
} from '@tabler/icons-react'

// 工具注册表配置
export const TOOL_REGISTRY = {
  'pin-button': {
    id: 'pin-button',
    icon: IconPin,
    titleKey: 'tools.pin',
    type: 'toggle',
    defaultLocation: 'titlebar',
    defaultActive: false
  },
  'settings-button': {
    id: 'settings-button',
    icon: IconSettings,
    titleKey: 'tools.settings',
    type: 'action',
    defaultLocation: 'titlebar',
  },
  'screenshot-button': {
    id: 'screenshot-button',
    icon: IconCamera,
    titleKey: 'tools.screenshot',
    type: 'action',
    defaultLocation: 'panel',
  },
  'one-time-paste-button': {
    id: 'one-time-paste-button',
    icon: IconTrash,
    titleKey: 'tools.oneTimePaste',
    type: 'toggle',
    defaultLocation: 'panel',
    defaultActive: false
  },
  'ai-translation-button': {
    id: 'ai-translation-button',
    icon: IconLanguage,
    titleKey: 'tools.aiTranslation',
    type: 'toggle',
    defaultLocation: 'panel',
    defaultActive: false
  },
  'format-toggle-button': {
    id: 'format-toggle-button',
    icon: IconTypography,
    titleKey: 'tools.formatToggle',
    type: 'toggle',
    defaultLocation: 'panel',
    defaultActive: true
  },
  'music-player-button': {
    id: 'music-player-button',
    icon: IconMusic,
    titleKey: 'tools.musicPlayer',
    type: 'toggle',
    defaultLocation: 'panel',
    defaultActive: false
  }
}

// 默认布局配置
export const DEFAULT_LAYOUT = {
  titlebar: ['pin-button', 'settings-button'],
  panel: [
    'screenshot-button',
    'one-time-paste-button',
    'ai-translation-button',
    'format-toggle-button',
    'music-player-button'
  ]
}

// 标题栏最大工具数量（不包括固定的工具面板开关）
export const MAX_TITLEBAR_TOOLS = 3

// 本地存储键
export const LAYOUT_STORAGE_KEY = 'tool-layout-v2'


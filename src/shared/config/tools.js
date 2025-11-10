import '@tabler/icons-webfont/dist/tabler-icons.min.css';


// 工具注册表配置
export const TOOL_REGISTRY = {
  'pin-button': {
    id: 'pin-button',
    icon:"ti ti-pin",
    titleKey: 'tools.pin',
    type: 'toggle',
    defaultLocation: 'titlebar',
    defaultActive: false
  },
  'settings-button': {
    id: 'settings-button',
    icon:"ti ti-settings",
    titleKey: 'tools.settings',
    type: 'action',
    defaultLocation: 'titlebar',
  },
  'screenshot-button': {
    id: 'screenshot-button',
    icon:"ti ti-camera",
    titleKey: 'tools.screenshot',
    type: 'action',
    defaultLocation: 'panel',
  },
  'one-time-paste-button': {
    id: 'one-time-paste-button',
    icon:"ti ti-trash",
    titleKey: 'tools.oneTimePaste',
    type: 'toggle',
    defaultLocation: 'panel',
    defaultActive: false
  },
  // 'ai-translation-button': {
  //   id: 'ai-translation-button',
  //   icon:"ti ti-language",
  //   titleKey: 'tools.aiTranslation',
  //   type: 'toggle',
  //   defaultLocation: 'panel',
  //   defaultActive: false
  // },
  'format-toggle-button': {
    id: 'format-toggle-button',
    icon:"ti ti-typography",
    titleKey: 'tools.formatToggle',
    type: 'toggle',
    defaultLocation: 'panel',
    defaultActive: true
  }
}

// 默认布局配置
export const DEFAULT_LAYOUT = {
  titlebar: ['pin-button', 'settings-button'],
  panel: [
    'screenshot-button',
    'one-time-paste-button',
    // 'ai-translation-button',
    'format-toggle-button'
  ]
}

// 标题栏最大工具数量（不包括固定的工具面板开关）
export const MAX_TITLEBAR_TOOLS = 3

// 本地存储键
export const LAYOUT_STORAGE_KEY = 'tool-layout-v2'


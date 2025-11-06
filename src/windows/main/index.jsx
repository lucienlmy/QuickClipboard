import React from 'react'
import ReactDOM from 'react-dom/client'
import { emit } from '@tauri-apps/api/event'
import { subscribeKey } from 'valtio/utils'

// 样式：按正确顺序导入
import '@unocss/reset/tailwind.css'
import '@shared/styles/index.css'
import 'uno.css'
import '@shared/styles/theme-background.css'

// 初始化
import '@shared/i18n'
import { initStores } from '@shared/store'
import { initClipboardItems } from '@shared/store/clipboardStore'
import { initFavorites } from '@shared/store/favoritesStore'
import { loadGroups, groupsStore } from '@shared/store/groupsStore'
import { navigationStore } from '@shared/store/navigationStore'
import { 
  setupClipboardEventListener,
  cleanupEventListeners 
} from '@shared/services/eventListener'

// 组件
import App from './App'

// 检测是否是首次加载
const FIRST_LOAD_KEY = 'app_first_load_done'
const isFirstLoad = !sessionStorage.getItem(FIRST_LOAD_KEY)

// 初始化 stores，然后加载数据
initStores().then(() => {
  // 渲染应用
  ReactDOM.createRoot(document.getElementById('root')).render(<App />)
  
  // 加载数据并设置事件监听
  return Promise.all([
    initClipboardItems(),
    loadGroups().then(() => initFavorites())
  ])
}).then(() => {
  // 设置事件监听器
  setupClipboardEventListener()
  
  subscribeKey(navigationStore, 'activeTab', (activeTab) => {
    emit('navigation-changed', {
      activeTab,
      currentGroup: groupsStore.currentGroup
    })
  })
  
  subscribeKey(groupsStore, 'currentGroup', (currentGroup) => {
    emit('navigation-changed', {
      activeTab: navigationStore.activeTab,
      currentGroup
    })
  })
  
  if (isFirstLoad) {
    sessionStorage.setItem(FIRST_LOAD_KEY, 'true')
    setTimeout(() => {
      window.location.reload()
    }, 100)
  }
})

// 清理事件监听器
window.addEventListener('beforeunload', cleanupEventListeners)


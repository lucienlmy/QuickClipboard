import React from 'react'
import ReactDOM from 'react-dom/client'

// 样式：按正确顺序导入
import '@unocss/reset/tailwind.css'
import '@shared/styles/index.css'
import 'uno.css'

// 初始化
import '@shared/i18n'
import { initStores } from '@shared/store'
import { loadClipboardItems } from '@shared/store/clipboardStore'

// 组件
import App from './App'

// 检测是否是首次加载
const FIRST_LOAD_KEY = 'app_first_load_done'
const isFirstLoad = !sessionStorage.getItem(FIRST_LOAD_KEY)

// 初始化 stores
initStores()

// 渲染应用
ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// 加载数据
loadClipboardItems().then(() => {
  console.log('[Main] 数据加载完成')
  
  // 如果是首次加载，自动刷新一次以确保样式完整
  if (isFirstLoad) {
    console.log('[Main] 首次加载，即将刷新页面以确保样式完整...')
    sessionStorage.setItem(FIRST_LOAD_KEY, 'true')
    setTimeout(() => {
      window.location.reload()
    }, 100)
  }
})


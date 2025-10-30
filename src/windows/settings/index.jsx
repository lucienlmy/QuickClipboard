import React from 'react'
import ReactDOM from 'react-dom/client'

// 样式：按正确顺序导入
import '@unocss/reset/tailwind.css'
import '@shared/styles/index.css'
import 'uno.css'

// 初始化
import '@shared/i18n'
import { initStores } from '@shared/store'

// 组件
import App from './App'

// 检测是否是首次加载
const FIRST_LOAD_KEY = 'settings_first_load_done'
const isFirstLoad = !sessionStorage.getItem(FIRST_LOAD_KEY)

// 初始化 stores
initStores()

// 渲染应用
ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// 如果是首次加载，自动刷新一次以确保样式完整
if (isFirstLoad) {
  sessionStorage.setItem(FIRST_LOAD_KEY, 'true')
  setTimeout(() => {
    window.location.reload()
  }, 100)
}


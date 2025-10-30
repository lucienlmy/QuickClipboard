import { proxy } from 'valtio'

// Toast 位置类型
export const TOAST_POSITIONS = {
  TOP_LEFT: 'top-left',
  TOP_RIGHT: 'top-right',
  BOTTOM_LEFT: 'bottom-left',
  BOTTOM_RIGHT: 'bottom-right'
}

// Toast 状态管理
export const toastStore = proxy({
  toasts: [],
  
  // 添加 toast
  addToast(message, type = 'info', duration = 3000, position = TOAST_POSITIONS.TOP_RIGHT) {
    const id = Date.now() + Math.random()
    const toast = {
      id,
      message,
      type, // 'success' | 'error' | 'warning' | 'info'
      duration,
      position // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    }
    
    this.toasts.push(toast)
    
    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(id)
      }, duration)
    }
    
    return id
  },
  
  // 移除 toast
  removeToast(id) {
    const index = this.toasts.findIndex(t => t.id === id)
    if (index > -1) {
      this.toasts.splice(index, 1)
    }
  },
  
  // 清除所有 toast
  clearAll() {
    this.toasts = []
  }
})

// 便捷方法
export const toast = {
  success: (message, options = {}) => {
    const { duration = 3000, position = TOAST_POSITIONS.TOP_RIGHT } = options
    return toastStore.addToast(message, 'success', duration, position)
  },
  error: (message, options = {}) => {
    const { duration = 3000, position = TOAST_POSITIONS.TOP_RIGHT } = options
    return toastStore.addToast(message, 'error', duration, position)
  },
  warning: (message, options = {}) => {
    const { duration = 3000, position = TOAST_POSITIONS.TOP_RIGHT } = options
    return toastStore.addToast(message, 'warning', duration, position)
  },
  info: (message, options = {}) => {
    const { duration = 3000, position = TOAST_POSITIONS.TOP_RIGHT } = options
    return toastStore.addToast(message, 'info', duration, position)
  }
}


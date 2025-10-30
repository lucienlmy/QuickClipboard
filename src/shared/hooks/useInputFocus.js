import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

// 全局焦点状态
let currentFocusState = 'normal'
let focusDebounceTimer = null
let blurDebounceTimer = null
const FOCUS_DEBOUNCE_DELAY = 50

// 防抖的焦点启用函数
async function debouncedEnableFocus() {
  // 清除可能存在的blur定时器
  if (blurDebounceTimer) {
    clearTimeout(blurDebounceTimer)
    blurDebounceTimer = null
  }
  
  // 如果已经是focused状态，不需要重复调用
  if (currentFocusState === 'focused') {
    return
  }
  
  // 清除之前的focus定时器
  if (focusDebounceTimer) {
    clearTimeout(focusDebounceTimer)
  }
  
  focusDebounceTimer = setTimeout(async () => {
    try {
      await invoke('focus_clipboard_window')
      currentFocusState = 'focused'
    } catch (error) {
      console.error('启用窗口焦点失败:', error)
    }
    focusDebounceTimer = null
  }, FOCUS_DEBOUNCE_DELAY)
}

// 防抖的焦点恢复函数
async function debouncedRestoreFocus() {
  // 清除可能存在的focus定时器
  if (focusDebounceTimer) {
    clearTimeout(focusDebounceTimer)
    focusDebounceTimer = null
  }
  
  // 如果已经是normal状态，不需要重复调用
  if (currentFocusState === 'normal') {
    return
  }
  
  // 清除之前的blur定时器
  if (blurDebounceTimer) {
    clearTimeout(blurDebounceTimer)
  }
  
  blurDebounceTimer = setTimeout(async () => {
    // 再次检查是否有其他输入框获得焦点
    const activeElement = document.activeElement
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true'
    )
    
    // 如果有其他输入框获得焦点，不恢复
    if (isInputFocused) {
      return
    }
    
    try {
      await invoke('restore_last_focus')
      currentFocusState = 'normal'
    } catch (error) {
      console.error('恢复工具窗口模式失败:', error)
    }
    blurDebounceTimer = null
  }, FOCUS_DEBOUNCE_DELAY)
}

// 输入框焦点管理 Hook
// 当输入框获得焦点时启用窗口焦点，失去焦点时恢复工具窗口模式
export function useInputFocus() {
  const inputRef = useRef(null)

  useEffect(() => {
    const element = inputRef.current
    if (!element) return

    const handleFocus = () => {
      debouncedEnableFocus()
    }

    const handleBlur = () => {
      debouncedRestoreFocus()
    }

    element.addEventListener('focus', handleFocus)
    element.addEventListener('blur', handleBlur)

    // 检查元素是否已经有焦点（例如通过 autoFocus）
    // 使用 setTimeout 确保在 DOM 完全更新后检查
    const checkInitialFocus = setTimeout(() => {
      if (document.activeElement === element) {
        // 如果元素已经有焦点，立即启用窗口焦点
        debouncedEnableFocus()
      }
    }, 0)

    return () => {
      element.removeEventListener('focus', handleFocus)
      element.removeEventListener('blur', handleBlur)
      clearTimeout(checkInitialFocus)
    }
  }, [])

  return inputRef
}

// 立即启用窗口焦点（跳过防抖）
export async function focusWindowImmediately() {
  if (blurDebounceTimer) {
    clearTimeout(blurDebounceTimer)
    blurDebounceTimer = null
  }
  if (focusDebounceTimer) {
    clearTimeout(focusDebounceTimer)
    focusDebounceTimer = null
  }
  
  try {
    await invoke('focus_clipboard_window')
    currentFocusState = 'focused'
  } catch (error) {
    console.error('立即启用窗口焦点失败:', error)
  }
}

// 恢复工具窗口模式
export async function restoreFocus() {
  try {
    await invoke('restore_last_focus')
    currentFocusState = 'normal'
  } catch (error) {
    console.error('恢复焦点失败:', error)
  }
}


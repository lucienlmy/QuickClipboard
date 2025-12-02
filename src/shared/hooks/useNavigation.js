import { useEffect, useRef, useCallback } from 'react'
import { useSnapshot } from 'valtio'
import { navigationStore } from '@shared/store/navigationStore'
export function useNavigation({ 
  items = [], 
  virtuosoRef = null,
  onExecuteItem = null,
  enabled = true
}) {
  const snap = useSnapshot(navigationStore)
  const lastHoverIndexRef = useRef(-1)
  const hoverDebounceTimeoutRef = useRef(null)
  const keyboardNavigationTimeoutRef = useRef(null)
  const scrollTimeoutRef = useRef(null)
  const lastMousePositionRef = useRef({ x: 0, y: 0 })
  const navigateUp = useCallback(() => {
    if (!enabled || items.length === 0) return
    
    // 设置键盘导航模式
    navigationStore.setKeyboardNavigation(true)
    clearTimeout(keyboardNavigationTimeoutRef.current)
    keyboardNavigationTimeoutRef.current = setTimeout(() => {
      navigationStore.setKeyboardNavigation(false)
    }, 2000)
    
    let newIndex
    if (snap.currentSelectedIndex === -1) {
      newIndex = items.length - 1
    } else if (snap.currentSelectedIndex <= 0) {
      newIndex = items.length - 1
    } else {
      newIndex = snap.currentSelectedIndex - 1
    }
    
    navigationStore.setSelectedIndex(newIndex)
    
    // 滚动到视图
    if (virtuosoRef?.current) {
      virtuosoRef.current.scrollIntoView({
        index: newIndex,
        behavior: 'auto'
      })
    }
  }, [enabled, items.length, snap.currentSelectedIndex, virtuosoRef])

  const navigateDown = useCallback(() => {
    if (!enabled || items.length === 0) return
    
    // 设置键盘导航模式
    navigationStore.setKeyboardNavigation(true)
    clearTimeout(keyboardNavigationTimeoutRef.current)
    keyboardNavigationTimeoutRef.current = setTimeout(() => {
      navigationStore.setKeyboardNavigation(false)
    }, 2000)
    
    let newIndex
    if (snap.currentSelectedIndex === -1) {
      newIndex = 0
    } else if (snap.currentSelectedIndex >= items.length - 1) {
      newIndex = 0
    } else {
      newIndex = snap.currentSelectedIndex + 1
    }
    
    navigationStore.setSelectedIndex(newIndex)
    
    // 滚动到视图
    if (virtuosoRef?.current) {
      virtuosoRef.current.scrollIntoView({
        index: newIndex,
        behavior: 'auto'
      })
    }
  }, [enabled, items.length, snap.currentSelectedIndex, virtuosoRef])

  const executeCurrentItem = useCallback(() => {
    if (!enabled || snap.currentSelectedIndex < 0 || snap.currentSelectedIndex >= items.length) {
      return
    }
    
    if (onExecuteItem) {
      const item = items[snap.currentSelectedIndex]
      onExecuteItem(item, snap.currentSelectedIndex)
    }
  }, [enabled, snap.currentSelectedIndex, items, onExecuteItem])

  const handleItemHover = useCallback((index) => {
    if (snap.isScrolling) {
      return
    }
    
    // 如果索引没有变化，直接返回
    if (index === lastHoverIndexRef.current) {
      return
    }
    
    lastHoverIndexRef.current = index
    
    // 清除之前的防抖定时器
    if (hoverDebounceTimeoutRef.current) {
      clearTimeout(hoverDebounceTimeoutRef.current)
    }
    
    // 使用防抖来减少频繁的更新操作
    hoverDebounceTimeoutRef.current = setTimeout(() => {
      navigationStore.setKeyboardNavigation(false)
      if (keyboardNavigationTimeoutRef.current) {
        clearTimeout(keyboardNavigationTimeoutRef.current)
        keyboardNavigationTimeoutRef.current = null
      }
      
      navigationStore.setSelectedIndex(index)
      hoverDebounceTimeoutRef.current = null
    }, 10)
  }, [snap.isScrolling])

  const handleScrollStart = useCallback(() => {
    navigationStore.setScrolling(true)
  }, [])
  
  const handleScrollEnd = useCallback(() => {
    // 滚动结束后稍作延迟再允许鼠标悬停更新
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      navigationStore.setScrolling(false)
      
      const { x, y } = lastMousePositionRef.current
      
      if (x !== 0 || y !== 0) {
        const elementUnderMouse = document.elementFromPoint(x, y)
        
        if (elementUnderMouse) {
          let itemElement = elementUnderMouse
          while (itemElement && !itemElement.hasAttribute('data-index')) {
            itemElement = itemElement.parentElement
          }
          
          if (itemElement && itemElement.hasAttribute('data-index')) {
            const index = parseInt(itemElement.getAttribute('data-index'), 10)
            if (!isNaN(index) && index >= 0 && index < items.length) {
              handleItemHover(index)
            }
          }
        }
      }
    }, 50)
  }, [handleItemHover, items.length])
  
  // 监听鼠标移动，记录位置
  useEffect(() => {
    const handleMouseMove = (e) => {
      lastMousePositionRef.current = { x: e.clientX, y: e.clientY }
    }
    
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])
  
  // 清理
  useEffect(() => {
    return () => {
      if (hoverDebounceTimeoutRef.current) {
        clearTimeout(hoverDebounceTimeoutRef.current)
      }
      if (keyboardNavigationTimeoutRef.current) {
        clearTimeout(keyboardNavigationTimeoutRef.current)
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])
  
  // 当列表项数量变化时，检查当前选中索引是否有效
  useEffect(() => {
    if (snap.currentSelectedIndex >= items.length && items.length > 0) {
      navigationStore.setSelectedIndex(items.length - 1)
    } else if (items.length === 0) {
      navigationStore.resetNavigation()
    }
  }, [items.length, snap.currentSelectedIndex])
  
  return {
    currentSelectedIndex: snap.currentSelectedIndex,
    navigationMode: snap.navigationMode,
    navigateUp,
    navigateDown,
    executeCurrentItem,
    handleItemHover,
    handleScrollStart,
    handleScrollEnd
  }
}


import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { toggleWindowVisibility } from '@shared/api'

// 全局键盘导航Hook
export function useNavigationKeyboard({
  onNavigateUp = null,
  onNavigateDown = null,
  onExecuteItem = null,
  onTabLeft = null,
  onTabRight = null,
  onFocusSearch = null,
  onHideWindow = null,
  onTogglePin = null,
  onPreviousGroup = null,
  onNextGroup = null,
  enabled = true
}) {
  useEffect(() => {
    if (!enabled) return
    
    let unlistenNavigationAction = null
    
    // 设置导航事件监听
    const setupNavigationListener = async () => {
      try {
        unlistenNavigationAction = await listen('navigation-action', (event) => {
          const action = event.payload.action
          
          switch (action) {
            case 'navigate-up':
              if (onNavigateUp) onNavigateUp()
              break
            case 'navigate-down':
              if (onNavigateDown) onNavigateDown()
              break
            case 'execute-item':
              if (onExecuteItem) onExecuteItem()
              break
            case 'tab-left':
              if (onTabLeft) onTabLeft()
              break
            case 'tab-right':
              if (onTabRight) onTabRight()
              break
            case 'focus-search':
              if (onFocusSearch) onFocusSearch()
              break
            case 'hide-window':
              if (onHideWindow) {
                onHideWindow()
              } else {
                toggleWindowVisibility().catch(err => {
                  console.error('切换窗口可见性失败:', err)
                })
              }
              break
            case 'toggle-pin':
              if (onTogglePin) {
                onTogglePin()
              }
              break
            case 'previous-group':
              if (onPreviousGroup) onPreviousGroup()
              break
            case 'next-group':
              if (onNextGroup) onNextGroup()
              break
            default:
              break
          }
        })
      } catch (error) {
        console.error('设置导航监听器失败:', error)
      }
    }
    
    setupNavigationListener()
    
    // 清理
    return () => {
      if (unlistenNavigationAction) {
        unlistenNavigationAction()
      }
    }
  }, [
    enabled,
    onNavigateUp,
    onNavigateDown,
    onExecuteItem,
    onTabLeft,
    onTabRight,
    onFocusSearch,
    onHideWindow,
    onTogglePin,
    onPreviousGroup,
    onNextGroup
  ])
}


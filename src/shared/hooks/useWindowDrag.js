import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

// 自定义窗口拖拽 Hook
export function useWindowDrag(options = {}) {
  const { excludeSelectors = [], allowChildren = false } = options
  const elementRef = useRef(null)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const handleMouseDown = async (e) => {
      // 如果不允许子元素拖拽，只允许元素本身触发
      if (!allowChildren && e.target !== element) {
        return
      }

      // 检查是否点击了需要排除的元素
      for (const selector of excludeSelectors) {
        if (e.target.closest(selector)) {
          return
        }
      }

      // 检查是否是左键点击
      if (e.buttons !== 1) {
        return
      }

      try {
        // 恢复上次的焦点窗口
        await invoke('restore_last_focus')
      } catch (error) {
        console.error('恢复焦点窗口失败:', error)
      }

      // 启动拖拽
      startDrag(e)
    }

    const startDrag = async (initialEvent) => {
      if (isDraggingRef.current) return
      isDraggingRef.current = true

      try {
        // 调用 Rust 后端开始拖拽
        await invoke('start_custom_drag', {
          mouseScreenX: initialEvent.screenX,
          mouseScreenY: initialEvent.screenY
        })

        // 设置拖拽样式
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'move'

        // 监听鼠标松开事件
        const onMouseUp = async () => {
          // 停止 Rust 拖拽
          try {
            await invoke('stop_custom_drag')
          } catch (error) {
            console.error('停止拖拽失败:', error)
          }

          // 恢复样式
          document.body.style.userSelect = ''
          document.body.style.cursor = ''

          isDraggingRef.current = false

          // 移除事件监听
          document.removeEventListener('mouseup', onMouseUp)
        }

        // 监听鼠标松开
        document.addEventListener('mouseup', onMouseUp, { passive: false })

        // 阻止默认拖拽行为
        initialEvent.preventDefault()
      } catch (error) {
        console.error('启动拖拽失败:', error)
        isDraggingRef.current = false
      }
    }

    element.addEventListener('mousedown', handleMouseDown)

    return () => {
      element.removeEventListener('mousedown', handleMouseDown)
    }
  }, [excludeSelectors, allowChildren])

  return elementRef
}


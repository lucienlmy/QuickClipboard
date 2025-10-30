import { useSnapshot } from 'valtio'
import { toastStore, TOAST_POSITIONS } from '@shared/store/toastStore'
import Toast from './Toast'

// Toast 容器组件
function ToastContainer() {
  const { toasts } = useSnapshot(toastStore)

  if (toasts.length === 0) return null

  // 按位置分组 toasts
  const toastsByPosition = {
    [TOAST_POSITIONS.TOP_LEFT]: [],
    [TOAST_POSITIONS.TOP_RIGHT]: [],
    [TOAST_POSITIONS.BOTTOM_LEFT]: [],
    [TOAST_POSITIONS.BOTTOM_RIGHT]: []
  }

  toasts.forEach(toast => {
    const position = toast.position || TOAST_POSITIONS.TOP_RIGHT
    toastsByPosition[position].push(toast)
  })

  // 获取容器位置类名
  const getPositionClass = (position) => {
    const baseClass = 'fixed z-9999 flex flex-col gap-2 pointer-events-none'
    
    const topOffset = 'top-16'
    const sideOffset = 'left-4 right-4'
    const bottomOffset = 'bottom-4'
    
    switch (position) {
      case TOAST_POSITIONS.TOP_LEFT:
        return `${baseClass} ${topOffset} left-4`
      case TOAST_POSITIONS.TOP_RIGHT:
        return `${baseClass} ${topOffset} right-4`
      case TOAST_POSITIONS.BOTTOM_LEFT:
        return `${baseClass} ${bottomOffset} left-4`
      case TOAST_POSITIONS.BOTTOM_RIGHT:
        return `${baseClass} ${bottomOffset} right-4`
      default:
        return `${baseClass} ${topOffset} right-4`
    }
  }

  return (
    <>
      {Object.entries(toastsByPosition).map(([position, positionToasts]) => {
        if (positionToasts.length === 0) return null
        
        return (
          <div key={position} className={getPositionClass(position)}>
            <div className="flex flex-col gap-2 pointer-events-auto">
              {positionToasts.map((toast) => (
                <Toast
                  key={toast.id}
                  {...toast}
                  onClose={toastStore.removeToast}
                />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

export default ToastContainer


import { useEffect, useState } from 'react'
import { 
  IconCheck, 
  IconX, 
  IconAlertTriangle, 
  IconInfoCircle 
} from '@tabler/icons-react'
import { TOAST_POSITIONS } from '@shared/store/toastStore'

function Toast({ id, message, type, position, onClose }) {
  const [isLeaving, setIsLeaving] = useState(false)
  const [isEntering, setIsEntering] = useState(true)

  useEffect(() => {
    // 进入动画
    const timer = setTimeout(() => {
      setIsEntering(false)
    }, 10)
    return () => clearTimeout(timer)
  }, [])

  const handleClose = () => {
    setIsLeaving(true)
    setTimeout(() => {
      onClose(id)
    }, 300)
  }

  // 根据位置确定动画方向
  const getAnimationClass = () => {
    if (isEntering) {
      // 进入动画
      if (position === TOAST_POSITIONS.TOP_LEFT || position === TOAST_POSITIONS.BOTTOM_LEFT) {
        return '-translate-x-full opacity-0'
      }
      return 'translate-x-full opacity-0'
    }
    
    if (isLeaving) {
      // 离开动画
      if (position === TOAST_POSITIONS.TOP_LEFT || position === TOAST_POSITIONS.BOTTOM_LEFT) {
        return '-translate-x-full opacity-0'
      }
      return 'translate-x-full opacity-0'
    }
    
    return 'translate-x-0 opacity-100'
  }

  const config = {
    success: {
      icon: IconCheck,
      bgClass: 'bg-green-50 dark:bg-green-900/20',
      borderClass: 'border-green-200 dark:border-green-800',
      iconClass: 'text-green-600 dark:text-green-400',
      textClass: 'text-green-800 dark:text-green-200'
    },
    error: {
      icon: IconX,
      bgClass: 'bg-red-50 dark:bg-red-900/20',
      borderClass: 'border-red-200 dark:border-red-800',
      iconClass: 'text-red-600 dark:text-red-400',
      textClass: 'text-red-800 dark:text-red-200'
    },
    warning: {
      icon: IconAlertTriangle,
      bgClass: 'bg-orange-50 dark:bg-orange-900/20',
      borderClass: 'border-orange-200 dark:border-orange-800',
      iconClass: 'text-orange-600 dark:text-orange-400',
      textClass: 'text-orange-800 dark:text-orange-200'
    },
    info: {
      icon: IconInfoCircle,
      bgClass: 'bg-blue-50 dark:bg-blue-900/20',
      borderClass: 'border-blue-200 dark:border-blue-800',
      iconClass: 'text-blue-600 dark:text-blue-400',
      textClass: 'text-blue-800 dark:text-blue-200'
    }
  }

  const { icon: Icon, bgClass, borderClass, iconClass, textClass } = config[type] || config.info

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-80 max-w-md
        ${bgClass} ${borderClass}
        transition-all duration-300 ease-in-out
        ${getAnimationClass()}
      `}
    >
      <Icon size={20} className={`flex-shrink-0 ${iconClass}`} />
      <p className={`text-sm font-medium flex-1 ${textClass}`}>
        {message}
      </p>
      <button
        onClick={handleClose}
        className={`flex-shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${iconClass}`}
      >
        <IconX size={16} />
      </button>
    </div>
  )
}

export default Toast


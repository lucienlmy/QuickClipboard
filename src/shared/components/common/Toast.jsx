import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useEffect, useState } from 'react';
import { TOAST_POSITIONS, TOAST_SIZES } from '@shared/store/toastStore';
function Toast({
  id,
  message,
  type,
  position,
  size = TOAST_SIZES.MEDIUM,
  onClose
}) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [isEntering, setIsEntering] = useState(true);
  useEffect(() => {
    // 进入动画
    const timer = setTimeout(() => {
      setIsEntering(false);
    }, 10);
    return () => clearTimeout(timer);
  }, []);
  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose(id);
    }, 300);
  };

  // 根据位置确定动画方向
  const getAnimationClass = () => {
    if (isEntering) {
      // 进入动画
      if (position === TOAST_POSITIONS.TOP_LEFT || position === TOAST_POSITIONS.BOTTOM_LEFT) {
        return '-translate-x-full opacity-0';
      }
      return 'translate-x-full opacity-0';
    }
    if (isLeaving) {
      // 离开动画
      if (position === TOAST_POSITIONS.TOP_LEFT || position === TOAST_POSITIONS.BOTTOM_LEFT) {
        return '-translate-x-full opacity-0';
      }
      return 'translate-x-full opacity-0';
    }
    return 'translate-x-0 opacity-100';
  };
  const config = {
    success: {
      icon: "ti ti-check",
      bgClass: 'bg-green-50 dark:bg-green-900/20',
      borderClass: 'border-green-200 dark:border-green-800',
      iconClass: 'text-green-600 dark:text-green-400',
      textClass: 'text-green-800 dark:text-green-200'
    },
    error: {
      icon: "ti ti-x",
      bgClass: 'bg-red-50 dark:bg-red-900/20',
      borderClass: 'border-red-200 dark:border-red-800',
      iconClass: 'text-red-600 dark:text-red-400',
      textClass: 'text-red-800 dark:text-red-200'
    },
    warning: {
      icon: "ti ti-alert-triangle",
      bgClass: 'bg-orange-50 dark:bg-orange-900/20',
      borderClass: 'border-orange-200 dark:border-orange-800',
      iconClass: 'text-orange-600 dark:text-orange-400',
      textClass: 'text-orange-800 dark:text-orange-200'
    },
    info: {
      icon: "ti ti-info-circle",
      bgClass: 'bg-blue-50 dark:bg-blue-900/20',
      borderClass: 'border-blue-200 dark:border-blue-800',
      iconClass: 'text-blue-600 dark:text-blue-400',
      textClass: 'text-blue-800 dark:text-blue-200'
    }
  };
  const {
    icon,
    bgClass,
    borderClass,
    iconClass,
    textClass
  } = config[type] || config.info;

  // 根据大小获取样式类
  const getSizeClasses = () => {
    switch (size) {
      case TOAST_SIZES.EXTRA_SMALL:
        return {
          padding: 'px-2 py-1.5',
          gap: 'gap-2',
          iconSize: 16,
          textSize: 'text-xs',
          closeButtonSize: 12,
          closeButtonPadding: 'p-0.5',
          maxWidth: 'max-w-xs'
        };
      case TOAST_SIZES.SMALL:
        return {
          padding: 'px-3 py-2',
          gap: 'gap-2.5',
          iconSize: 18,
          textSize: 'text-xs',
          closeButtonSize: 14,
          closeButtonPadding: 'p-0.5',
          maxWidth: 'max-w-sm'
        };
      case TOAST_SIZES.MEDIUM:
        return {
          padding: 'px-4 py-3',
          gap: 'gap-3',
          iconSize: 20,
          textSize: 'text-sm',
          closeButtonSize: 16,
          closeButtonPadding: 'p-1',
          maxWidth: 'max-w-md'
        };
      case TOAST_SIZES.LARGE:
        return {
          padding: 'px-5 py-4',
          gap: 'gap-3.5',
          iconSize: 24,
          textSize: 'text-base',
          closeButtonSize: 18,
          closeButtonPadding: 'p-1.5',
          maxWidth: 'max-w-lg'
        };
      case TOAST_SIZES.EXTRA_LARGE:
        return {
          padding: 'px-6 py-5',
          gap: 'gap-4',
          iconSize: 28,
          textSize: 'text-lg',
          closeButtonSize: 20,
          closeButtonPadding: 'p-2',
          maxWidth: 'max-w-xl'
        };
      default:
        return {
          padding: 'px-4 py-3',
          gap: 'gap-3',
          iconSize: 20,
          textSize: 'text-sm',
          closeButtonSize: 16,
          closeButtonPadding: 'p-1',
          maxWidth: 'max-w-md'
        };
    }
  };
  const sizeClasses = getSizeClasses();
  return <div className={`
        inline-flex items-center rounded-lg border shadow-lg
        ${sizeClasses.padding} ${sizeClasses.gap}
        ${sizeClasses.maxWidth}
        ${bgClass} ${borderClass}
        transition-all duration-300 ease-in-out
        ${getAnimationClass()}
      `}>
      <i className={`${icon} flex-shrink-0 ${iconClass}`} style={{ fontSize: sizeClasses.iconSize }}></i>
      <p className={`${sizeClasses.textSize} font-medium ${textClass} break-words`}>
        {message}
      </p>
      <button onClick={handleClose} className={`flex-shrink-0 ${sizeClasses.closeButtonPadding} rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${iconClass}`} aria-label="关闭">
        <i className="ti ti-x"></i>
      </button>
    </div>;
}
export default Toast;
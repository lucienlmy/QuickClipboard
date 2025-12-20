import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';

// 通用底部菜单弹出组件
const BottomMenuPopup = forwardRef(({
  icon: Icon,
  label,
  title,
  menuItems = [],
  width = 120
}, ref) => {
  const settings = useSnapshot(settingsStore);
  const uiAnimationEnabled = settings.uiAnimationEnabled !== false;
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [expandedMenuItem, setExpandedMenuItem] = useState(null);
  const closeTimerRef = useRef(null);
  const animationTimerRef = useRef(null);
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, []);
  const handleClose = () => {
    if (isPinned) return;
    setIsClosing(true);
    animationTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 200);
  };
  const togglePopup = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(!isOpen);
  };

  // 切换固定状态
  const togglePin = e => {
    if (e) {
      e.stopPropagation();
    }
    setIsPinned(!isPinned);
  };

  // 临时显示菜单面板
  const showTemporarily = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!isOpen) {
      setIsOpen(true);
    }
    if (!isPinned) {
      closeTimerRef.current = setTimeout(() => {
        handleClose();
      }, 500);
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    togglePin: () => togglePin(null),
    showTemporarily
  }));
  const handleMouseEnter = () => {
    if (isClosing) {
      return;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const handleMouseLeave = () => {
    if (!isPinned && isOpen && !isClosing) {
      closeTimerRef.current = setTimeout(() => {
        handleClose();
      }, 150);
    }
  };

  // 切换菜单项展开状态
  const toggleMenuItem = menuItemId => {
    setExpandedMenuItem(expandedMenuItem === menuItemId ? null : menuItemId);
  };
  const handleSelectOption = (menuItem, option) => {
    if (menuItem.onSelect) {
      menuItem.onSelect(option.value);
    }
    setExpandedMenuItem(null);
  };
  return <>
    <div className="relative flex flex-col items-end" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {/* 弹出面板 */}
      {isOpen && <div className={`groups-panel absolute bottom-full right-0 backdrop-blur-xl bg-white/95 dark:bg-gray-800/95 border border-b-0 border-gray-200/50 dark:border-gray-700/50 rounded-t-xl shadow-2xl z-40 overflow-hidden flex flex-col ${uiAnimationEnabled ? (isClosing ? 'animate-slide-down' : 'animate-slide-up') : ''}`} style={{
        width: `${width}px`,
        maxHeight: '350px'
      }}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-200/50 dark:border-gray-700/50">
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {title}
          </h3>
          <div className="flex items-center gap-0.5">
            <button onClick={togglePin} className={`p-1 rounded transition-all ${isPinned ? 'bg-blue-100/60 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-200/60 dark:hover:bg-gray-700/60 text-gray-500 dark:text-gray-400'}`} title={isPinned ? '取消固定' : '固定'}>
              {isPinned ? <i className="ti ti-pinned" style={{
                fontSize: 12
              }}></i> : <i className="ti ti-pin" style={{
                fontSize: 12
              }}></i>}
            </button>
          </div>
        </div>

        {/* 菜单项列表 */}
        <div className="flex-1 overflow-y-auto py-1">
          {menuItems.map(menuItem => {
            const isExpanded = expandedMenuItem === menuItem.id;
            const currentOption = menuItem.options?.find(opt => opt.value === menuItem.currentValue);
            return <div key={menuItem.id} className="border-b border-gray-200/30 dark:border-gray-700/30 last:border-b-0">
              <div onClick={() => toggleMenuItem(menuItem.id)} className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all" title={menuItem.label}>
                {menuItem.icon && <div className="flex-shrink-0">
                  <i className={menuItem.icon} style={{ fontSize: 14 }} />
                </div>}

                <div className="flex-1 text-[10px] text-gray-500 dark:text-gray-400 truncate">
                  {currentOption?.label || '-'}
                </div>

                <div className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  <i className="ti ti-chevron-right" style={{
                    fontSize: 12
                  }}></i>
                </div>
              </div>

              {/* 子选项列表 */}
              {isExpanded && menuItem.options && <div className="bg-gray-50/50 dark:bg-gray-900/50">
                {menuItem.options.map(option => {
                  const OptionIcon = option.icon;
                  const isActive = menuItem.currentValue === option.value;
                  return <div key={option.value} onClick={e => {
                    e.stopPropagation();
                    handleSelectOption(menuItem, option);
                  }} className="group relative">
                    <div className={`flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-all ${isActive ? 'bg-blue-500 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
                      {OptionIcon && <div className="flex-shrink-0">
                        <OptionIcon size={12} />
                      </div>}

                      <div className="flex-1 text-xs truncate">
                        {option.label}
                      </div>

                      {isActive && <div className="flex-shrink-0">
                        <i className="ti ti-check" style={{
                          fontSize: 10
                        }}></i>
                      </div>}
                    </div>
                  </div>;
                })}
              </div>}
            </div>;
          })}
        </div>
      </div>}

      {/* 触发按钮 */}
      <button onClick={togglePopup} className={`flex items-center justify-center gap-1.5 h-5 transition-all duration-300 ${isOpen ? 'bg-white/95 dark:bg-gray-800/95 text-gray-900 dark:text-gray-100 shadow-lg rounded-b-lg border border-t-0 border-gray-200/50 dark:border-gray-700/50' : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-300/50 dark:hover:bg-gray-800/50 rounded-lg'}`} style={{
        width: `${width}px`
      }} title={title}>
        {Icon && <i className={Icon} style={{ fontSize: 12 }} />}
        <span className="text-[10px] font-medium truncate" style={{
          maxWidth: `${width - 40}px`
        }}>
          {label}
        </span>
      </button>
    </div>
  </>;
});
BottomMenuPopup.displayName = 'BottomMenuPopup';
export default BottomMenuPopup;
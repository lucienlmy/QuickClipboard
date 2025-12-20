import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useInputFocus, focusWindowImmediately } from '@shared/hooks/useInputFocus';
import { useSnapshot } from 'valtio';
import { settingsStore } from '@shared/store/settingsStore';
const TitleBarSearch = forwardRef(({
  value,
  onChange,
  placeholder,
  onNavigate,
  isVertical = false,
  position = 'top'
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useInputFocus();
  const searchRef = useRef(null);
  const settings = useSnapshot(settingsStore);
  const uiAnimationEnabled = settings.uiAnimationEnabled !== false;

  // 搜索框清空按钮样式
  const searchInputStyle = `
        .titlebar-search input[type="search"]::-webkit-search-cancel-button {
            -webkit-appearance: none;
            appearance: none;
            height: 14px;
            width: 14px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E");
            background-size: 14px 14px;
            cursor: pointer;
            opacity: 0.6;
            transition: opacity 0.2s;
        }
        .titlebar-search input[type="search"]::-webkit-search-cancel-button:hover {
            opacity: 1;
        }
    `;

  // 决定是否显示为扩展状态
  const shouldExpand = isFocused || value.length > 0;
  useEffect(() => {
    setIsExpanded(shouldExpand);
  }, [shouldExpand]);
  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  };
  const handleFocus = () => {
    setIsFocused(true);
    if (inputRef.current && value) {
      setTimeout(() => {
        inputRef.current.select();
      }, 100);
    }
  };
  const matchesShortcut = (e, shortcutStr) => {
    if (!shortcutStr) return false;
    const parts = shortcutStr.split('+');
    const modifiers = [];
    let mainKey = '';
    parts.forEach(part => {
      if (['Ctrl', 'Control', 'Alt', 'Shift', 'Win', 'Meta'].includes(part)) {
        modifiers.push(part);
      } else {
        mainKey = part;
      }
    });
    const hasCtrl = modifiers.includes('Ctrl') || modifiers.includes('Control');
    const hasAlt = modifiers.includes('Alt');
    const hasShift = modifiers.includes('Shift');
    const hasMeta = modifiers.includes('Win') || modifiers.includes('Meta');
    if (e.ctrlKey !== hasCtrl || e.altKey !== hasAlt || e.shiftKey !== hasShift || e.metaKey !== hasMeta) {
      return false;
    }
    return e.key === mainKey || e.key.toUpperCase() === mainKey.toUpperCase();
  };
  const handleKeyDown = e => {
    if (matchesShortcut(e, settings.focusSearchShortcut)) {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (matchesShortcut(e, settings.navigateUpShortcut)) {
      e.preventDefault();
      inputRef.current?.blur();
      setTimeout(() => {
        if (onNavigate) onNavigate('up');
      }, 10);
    } else if (matchesShortcut(e, settings.navigateDownShortcut)) {
      e.preventDefault();
      inputRef.current?.blur();
      setTimeout(() => {
        if (onNavigate) onNavigate('down');
      }, 10);
    } else if (matchesShortcut(e, settings.executeItemShortcut)) {
      e.preventDefault();
      inputRef.current?.blur();
      setTimeout(() => {
        if (onNavigate) onNavigate('execute');
      }, 10);
    } else if (matchesShortcut(e, settings.hideWindowShortcut)) {
      e.preventDefault();
      inputRef.current?.blur();
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    focus: async () => {
      if (inputRef.current) {
        try {
          await focusWindowImmediately();
          inputRef.current.focus();
          inputRef.current.select();
        } catch (error) {
          console.error('聚焦搜索框失败:', error);
        }
      }
    }
  }));
  return <>
            <style>{searchInputStyle}</style>
            <div ref={searchRef} className={`titlebar-search relative flex ${isVertical ? 'flex-col items-center justify-end h-7' : 'flex-row items-center justify-end w-7'}`}>
                {/* 输入框 - 根据方向展开 */}
                <input ref={inputRef} type="search" value={value} onChange={e => onChange(e.target.value)} onFocus={handleFocus} onBlur={() => setIsFocused(false)} onKeyDown={handleKeyDown} placeholder={placeholder} style={isVertical ? {
        writingMode: 'vertical-rl',
        textAlign: 'start'
      } : {}} className={`absolute ${isVertical ? 'bottom-6 left-0 w-7 py-2' : 'right-6 h-7 px-2'} text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300/50 dark:border-gray-600/50 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-600 focus:border-blue-500 dark:focus:border-blue-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 shadow-sm ${uiAnimationEnabled ? 'transition-all duration-300 ease-in-out' : ''} ${isExpanded ? isVertical ? 'h-48 opacity-100 mb-1' : 'w-30 opacity-100 mr-1' : (isVertical ? 'h-0' : 'w-0') + ' opacity-0 pointer-events-none border-0'}`} />

                {/* 搜索图标 - 始终保持在原位 */}
                <button onClick={handleIconClick} className={`relative z-10 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 hover:text-blue-500 dark:hover:bg-gray-700 dark:text-gray-300 ${uiAnimationEnabled ? 'transition-all duration-200' : ''}`} title="搜索">
                    <i className="ti ti-search" style={{
          fontSize: 16
        }}></i>
                </button>
            </div>
        </>;
});
TitleBarSearch.displayName = 'TitleBarSearch';
export default TitleBarSearch;
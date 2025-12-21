import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// 组合快捷键输入组件
function ShortcutComboInput({ 
  value = '', 
  onChange,
  modifierOptions = ['Ctrl', 'Shift', 'Alt'],
  fixedModifiers = [],
  disabledKeys = [],
  hasError,
  errorMessage 
}) {
  const { t } = useTranslation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isListeningKey, setIsListeningKey] = useState(false);
  const containerRef = useRef(null);
  const keyInputRef = useRef(null);
  
  const parseShortcut = (shortcutStr) => {
    if (!shortcutStr) {
      return { modifiers: [...fixedModifiers], key: '' };
    }
    
    const parts = shortcutStr.split('+');
    const allModifiers = ['Ctrl', 'Shift', 'Alt', 'Meta', 'Win'];
    const modifiers = [];
    let key = '';
    
    for (const part of parts) {
      if (allModifiers.includes(part)) {
        modifiers.push(part);
      } else {
        key = part;
      }
    }
    
    for (const fixed of fixedModifiers) {
      if (!modifiers.includes(fixed)) {
        modifiers.unshift(fixed);
      }
    }
    
    return { modifiers, key };
  };
  
  const { modifiers: parsedModifiers, key: parsedKey } = parseShortcut(value);
  
  const [internalModifiers, setInternalModifiers] = useState(parsedModifiers);
  const [internalKey, setInternalKey] = useState(parsedKey);
  
  // 组合快捷键并通知外部
  const buildAndNotify = (modifiers, key) => {
    if (key) {
      onChange([...modifiers, key].join('+'));
    } else {
      setInternalModifiers(modifiers);
    }
  };
  
  const modifiers = internalModifiers;
  const key = internalKey;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
        setIsListeningKey(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleModifier = (mod) => {
    if (fixedModifiers.includes(mod)) return;
    
    let newModifiers;
    if (modifiers.includes(mod)) {
      newModifiers = modifiers.filter(m => m !== mod);
    } else {
      newModifiers = [...modifiers, mod];
    }
    buildAndNotify(newModifiers, key);
  };

  const removeModifier = (mod, e) => {
    e.stopPropagation();
    if (fixedModifiers.includes(mod)) return;
    const newModifiers = modifiers.filter(m => m !== mod);
    buildAndNotify(newModifiers, key);
  };
  
  // 从 code 转换为按键名称
  const codeToKeyName = (code) => {
    // 字母键 KeyA -> A
    if (code.startsWith('Key')) {
      return code.slice(3);
    }
    // 数字键 Digit1 -> 1
    if (code.startsWith('Digit')) {
      return code.slice(5);
    }
    // 小键盘数字 Numpad1 -> Num1
    if (code.startsWith('Numpad')) {
      return 'Num' + code.slice(6);
    }
    // 功能键 F1-F12
    if (/^F\d+$/.test(code)) {
      return code;
    }
    // 特殊键映射
    const specialKeys = {
      'Space': 'Space',
      'Enter': 'Enter',
      'Backspace': 'Backspace',
      'Tab': 'Tab',
      'Escape': 'Escape',
      'Delete': 'Delete',
      'Insert': 'Insert',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
      'Backquote': '`',
      'Minus': '-',
      'Equal': '=',
      'BracketLeft': '[',
      'BracketRight': ']',
      'Backslash': '\\',
      'Semicolon': ';',
      'Quote': "'",
      'Comma': ',',
      'Period': '.',
      'Slash': '/',
    };
    return specialKeys[code] || null;
  };

  // 处理按键输入
  const handleKeyDown = (e) => {
    if (!isListeningKey) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const code = e.code;
    
    if (code === 'Escape') {
      setIsListeningKey(false);
      return;
    }
    
    // 忽略修饰键
    if (['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code)) {
      return;
    }
    
    const keyName = codeToKeyName(code);
    if (!keyName) {
      return;
    }
    
    if (disabledKeys.includes(keyName)) {
      return;
    }
    
    setInternalKey(keyName);
    onChange([...modifiers, keyName].join('+'));
    setIsListeningKey(false);
  };

  const removeKey = (e) => {
    e.stopPropagation();
    setInternalKey('');
    onChange('');
    setIsListeningKey(true);
    setTimeout(() => {
      keyInputRef.current?.focus();
    }, 0);
  };

  useEffect(() => {
    if (value === '') {
      setInternalKey('');
    } else {
      const { modifiers: newModifiers, key: newKey } = parseShortcut(value);
      setInternalModifiers(newModifiers);
      setInternalKey(newKey);
    }
  }, [value]);
  
  // 开始监听按键
  const startListeningKey = (e) => {
    e.stopPropagation();
    setIsDropdownOpen(false);
    setIsListeningKey(true);
    keyInputRef.current?.focus();
  };
  
  return (
    <div className="flex flex-col items-end gap-1">
      <div ref={containerRef} className="relative">
        <div 
          className={`
            inline-flex items-center h-9 px-2 gap-1
            border rounded-lg cursor-pointer
            bg-white dark:bg-gray-700
            transition-all duration-200
            ${hasError 
              ? 'border-red-500 ring-1 ring-red-500/30' 
              : isDropdownOpen || isListeningKey
                ? 'border-blue-500 ring-1 ring-blue-500/50' 
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }
          `}
          onClick={() => !isListeningKey && setIsDropdownOpen(!isDropdownOpen)}
        >
          {/* 修饰键标签 */}
          {modifiers.map(mod => (
            <span 
              key={mod}
              className={`
                inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium
                ${fixedModifiers.includes(mod)
                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                }
              `}
            >
              {mod}
              {!fixedModifiers.includes(mod) && (
                <button
                  type="button"
                  onClick={(e) => removeModifier(mod, e)}
                  className="ml-0.5 hover:text-red-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </span>
          ))}
          
          {key ? (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300">
              {key}
              <button
                type="button"
                onClick={removeKey}
                className="ml-0.5 hover:text-red-500 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={startListeningKey}
              className={`
                px-2 py-0.5 rounded text-xs border border-dashed
                ${isListeningKey 
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 animate-pulse'
                  : 'border-gray-300 dark:border-gray-500 text-gray-400 dark:text-gray-500 hover:border-gray-400 hover:text-gray-500'
                }
              `}
            >
              {isListeningKey ? t('settings.shortcuts.pressKey') : t('settings.shortcuts.addKey')}
            </button>
          )}
          
          {/* 输入框 */}
          <input
            ref={keyInputRef}
            type="text"
            className="absolute opacity-0 w-0 h-0"
            onKeyDown={handleKeyDown}
            onBlur={() => setIsListeningKey(false)}
          />
          
          {/* 下拉箭头 */}
          <svg 
            className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        {/* 下拉菜单 */}
        {isDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 min-w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 py-1">
            {modifierOptions.map(mod => {
              const isSelected = modifiers.includes(mod);
              const isFixed = fixedModifiers.includes(mod);
              
              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => toggleModifier(mod)}
                  disabled={isFixed}
                  className={`
                    w-full px-3 py-1.5 text-left text-sm flex items-center justify-between
                    ${isFixed 
                      ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' 
                      : isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  <span>{mod}</span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      {/* 错误信息 */}
      {hasError && errorMessage && (
        <span className="text-xs text-red-500 dark:text-red-400">
          {errorMessage}
        </span>
      )}
    </div>
  );
}

export default ShortcutComboInput;

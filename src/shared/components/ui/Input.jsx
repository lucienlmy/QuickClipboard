import { useEffect, useRef, useState } from 'react';

function Input({
  type = 'text',
  value,
  onChange,
  onCommit,
  commitOnBlur = false,
  placeholder = '',
  suffix,
  className = '',
  onBlur,
  onFocus,
  onKeyDown,
  ...restProps
}) {
  const [draftValue, setDraftValue] = useState(value ?? '');
  const focusedRef = useRef(false);

  useEffect(() => {
    if (commitOnBlur && !focusedRef.current) {
      setDraftValue(value ?? '');
    }
  }, [value, commitOnBlur]);

  const inputValue = commitOnBlur ? draftValue : value;

  const handleChange = (e) => {
    if (commitOnBlur) {
      setDraftValue(e.target.value);
      return;
    }
    onChange?.(e);
  };

  const commitNow = () => {
    if (!commitOnBlur) return;
    onCommit?.(draftValue);
  };

  const handleBlur = (e) => {
    focusedRef.current = false;
    commitNow();
    onBlur?.(e);
  };

  const handleFocus = (e) => {
    focusedRef.current = true;
    onFocus?.(e);
  };

  const handleKeyDown = (e) => {
    if (commitOnBlur && e.key === 'Enter') {
      e.currentTarget.blur();
      return;
    }
    onKeyDown?.(e);
  };

  if (suffix) {
    return <div className="flex items-center gap-2">
        <input type={type} value={inputValue} onChange={handleChange} placeholder={placeholder} className={`px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`} {...restProps} onBlur={handleBlur} onFocus={handleFocus} onKeyDown={handleKeyDown} />
        <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {suffix}
        </span>
      </div>;
  }
  return <input type={type} value={inputValue} onChange={handleChange} placeholder={placeholder} className={`px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`} {...restProps} onBlur={handleBlur} onFocus={handleFocus} onKeyDown={handleKeyDown} />;
}
export default Input;
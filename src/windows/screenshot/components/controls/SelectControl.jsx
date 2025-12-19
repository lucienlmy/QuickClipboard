import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

const SelectControl = ({ param, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const currentValue = value || param.defaultValue || '';
  const currentOption = param.options?.find(opt => opt.value === currentValue);
  
  const filteredOptions = param.searchable !== false
    ? param.options?.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      ) || []
    : param.options || [];

  useLayoutEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const maxDropdownHeight = 256;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;

      const showAbove = spaceBelow < maxDropdownHeight && spaceAbove > spaceBelow;
      const availableHeight = showAbove ? spaceAbove : spaceBelow;
      const actualMaxHeight = Math.min(maxDropdownHeight, availableHeight);
      
      setDropdownPosition({
        top: showAbove ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: actualMaxHeight,
        showAbove,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      if (param.searchable !== false) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, param.searchable]);

  const handleSelect = (optionValue) => {
    onChange?.(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const dropdownContent = isOpen && createPortal(
    <div 
      ref={dropdownRef}
      className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl flex flex-col"
      style={{ 
        ...(dropdownPosition.showAbove 
          ? { bottom: window.innerHeight - dropdownPosition.top }
          : { top: dropdownPosition.top }
        ),
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        maxHeight: dropdownPosition.maxHeight,
      }}
    >
      {param.searchable !== false && (
        <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={param.searchPlaceholder || "搜索..."}
            className="w-full px-2 py-1 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
          />
        </div>
      )}
      
      <div className="overflow-y-auto overflow-x-hidden flex-1 rounded-b-lg">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => !option.disabled && handleSelect(option.value)}
              disabled={option.disabled}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                index === filteredOptions.length - 1 ? 'rounded-b-lg' : ''
              } ${
                option.disabled
                  ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : option.value === currentValue
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              style={{ fontFamily: param.preview ? option.value : undefined }}
            >
              {option.label}
            </button>
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 rounded-b-lg">
            未找到匹配项
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      {param.label && (
        <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {param.label}
        </label>
      )}
      
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
        >
          <span 
            className="truncate"
            style={{ fontFamily: param.preview && currentOption ? currentValue : undefined }}
          >
            {currentOption?.label || '选择...'}
          </span>
          <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'} text-gray-500 text-base flex-shrink-0`}></i>
        </button>
      </div>
      
      {dropdownContent}
    </div>
  );
};

export default SelectControl;

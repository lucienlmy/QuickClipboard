import React, { useState, useRef, useEffect } from 'react';

const SelectControl = ({ param, value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const currentValue = value || param.defaultValue || '';
  const currentOption = param.options?.find(opt => opt.value === currentValue);
  
  const filteredOptions = param.searchable !== false
    ? param.options?.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      ) || []
    : param.options || [];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
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

  return (
    <div className="flex flex-col gap-1.5" ref={dropdownRef}>
      {param.label && (
        <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {param.label}
        </label>
      )}
      
      <div className="relative">
        <button
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

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-64 flex flex-col">
            {param.searchable !== false && (
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
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
            
            <div className="overflow-y-auto flex-1">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    disabled={option.disabled}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
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
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  未找到匹配项
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectControl;

import React from 'react';

const MultiToggleControl = ({ param, value, onChange }) => {
  const currentValues = Array.isArray(value) ? value : [];
  
  const handleToggle = (optionValue) => {
    const newValues = currentValues.includes(optionValue)
      ? currentValues.filter(v => v !== optionValue)
      : [...currentValues, optionValue];
    onChange?.(newValues);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {param.label && (
        <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {param.label}
        </label>
      )}
      <div className="flex gap-1.5">
        {param.options?.map((option) => {
          const isActive = currentValues.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleToggle(option.value)}
              className={`
                flex items-center justify-center px-3 py-1.5 rounded text-sm font-medium transition-all
                ${isActive
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }
              `}
              title={option.label}
            >
              {option.icon && <i className={`${option.icon} text-base`}></i>}
              {!param.iconOnly && option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MultiToggleControl;

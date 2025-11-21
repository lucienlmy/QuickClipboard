export default function SegmentedControl({ param, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
        {param.icon && <i className={`${param.icon} text-xs text-gray-400`}></i>}
        {param.label}
      </span>
      <div className="grid grid-flow-col auto-cols-fr gap-1">
        {param.options?.map((option) => (
          <button
            key={option.value}
            type="button"
            className={[
              'text-xs px-2 py-1 rounded-md border transition-colors duration-150',
              value === option.value
                ? 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ].join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

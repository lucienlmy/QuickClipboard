export default function SegmentedControl({ param, value, onChange }) {
  const containerClass = param.wrap
    ? 'grid gap-1'
    : 'grid grid-flow-col auto-cols-fr gap-1';

  const gridStyle = param.wrap && param.columns
    ? { gridTemplateColumns: `repeat(${param.columns}, minmax(0, 1fr))` }
    : undefined;

  const getButtonClasses = (optionValue) => (
    [
      'text-xs px-2 py-1 rounded-md border transition-colors duration-150 flex items-center justify-center gap-1',
      param.iconOnly ? 'px-1 py-1' : '',
      value === optionValue
        ? 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
    ].join(' ')
  );

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
        {param.icon && <i className={`${param.icon} text-xs text-gray-400`}></i>}
        {param.label}
      </span>
      <div className={containerClass} style={gridStyle}>
        {param.options?.map((option) => (
          <button
            key={option.value}
            type="button"
            className={getButtonClasses(option.value)}
            onClick={() => onChange(option.value)}
            title={option.label}
            aria-label={option.label}
          >
            {option.icon && <i className={`${option.icon} ${param.iconOnly ? 'text-base' : 'text-[11px]'}`}></i>}
            {!param.iconOnly && option.label}
            {param.iconOnly && (
              <span className="sr-only">{option.label}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

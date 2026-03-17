function SegmentedControl({
  value,
  onChange,
  options,
  wrap = false,
  columns,
  className = ''
}) {
  const containerClass = wrap
    ? 'grid gap-0 overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
    : 'inline-flex w-fit overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700';

  const containerStyle = wrap && columns
    ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
    : undefined;

  const getButtonClasses = (optionValue, index) => {
    if (wrap) {
      const cols = Math.max(1, Number(columns) || 1);
      const row = Math.floor(index / cols);
      const col = index % cols;
      const lastIndex = options.length - 1;
      const lastRow = Math.floor(lastIndex / cols);
      const lastInFirstRow = Math.min(cols - 1, lastIndex);

      return [
        'px-3 py-2 text-sm font-medium transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset',
        col !== 0 ? 'border-l border-gray-300 dark:border-gray-600' : '',
        row !== 0 ? 'border-t border-gray-300 dark:border-gray-600' : '',
        index === 0 ? 'rounded-tl-lg' : '',
        index === lastInFirstRow ? 'rounded-tr-lg' : '',
        row === lastRow && col === 0 ? 'rounded-bl-lg' : '',
        index === lastIndex ? 'rounded-br-lg' : '',
        value === optionValue
          ? '!bg-blue-500 hover:!bg-blue-600 !text-white'
          : 'bg-transparent text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600'
      ].filter(Boolean).join(' ');
    }

    return [
      'px-3 py-2 text-sm font-medium transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset',
      index === 0 ? 'rounded-l-lg' : '',
      index === options.length - 1 ? 'rounded-r-lg' : '',
      index !== 0 ? 'border-l border-gray-300 dark:border-gray-600' : '',
      value === optionValue
        ? '!bg-blue-500 hover:!bg-blue-600 !text-white'
        : 'bg-transparent text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600'
    ].filter(Boolean).join(' ');
  };

  return (
    <div className={`${containerClass} ${className}`} style={containerStyle}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          className={getButtonClasses(option.value, index)}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default SegmentedControl;


import IncrementDecrementButtons from './IncrementDecrementButtons';

// 数字输入控件
export default function NumberInputControl({ param, value, onChange }) {
  const handleChange = (e) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue)) {
      const clampedValue = Math.min(Math.max(newValue, param.min ?? 0), param.max ?? 99);
      onChange(clampedValue);
    }
  };

  const handleIncrement = () => {
    const newValue = Math.min((value || 0) + (param.step || 1), param.max ?? 99);
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max((value || 0) - (param.step || 1), param.min ?? 0);
    onChange(newValue);
  };

  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
        {param.label}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value ?? param.min ?? 0}
          onChange={handleChange}
          min={param.min}
          max={param.max}
          step={param.step || 1}
          className="w-12 h-6 px-1.5 text-center text-xs font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <IncrementDecrementButtons
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
        />
      </div>
    </label>
  );
}

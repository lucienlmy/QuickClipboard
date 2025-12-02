import { useCallback } from 'react';
import IncrementDecrementButtons from './IncrementDecrementButtons';

export default function SliderControl({ param, value, onChange }) {
  const display = param.formatter ? param.formatter(value) : `${value}${param.unit || ''}`;
  const sliderMin = param.min ?? 0;
  const sliderMax = param.max ?? Math.max(value ?? sliderMin, sliderMin + 1);
  const sliderValue = Math.min(Math.max(value ?? sliderMin, sliderMin), sliderMax);

  const applyValue = useCallback((nextValue) => {
    let next = nextValue;
    if (param.min !== undefined) next = Math.max(next, param.min);
    if (param.max !== undefined) next = Math.min(next, param.max);
    onChange(next);
  }, [onChange, param.min, param.max]);

  const handleNumberInput = (e) => {
    const raw = e.target.value;
    const parsed = raw === '' ? '' : parseFloat(raw);
    if (raw === '') {
      applyValue(param.min ?? 0);
      return;
    }
    if (!Number.isNaN(parsed)) {
      applyValue(parsed);
    }
  };

  const handleIncrement = () => {
    const step = param.step || 1;
    applyValue((value ?? sliderMin) + step);
  };

  const handleDecrement = () => {
    const step = param.step || 1;
    applyValue((value ?? sliderMin) - step);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          {param.icon && <i className={`${param.icon} text-xs text-gray-400`}></i>}
          {param.label}
        </span>
        {param.showInput ? (
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-200">
            <div className="group flex items-center gap-0.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700/50 dark:hover:bg-gray-600/50 rounded pl-1.5 pr-0.5 py-0.5 transition-colors cursor-text">
              <input
                type="number"
                value={value}
                onChange={handleNumberInput}
                min={param.min}
                className="w-14 bg-transparent text-right text-gray-700 dark:text-gray-200 outline-none text-xs appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              {param.unit && <span className="text-[10px] text-gray-400">{param.unit}</span>}
              <IncrementDecrementButtons onIncrement={handleIncrement} onDecrement={handleDecrement} />
            </div>
          </div>
        ) : (
          <span className="text-gray-700 dark:text-gray-200">{display}</span>
        )}
      </div>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={param.step || 1}
        value={sliderValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="accent-blue-500"
      />
    </div>
  );
}

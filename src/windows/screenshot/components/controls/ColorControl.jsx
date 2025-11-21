import { useCallback, useEffect, useState } from 'react';
import {
  COLOR_PRESETS,
  COLOR_HISTORY_EVENT,
  normalizeHex,
  readColorHistory,
  clearColorHistory,
} from '../../utils/colorHistory';

export default function ColorControl({ param, value, onChange }) {
  const [history, setHistory] = useState(() => readColorHistory());

  useEffect(() => {
    const handleHistoryUpdate = (event) => {
      if (Array.isArray(event.detail)) {
        setHistory(event.detail);
      } else {
        setHistory(readColorHistory());
      }
    };

    window.addEventListener(COLOR_HISTORY_EVENT, handleHistoryUpdate);
    return () => {
      window.removeEventListener(COLOR_HISTORY_EVENT, handleHistoryUpdate);
    };
  }, []);

  const handleColorChange = useCallback((hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    onChange(normalized);
  }, [onChange]);

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
          {param.icon && <i className={`${param.icon} text-xs text-gray-400`}></i>}
          {param.label}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => handleColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-gray-200 dark:border-gray-700 bg-transparent p-0 cursor-pointer"
          />
          <span className="text-xs font-mono text-gray-600 dark:text-gray-300 min-w-[70px] text-right">
            {(value || '').toUpperCase()}
          </span>
        </div>
      </label>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-400">
          <span>预设</span>
          <span className="text-gray-300 dark:text-gray-600">点击应用</span>
        </div>
        <div className="grid grid-cols-8 gap-1">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="h-5 rounded-full border border-white/70 shadow-sm hover:scale-105 transition-transform"
              style={{ background: preset }}
              onClick={() => handleColorChange(preset)}
              aria-label={`选择颜色 ${preset}`}
            />
          ))}
        </div>
      </div>
      {history.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-400">
            <span>历史</span>
            <button
              type="button"
              className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              onClick={() => {
                clearColorHistory();
                setHistory([]);
              }}
            >
              清空
            </button>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {history.map((item) => (
              <button
                key={item}
                type="button"
                className="h-5 rounded-full border border-white/70 shadow-sm hover:scale-105 transition-transform"
                style={{ background: item }}
                onClick={() => handleColorChange(item)}
                aria-label={`应用历史颜色 ${item}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

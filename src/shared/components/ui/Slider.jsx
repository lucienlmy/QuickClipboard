import { useState, useEffect } from 'react';
function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  className = ''
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);
  
  const handleInput = e => {
    const newValue = parseFloat(e.target.value);
    setDisplayValue(newValue);
  };
  
  const handleMouseDown = () => {
    setIsDragging(true);
  };
  
  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      onChange(displayValue);
    }
  };
  
  const handleTouchEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      onChange(displayValue);
    }
  };
  
  return <div className={`flex items-center gap-3 ${className}`}>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={displayValue} 
        onInput={handleInput}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleTouchEnd}
        className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
      />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-20 text-right">
        {displayValue} {unit}
      </span>
    </div>;
}
export default Slider;
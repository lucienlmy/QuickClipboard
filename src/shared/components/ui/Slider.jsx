import { useState } from 'react'

function Slider({ value, onChange, min = 0, max = 100, step = 1, unit = '', className = '' }) {
  const [displayValue, setDisplayValue] = useState(value)

  const handleChange = (e) => {
    const newValue = parseFloat(e.target.value)
    setDisplayValue(newValue)
    onChange(newValue)
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={handleChange}
        className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-20 text-right">
        {displayValue} {unit}
      </span>
    </div>
  )
}

export default Slider


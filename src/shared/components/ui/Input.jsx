function Input({ 
  type = 'text', 
  value, 
  onChange, 
  placeholder = '', 
  suffix,
  className = '',
  ...props 
}) {
  if (suffix) {
    return (
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
          {...props}
        />
        <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {suffix}
        </span>
      </div>
    )
  }

  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...props}
    />
  )
}

export default Input


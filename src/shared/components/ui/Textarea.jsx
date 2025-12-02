function Textarea({
  value,
  onChange,
  rows = 3,
  placeholder,
  className = '',
  ...props
}) {
  const baseClassName = 'px-3 py-2 w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none';
  return <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder} className={`${baseClassName} ${className}`} {...props} />;
}
export default Textarea;
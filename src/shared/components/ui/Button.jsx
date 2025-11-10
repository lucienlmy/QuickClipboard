import '@tabler/icons-webfont/dist/tabler-icons.min.css';
function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  icon,
  className = '',
  ...props
}) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  const baseClasses = `${sizeClasses[size]} rounded-lg font-medium transition-all duration-200 flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed`;
  const variantClasses = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white',
    danger: 'bg-red-500 hover:bg-red-600 text-white'
  };
  const isDisabled = disabled || loading;
  return <button onClick={onClick} disabled={isDisabled} className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {loading ? <i className="ti ti-loader2 w-4 h-4 animate-spin"></i> : icon ? <span>{icon}</span> : null}
      {children}
    </button>;
}
export default Button;
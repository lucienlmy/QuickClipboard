// 设置项容器组件
function SettingItem({
  label,
  description,
  children
}) {
  const anchor = typeof label === 'string' ? encodeURIComponent(label) : '';
  return <div className="flex items-center justify-between py-3.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0" data-setting-anchor={anchor}>
      <div className="flex-1 pr-6">
        <label className="block text-sm font-medium text-gray-800 dark:text-white">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {description}
          </p>}
      </div>
      <div className="flex-shrink-0">
        {children}
      </div>
    </div>;
}
export default SettingItem;
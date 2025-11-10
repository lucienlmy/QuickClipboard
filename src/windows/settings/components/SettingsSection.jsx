// 设置区块组件
function SettingsSection({
  title,
  description,
  children,
  className = ''
}) {
  return <div className={`settings-section mb-6 ${className}`}>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
        {description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {description}
          </p>}
      </div>
      <div className="settings-section-content bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
        {children}
      </div>
    </div>;
}
export default SettingsSection;
// 设置区块组件
function SettingsSection({
  title,
  description,
  children,
  className = ''
}) {
  return <div className={`settings-section mb-6 ${className}`}>
      <div className="settings-section-header mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-qc-fg">
          {title}
        </h2>
        {description && (
          <span className="text-xs leading-4 text-qc-fg-muted">
            {description}
          </span>
        )}
      </div>
      <div className="settings-section-content bg-qc-panel rounded-lg p-5 border border-qc-border">
        {children}
      </div>
    </div>;
}
export default SettingsSection;
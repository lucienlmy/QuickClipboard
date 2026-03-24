// 设置区块组件
function SettingsSection({
  title,
  description,
  children,
  className = ''
}) {
  const headerStyle = {
    display: 'inline-flex',
    padding: '12px',
    backgroundColor: 'var(--qc-panel)',
    border: '1px solid var(--qc-border)',
    borderBottom: 'none',
    borderRadius: '12px 12px 0 0',
    marginBottom: '-1px',
  };

  const contentStyle = {
    padding: '20px',
    backgroundColor: 'var(--qc-panel)',
    border: '1px solid var(--qc-border)',
    borderRadius: '0 12px 12px 12px',
  };

  return <div className={`settings-section mb-6 ${className}`}>
    <div className="settings-section-header flex-wrap items-baseline gap-x-3 gap-y-1" style={headerStyle}>
      <h2 className="text-lg font-semibold text-qc-fg">
        {title}
      </h2>
      {description && (
        <span className="text-xs leading-4 text-qc-fg-muted">
          {description}
        </span>
      )}
    </div>
    <div className="settings-section-content" style={contentStyle}>
      {children}
    </div>
  </div>;
}

export default SettingsSection;

// 设置中的Tab 栏组件
function TabBar({ tabs, activeTab, onTabChange, className = '' }) {
  return (
    <div className={`settings-tab-bar flex gap-2 px-6 py-3 bg-qc-panel border-b border-qc-border transition-colors duration-500 ${className}`}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              isActive
                ? 'bg-blue-500 text-white shadow-md'
                : 'text-qc-fg-muted hover:bg-qc-hover hover:shadow-sm'
            }`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default TabBar;

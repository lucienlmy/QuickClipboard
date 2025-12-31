// 设置中的Tab 栏组件
function TabBar({ tabs, activeTab, onTabChange, className = '' }) {
  return (
    <div className={`settings-tab-bar flex gap-2 px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 transition-colors duration-500 ${className}`}>
      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              isActive
                ? 'bg-blue-500 text-white shadow-md'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:shadow-sm'
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

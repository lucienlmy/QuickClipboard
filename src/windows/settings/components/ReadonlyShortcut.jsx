// 只读快捷键展示组件，用于展示不可修改的操作快捷键
function ReadonlyShortcut({ keys, groups }) {
  const renderKeyGroup = (keyList, groupIndex) => {
    const list = Array.isArray(keyList) ? keyList : [keyList];
    return (
      <span key={groupIndex} className="flex items-center gap-1.5">
        {list.map((key, index) => (
          <span key={index} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-gray-400 dark:text-gray-500 text-xs">+</span>}
            <kbd className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-600 shadow-sm min-w-[28px] text-center">
              {key}
            </kbd>
          </span>
        ))}
      </span>
    );
  };

  if (groups && groups.length > 0) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {groups.map((group, index) => (
          <span key={index} className="flex items-center gap-2">
            {index > 0 && <span className="text-gray-400 dark:text-gray-500 text-xs">/</span>}
            {renderKeyGroup(group, index)}
          </span>
        ))}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1.5">
      {renderKeyGroup(keys, 0)}
    </div>
  );
}

export default ReadonlyShortcut;

import { useTranslation } from 'react-i18next';

function CategorySidebar({ categories, activeCategory, onCategoryClick, buttonsRef }) {
  const { t } = useTranslation();

  return (
    <div className="w-10 flex-shrink-0 bg-gray-100 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700/50 flex flex-col py-1 overflow-y-auto scrollbar-hide">
      {categories.map((cat, idx) => (
        <button
          key={cat.id}
          ref={buttonsRef ? (el => buttonsRef.current[cat.id] = el) : undefined}
          onClick={() => onCategoryClick(cat.id)}
          className={`w-8 h-8 mx-auto mb-0.5 flex items-center justify-center rounded-lg transition-colors ${
            (activeCategory === cat.id || (activeCategory === undefined && idx === 0))
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
              : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title={t(cat.labelKey)}
        >
          <i className={`ti ${cat.icon} text-base`}></i>
        </button>
      ))}
    </div>
  );
}

export default CategorySidebar;

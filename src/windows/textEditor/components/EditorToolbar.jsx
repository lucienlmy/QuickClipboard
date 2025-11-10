import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
function EditorToolbar({
  onReset,
  title,
  onTitleChange,
  wordWrap,
  onWordWrapChange,
  language,
  onLanguageChange,
  showTitle = true,
  groups = [],
  selectedGroup = '全部',
  onGroupChange,
  showGroupSelector = false
}) {
  const {
    t
  } = useTranslation();
  const languages = [{
    value: 'plaintext',
    label: t('textEditor.languages.plaintext')
  }, {
    value: 'javascript',
    label: 'JavaScript'
  }, {
    value: 'python',
    label: 'Python'
  }, {
    value: 'html',
    label: 'HTML'
  }, {
    value: 'css',
    label: 'CSS'
  }, {
    value: 'json',
    label: 'JSON'
  }, {
    value: 'xml',
    label: 'XML'
  }, {
    value: 'markdown',
    label: 'Markdown'
  }];
  const buttonClasses = `
    flex items-center gap-1 px-3 h-8
    rounded
    text-sm font-medium
    bg-white dark:bg-gray-700
    hover:bg-gray-100 dark:hover:bg-gray-600
    text-gray-700 dark:text-gray-200
    border border-gray-300 dark:border-gray-600
    transition-colors
    cursor-pointer
  `.trim().replace(/\s+/g, ' ');
  const activeButtonClasses = `
    flex items-center gap-1 px-3 h-8
    rounded
    text-sm font-medium
    bg-blue-500 dark:bg-blue-600
    hover:bg-blue-600 dark:hover:bg-blue-700
    text-white
    border border-blue-500 dark:border-blue-600
    transition-colors
    cursor-pointer
  `.trim().replace(/\s+/g, ' ');
  return <div className="min-h-12 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {showTitle && <>
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {t('textEditor.titleLabel')}:
              </label>
              <input type="text" value={title} onChange={e => onTitleChange(e.target.value)} placeholder={t('textEditor.titlePlaceholder')} className="min-w-32 max-w-48 h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {showGroupSelector && <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {t('textEditor.group')}:
                </label>
                <select value={selectedGroup} onChange={e => onGroupChange(e.target.value)} className="h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {groups.map(group => <option key={group.name} value={group.name}>
                      {group.name}
                    </option>)}
                </select>
              </div>}
          </>}

        {!showTitle && <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
            {title}
          </div>}

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
            {t('textEditor.language')}:
          </label>
          <select value={language} onChange={e => onLanguageChange(e.target.value)} className="h-8 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {languages.map(lang => <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* 换行切换 */}
        <button className={wordWrap ? activeButtonClasses : buttonClasses} onClick={onWordWrapChange} title={t('textEditor.wordWrap')}>
          <i className="ti ti-text-wrap" style={{
          fontSize: 16
        }}></i>
        </button>

        {/* 重置按钮 */}
        <button className={buttonClasses} onClick={onReset} title={t('textEditor.reset')}>
          <i className="ti ti-refresh" style={{
          fontSize: 16
        }}></i>
        </button>
      </div>
    </div>;
}
export default EditorToolbar;
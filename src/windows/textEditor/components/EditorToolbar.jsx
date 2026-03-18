import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
function EditorToolbar({
  onReset,
  title,
  onTitleChange,
  wordWrap,
  onWordWrapChange,
  showTitle = true,
  groups = [],
  selectedGroup = '全部',
  onGroupChange,
  showGroupSelector = false
}) {
  const {
    t
  } = useTranslation();
  const buttonClasses = `
    flex items-center gap-1 px-3 h-8
    rounded
    text-sm font-medium
    bg-qc-surface
    hover:bg-qc-hover
    text-qc-fg
    border border-qc-border
    transition-colors
    cursor-pointer
  `.trim().replace(/\s+/g, ' ');
  const activeButtonClasses = `
    flex items-center gap-1 px-3 h-8
    rounded
    text-sm font-medium
    bg-blue-500
    hover:bg-blue-600
    text-white
    border border-blue-500
    transition-colors
    cursor-pointer
  `.trim().replace(/\s+/g, ' ');
  return <div className="min-h-12 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-qc-border bg-qc-surface/80 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {showTitle && <>
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-sm text-qc-fg-muted whitespace-nowrap">
                {t('textEditor.titleLabel')}:
              </label>
              <input type="text" value={title} onChange={e => onTitleChange(e.target.value)} placeholder={t('textEditor.titlePlaceholder')} className="min-w-32 max-w-48 h-8 px-2 text-sm rounded border border-qc-border bg-qc-surface text-qc-fg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {showGroupSelector && <div className="flex items-center gap-2">
                <label className="text-sm text-qc-fg-muted whitespace-nowrap">
                  {t('textEditor.group')}:
                </label>
                <select value={selectedGroup} onChange={e => onGroupChange(e.target.value)} className="h-8 px-2 text-sm rounded border border-qc-border bg-qc-surface text-qc-fg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {groups.map(group => <option key={group.name} value={group.name}>
                      {group.name}
                    </option>)}
                </select>
              </div>}
          </>}

        {!showTitle && <div className="text-sm font-medium text-qc-fg truncate">
            {title}
          </div>}

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
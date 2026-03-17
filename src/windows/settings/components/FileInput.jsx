import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
function FileInput({
  value,
  onChange,
  onTest,
  onReset,
  placeholder
}) {
  const {
    t
  } = useTranslation();
  const handleBrowse = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{
          name: 'Audio',
          extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']
        }]
      });
      if (file) {
        onChange(file);
      }
    } catch (error) {
      console.error('选择文件失败:', error);
    }
  };
  return <div className="flex items-center gap-2">
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1 px-3 py-2 text-sm border border-qc-border rounded-lg bg-qc-panel text-qc-fg placeholder:text-qc-fg-subtle focus:outline-none focus:ring-2 focus:ring-blue-500" />
      
      <button onClick={handleBrowse} className="p-2 rounded-lg hover:bg-qc-hover text-qc-fg-muted transition-colors" title={t('settings.common.browse')}>
        <i className="ti ti-folder w-4 h-4"></i>
      </button>

      {onTest && <button onClick={onTest} className="p-2 rounded-lg hover:bg-qc-hover text-qc-fg-muted transition-colors" title={t('settings.common.test')}>
          <i className="ti ti-player-play w-4 h-4"></i>
        </button>}

      {onReset && <button onClick={onReset} className="p-2 rounded-lg hover:bg-qc-hover text-qc-fg-muted transition-colors" title={t('settings.common.reset')}>
          <i className="ti ti-refresh w-4 h-4"></i>
        </button>}
    </div>;
}
export default FileInput;
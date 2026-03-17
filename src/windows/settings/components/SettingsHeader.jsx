import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import SettingsSearch from './SettingsSearch';

function SettingsHeader({ onNavigate }) {
  const {
    t
  } = useTranslation();
  const currentWindow = getCurrentWindow();
  const handleMinimize = async () => {
    await currentWindow.minimize();
  };
  const handleMaximize = async () => {
    await currentWindow.toggleMaximize();
  };
  const handleClose = async () => {
    await currentWindow.close();
  };
  return <header data-tauri-drag-region className="settings-header flex-shrink-0 h-14 bg-qc-panel border-b border-qc-border flex items-center justify-between px-5">
      <div className="flex items-center gap-3">
        <i className="ti ti-settings text-qc-fg-muted" style={{
        fontSize: 20
      }}></i>
        <h1 className="text-base font-semibold text-qc-fg">
          {t('settings.title')}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <SettingsSearch onNavigate={onNavigate} className="w-80" />

        <div className="flex items-center gap-0.5">
          <button onClick={handleMinimize} className="p-1.5 hover:bg-qc-hover rounded transition-colors" title="最小化">
            <i className="ti ti-minus text-qc-fg-muted" style={{
            fontSize: 16
          }}></i>
          </button>

          <button onClick={handleMaximize} className="p-1.5 hover:bg-qc-hover rounded transition-colors" title="最大化">
            <i className="ti ti-square text-qc-fg-muted" style={{
            fontSize: 16
          }}></i>
          </button>

          <button onClick={handleClose} className="p-1.5 hover:bg-red-50 rounded transition-colors" title="关闭">
            <i className="ti ti-x text-qc-fg-muted hover:text-red-600" style={{
            fontSize: 16
          }}></i>
          </button>
        </div>
      </div>
    </header>;
}
export default SettingsHeader;
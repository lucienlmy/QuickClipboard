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
  return <header data-tauri-drag-region className="settings-header flex-shrink-0 h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-5">
      <div className="flex items-center gap-3">
        <i className="ti ti-settings text-gray-600 dark:text-gray-400" style={{
        fontSize: 20
      }}></i>
        <h1 className="text-base font-semibold text-gray-900 dark:text-white">
          {t('settings.title')}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <SettingsSearch onNavigate={onNavigate} className="w-80" />

        <div className="flex items-center gap-0.5">
          <button onClick={handleMinimize} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors" title="最小化">
            <i className="ti ti-minus text-gray-600 dark:text-gray-400" style={{
            fontSize: 16
          }}></i>
          </button>

          <button onClick={handleMaximize} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors" title="最大化">
            <i className="ti ti-square text-gray-600 dark:text-gray-400" style={{
            fontSize: 16
          }}></i>
          </button>

          <button onClick={handleClose} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="关闭">
            <i className="ti ti-x text-gray-600 dark:text-gray-400 hover:text-red-600" style={{
            fontSize: 16
          }}></i>
          </button>
        </div>
      </div>
    </header>;
}
export default SettingsHeader;
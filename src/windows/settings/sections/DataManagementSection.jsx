import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Button from '@shared/components/ui/Button';
function DataManagementSection() {
  const {
    t
  } = useTranslation();
  const [storagePath, setStoragePath] = useState('正在获取...');
  const [importMode, setImportMode] = useState('replace');
  const handleExportData = async () => {
    console.log('导出数据');
  };
  const handleImportData = async () => {
    console.log('导入数据');
  };
  const handleOpenStorageFolder = async () => {
    console.log('打开存储文件夹');
  };
  const handleChangeStorageLocation = async () => {
    console.log('更改存储位置');
  };
  const handleResetStorageLocation = async () => {
    console.log('重置存储位置');
  };
  const handleClearHistory = async () => {
    if (window.confirm(t('settings.dataManagement.clearConfirm'))) {
      console.log('清空历史');
    }
  };
  const handleResetSettings = async () => {
    if (window.confirm(t('settings.dataManagement.resetConfirm'))) {
      console.log('重置设置');
    }
  };
  const handleResetAllData = async () => {
    if (window.confirm(t('settings.dataManagement.resetAllConfirm'))) {
      console.log('重置所有数据');
    }
  };
  return <>
      {/* 数据导出 */}
      <SettingsSection title={t('settings.dataManagement.exportTitle')} description={t('settings.dataManagement.exportDesc')}>
        <SettingItem label={t('settings.dataManagement.exportAllData')} description={t('settings.dataManagement.exportAllDataDesc')}>
          <Button onClick={handleExportData} variant="primary" icon={<i className="ti ti-download"></i>}>
            {t('settings.dataManagement.exportButton')}
          </Button>
        </SettingItem>
      </SettingsSection>

      {/* 数据导入 */}
      <SettingsSection title={t('settings.dataManagement.importTitle')} description={t('settings.dataManagement.importDesc')}>
        <SettingItem label={t('settings.dataManagement.importData')} description={t('settings.dataManagement.importDataDesc')}>
          <Button onClick={handleImportData} variant="secondary" icon={<i className="ti ti-upload"></i>}>
            {t('settings.dataManagement.selectFile')}
          </Button>
        </SettingItem>

        <SettingItem label={t('settings.dataManagement.importMode')} description={t('settings.dataManagement.importModeDesc')}>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input type="radio" name="import-mode" value="replace" checked={importMode === 'replace'} onChange={e => setImportMode(e.target.value)} className="mt-1" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  {t('settings.dataManagement.modeReplace')}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.dataManagement.modeReplaceDesc')}
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input type="radio" name="import-mode" value="merge" checked={importMode === 'merge'} onChange={e => setImportMode(e.target.value)} className="mt-1" />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  {t('settings.dataManagement.modeMerge')}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('settings.dataManagement.modeMergeDesc')}
                </div>
              </div>
            </label>
          </div>
        </SettingItem>
      </SettingsSection>

      {/* 数据存储位置 */}
      <SettingsSection title={t('settings.dataManagement.storageTitle')} description={t('settings.dataManagement.storageDesc')}>
        <SettingItem label={t('settings.dataManagement.currentPath')} description={storagePath}>
          <Button onClick={handleOpenStorageFolder} variant="secondary" icon={<i className="ti ti-folder-open"></i>}>
            {t('settings.dataManagement.openFolder')}
          </Button>
        </SettingItem>

        <SettingItem label={t('settings.dataManagement.changePath')} description={t('settings.dataManagement.changePathDesc')}>
          <Button onClick={handleChangeStorageLocation} variant="primary" icon={<i className="ti ti-folder-plus"></i>}>
            {t('settings.dataManagement.selectNewPath')}
          </Button>
        </SettingItem>

        <SettingItem label={t('settings.dataManagement.resetPath')} description={t('settings.dataManagement.resetPathDesc')}>
          <Button onClick={handleResetStorageLocation} variant="secondary" icon={<i className="ti ti-home"></i>}>
            {t('settings.dataManagement.resetPathButton')}
          </Button>
        </SettingItem>
      </SettingsSection>

      {/* 数据清理 */}
      <SettingsSection title={t('settings.dataManagement.cleanupTitle')} description={t('settings.dataManagement.cleanupDesc')}>
        <SettingItem label={t('settings.dataManagement.clearHistory')} description={t('settings.dataManagement.clearHistoryDesc')}>
          <Button onClick={handleClearHistory} variant="danger" icon={<i className="ti ti-trash"></i>}>
            {t('settings.dataManagement.clearButton')}
          </Button>
        </SettingItem>

        <SettingItem label={t('settings.dataManagement.resetSettings')} description={t('settings.dataManagement.resetSettingsDesc')}>
          <Button onClick={handleResetSettings} variant="danger" icon={<i className="ti ti-restore"></i>}>
            {t('settings.dataManagement.resetButton')}
          </Button>
        </SettingItem>

        <SettingItem label={t('settings.dataManagement.resetAll')} description={t('settings.dataManagement.resetAllDesc')}>
          <Button onClick={handleResetAllData} variant="danger" icon={<i className="ti ti-refresh"></i>}>
            {t('settings.dataManagement.resetAllButton')}
          </Button>
        </SettingItem>
      </SettingsSection>
    </>;
}
export default DataManagementSection;
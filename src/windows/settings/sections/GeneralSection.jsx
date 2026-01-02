import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Toggle from '@shared/components/ui/Toggle';
import Select from '@shared/components/ui/Select';
import { setAutoStart, getAutoStartStatus, setRunAsAdmin, getRunAsAdminStatus, restartAsAdmin, isRunningAsAdmin } from '@shared/api/settings';
import { toast } from '@shared/store/toastStore';
import { showConfirm } from '@shared/utils/dialog';
import { getAvailableLanguages } from '@shared/i18n';
import i18n from '@shared/i18n';
function GeneralSection({
  settings,
  onSettingChange
}) {
  const {
    t
  } = useTranslation();
  const [autoStartLoading, setAutoStartLoading] = useState(false);
  const [autoStartSynced, setAutoStartSynced] = useState(false);
  const [autoStartMismatch, setAutoStartMismatch] = useState(false);
  const [runAsAdminLoading, setRunAsAdminLoading] = useState(false);
  const [currentlyRunningAsAdmin, setCurrentlyRunningAsAdmin] = useState(false);

  // 初同步自启动状态和管理员权限状态
  useEffect(() => {
    const syncStatuses = async () => {
      try {
        const systemStatus = await getAutoStartStatus();
        if (systemStatus !== settings.autoStart) {
          setAutoStartMismatch(true);
          console.warn('开机自启动状态不一致 - 系统:', systemStatus, '配置:', settings.autoStart);
          await onSettingChange('autoStart', systemStatus);
        }
        setAutoStartSynced(true);
      } catch (error) {
        console.error('获取开机自启动状态失败:', error);
        setAutoStartSynced(true);
      }

      try {
        const adminStatus = await getRunAsAdminStatus();
        if (adminStatus !== settings.runAsAdmin) {
          console.warn('管理员权限状态不一致 - 系统:', adminStatus, '配置:', settings.runAsAdmin);
          await onSettingChange('runAsAdmin', adminStatus);
        }
      } catch (error) {
        console.error('获取管理员权限状态失败:', error);
      }

      try {
        const isAdmin = await isRunningAsAdmin();
        setCurrentlyRunningAsAdmin(isAdmin);
      } catch (error) {
        console.error('检查管理员权限状态失败:', error);
      }
    };
    syncStatuses();
  }, []);
  const historyLimitOptions = [{
    value: 50,
    label: `50 ${t('settings.general.items')}`
  }, {
    value: 100,
    label: `100 ${t('settings.general.items')}`
  }, {
    value: 200,
    label: `200 ${t('settings.general.items')}`
  }, {
    value: 500,
    label: `500 ${t('settings.general.items')}`
  }, {
    value: 9999,
    label: `9999 ${t('settings.general.items')}`
  }, {
    value: 999999,
    label: t('settings.general.unlimited')
  }];
  const languageOptions = getAvailableLanguages();
  const handleAutoStartChange = async checked => {
    setAutoStartLoading(true);
    try {
      await setAutoStart(checked);
      await onSettingChange('autoStart', checked);
      toast.success(checked ? t('settings.general.autoStartEnabled') : t('settings.general.autoStartDisabled'));
    } catch (error) {
      console.error('设置开机自启动失败:', error);
      const errorMsg = typeof error === 'string' ? error : (error?.message || t('settings.general.autoStartFailed'));
      toast.error(errorMsg);
    } finally {
      setAutoStartLoading(false);
    }
  };

  const handleRunAsAdminChange = async checked => {
    setRunAsAdminLoading(true);
    try {
      await setRunAsAdmin(checked);
      await onSettingChange('runAsAdmin', checked);
      toast.success(checked ? t('settings.general.runAsAdminEnabled') : t('settings.general.runAsAdminDisabled'));
      
      if (checked) {
        const isAdmin = await isRunningAsAdmin();
        if (!isAdmin) {
          const shouldRestart = await showConfirm(t('settings.general.runAsAdminRestartConfirm'));
          if (shouldRestart) {
            try {
              await restartAsAdmin();
            } catch (e) {
              toast.error(t('settings.general.runAsAdminRestartFailed'));
            }
          }
        }
      }
    } catch (error) {
      console.error('设置管理员权限失败:', error);
      const errorMsg = typeof error === 'string' ? error : (error?.message || t('settings.general.runAsAdminFailed'));
      toast.error(errorMsg);
    } finally {
      setRunAsAdminLoading(false);
    }
  };
  const handleLanguageChange = async lang => {
    try {
      await i18n.changeLanguage(lang);
      await onSettingChange('language', lang);
      toast.success(t('settings.general.languageChanged'));
    } catch (error) {
      console.error('切换语言失败:', error);
      toast.error(t('settings.general.languageChangeFailed'));
    }
  };
  return <SettingsSection title={t('settings.general.title')} description={t('settings.general.description')}>
      <SettingItem label={t('settings.general.language')} description={t('settings.general.languageDesc')}>
        <Select value={settings.language} onChange={handleLanguageChange} options={languageOptions} />
      </SettingItem>

      <SettingItem label={t('settings.general.autoStart')} description={t('settings.general.autoStartDesc')}>
        <Toggle checked={settings.autoStart} onChange={handleAutoStartChange} disabled={autoStartLoading} />
      </SettingItem>

      <SettingItem 
        label={
          <span className="flex items-center gap-2">
            {t('settings.general.runAsAdmin')}
            {currentlyRunningAsAdmin && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-green-500/20 text-green-500 leading-none flex items-center">
                {t('settings.general.runningAsAdmin')}
              </span>
            )}
          </span>
        } 
        description={t('settings.general.runAsAdminDesc')}
      >
        <Toggle checked={settings.runAsAdmin} onChange={handleRunAsAdminChange} disabled={runAsAdminLoading} />
      </SettingItem>

      <SettingItem label={t('settings.general.startupNotification')} description={t('settings.general.startupNotificationDesc')}>
        <Toggle checked={settings.showStartupNotification} onChange={checked => onSettingChange('showStartupNotification', checked)} />
      </SettingItem>

      <SettingItem label={t('settings.general.historyLimit')} description={t('settings.general.historyLimitDesc')}>
        <Select value={settings.historyLimit} onChange={value => onSettingChange('historyLimit', parseInt(value))} options={historyLimitOptions} />
      </SettingItem>
    </SettingsSection>;
}
export default GeneralSection;
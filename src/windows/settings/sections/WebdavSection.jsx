import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Button from '@shared/components/ui/Button';
import Input from '@shared/components/ui/Input';
import Toggle from '@shared/components/ui/Toggle';
import { showConfirm, showError, showMessage } from '@shared/utils/dialog';
import {
  downloadAllWebdav,
  downloadWebdav,
  startWebdavScheduler,
  stopWebdavScheduler,
  testWebdavConnection,
  uploadWebdav
} from '@shared/api/webdavSync';

function WebdavSection({ settings, onSettingChange }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState('');

  const update = async (key, value) => {
    await onSettingChange(key, value);
    if (key === 'webdavEnabled') {
      if (value) {
        await startWebdavScheduler().catch(() => {});
      } else {
        await stopWebdavScheduler().catch(() => {});
      }
    }
  };

  const runAction = async (actionId, action, successKey) => {
    try {
      setBusy(actionId);
      const result = await action();
      if (result && typeof result === 'object' && ('pulled' in result || 'pushed' in result)) {
        await showMessage(t(successKey, {
          pushed: result.pushed || 0,
          pulled: result.pulled || 0
        }));
      } else {
        await showMessage(t(successKey));
      }
    } catch (e) {
      await showError(e?.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const handleDownloadAll = async () => {
    const ok = await showConfirm(t('settings.webdav.pullAllConfirm'));
    if (!ok) return;
    await runAction('downloadAllWebdav', downloadAllWebdav, 'settings.webdav.pullAllComplete');
  };

  return (
    <div className="space-y-6">
      <SettingsSection title={t('settings.webdav.title')} description={t('settings.webdav.description')}>
        <SettingItem label={t('settings.webdav.enabled')} description={t('settings.webdav.enabledDesc')}>
          <Toggle checked={Boolean(settings.webdavEnabled)} onChange={checked => update('webdavEnabled', checked)} />
        </SettingItem>

        <SettingItem label={t('settings.webdav.url')} description={t('settings.webdav.urlPlaceholder')}>
          <Input value={settings.webdavUrl || ''} commitOnBlur onCommit={v => update('webdavUrl', String(v))} placeholder={t('settings.webdav.urlPlaceholder')} className="w-80" />
        </SettingItem>

        <SettingItem label={t('settings.webdav.username')} description={t('settings.webdav.usernamePlaceholder')}>
          <Input value={settings.webdavUsername || ''} commitOnBlur onCommit={v => update('webdavUsername', String(v))} placeholder={t('settings.webdav.usernamePlaceholder')} className="w-80" />
        </SettingItem>

        <SettingItem label={t('settings.webdav.password')} description={t('settings.webdav.passwordPlaceholder')}>
          <Input type="password" value={settings.webdavPassword || ''} commitOnBlur onCommit={v => update('webdavPassword', String(v))} placeholder={t('settings.webdav.passwordPlaceholder')} className="w-80" />
        </SettingItem>

        <SettingItem label={t('settings.webdav.rootPath')} description={t('settings.webdav.rootPathPlaceholder')}>
          <Input value={settings.webdavRootPath || 'quickclipboard'} commitOnBlur onCommit={v => update('webdavRootPath', String(v))} placeholder={t('settings.webdav.rootPathPlaceholder')} className="w-80" />
        </SettingItem>

        <SettingItem label={t('settings.webdav.testConnection')} description={t('settings.webdav.testConnectionDesc')}>
          <Button onClick={() => runAction('testWebdavConnection', testWebdavConnection, 'settings.webdav.testSuccess')} disabled={Boolean(busy)} variant="secondary" icon={<i className="ti ti-plug-connected" />}>
            {busy === 'testWebdavConnection' ? t('settings.webdav.testing') : t('settings.webdav.testConnection')}
          </Button>
        </SettingItem>
      </SettingsSection>

      <SettingsSection title={t('settings.webdav.syncTitle')} description={t('settings.webdav.syncDesc')}>
        <SettingItem label={t('settings.webdav.syncCategories')} description={t('settings.webdav.syncCategoriesDesc')}>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm text-qc-fg">
              <Toggle checked={settings.webdavSyncClipboard !== false} onChange={checked => update('webdavSyncClipboard', checked)} />
              {t('settings.webdav.syncClipboard')}
            </label>
            <label className="flex items-center gap-3 text-sm text-qc-fg">
              <Toggle checked={settings.webdavSyncFavorites !== false} onChange={checked => update('webdavSyncFavorites', checked)} />
              {t('settings.webdav.syncFavorites')}
            </label>
          </div>
        </SettingItem>

        <SettingItem label={t('settings.webdav.upload')} description={t('settings.webdav.uploadDesc')}>
          <Button onClick={() => runAction('uploadWebdav', uploadWebdav, 'settings.webdav.pushComplete')} disabled={Boolean(busy)} variant="primary" icon={<i className="ti ti-upload" />}>
            {busy === 'uploadWebdav' ? t('settings.webdav.pushing') : t('settings.webdav.upload')}
          </Button>
        </SettingItem>

        <SettingItem label={t('settings.webdav.download')} description={t('settings.webdav.downloadDesc')}>
          <Button onClick={() => runAction('downloadWebdav', downloadWebdav, 'settings.webdav.pullComplete')} disabled={Boolean(busy)} variant="secondary" icon={<i className="ti ti-download" />}>
            {busy === 'downloadWebdav' ? t('settings.webdav.pulling') : t('settings.webdav.download')}
          </Button>
        </SettingItem>

        <SettingItem label={t('settings.webdav.downloadAll')} description={t('settings.webdav.downloadAllDesc')}>
          <Button onClick={handleDownloadAll} disabled={Boolean(busy)} variant="secondary" icon={<i className="ti ti-restore" />}>
            {busy === 'downloadAllWebdav' ? t('settings.webdav.pullingAll') : t('settings.webdav.downloadAll')}
          </Button>
        </SettingItem>
      </SettingsSection>

      <SettingsSection title={t('settings.webdav.autoSyncTitle')} description={t('settings.webdav.autoSyncDesc')}>
        <SettingItem label={t('settings.webdav.autoPush')} description={t('settings.webdav.autoPushDesc')}>
          <Toggle checked={Boolean(settings.webdavAutoPush)} onChange={checked => update('webdavAutoPush', checked)} />
        </SettingItem>

        <SettingItem label={t('settings.webdav.pushDelaySecs')} description={t('settings.webdav.pushDelaySecsDesc')}>
          <Input type="number" value={settings.webdavPushDelaySecs ?? 10} commitOnBlur onCommit={v => update('webdavPushDelaySecs', Math.max(1, parseInt(String(v), 10) || 10))} min={1} className="w-32" />
        </SettingItem>

        <SettingItem label={t('settings.webdav.autoPull')} description={t('settings.webdav.autoPullDesc')}>
          <Toggle checked={Boolean(settings.webdavAutoPull)} onChange={checked => update('webdavAutoPull', checked)} />
        </SettingItem>

        <SettingItem label={t('settings.webdav.pullIntervalSecs')} description={t('settings.webdav.pullIntervalSecsDesc')}>
          <Input type="number" value={settings.webdavPullIntervalSecs ?? 30} commitOnBlur onCommit={v => update('webdavPullIntervalSecs', Math.max(10, parseInt(String(v), 10) || 30))} min={10} className="w-32" />
        </SettingItem>
      </SettingsSection>
    </div>
  );
}

export default WebdavSection;

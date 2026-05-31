import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Button from '@shared/components/ui/Button';
import Input from '@shared/components/ui/Input';
import Toggle from '@shared/components/ui/Toggle';
import { showConfirm } from '@shared/utils/dialog';
import { toast } from '@shared/store/toastStore';
import {
  downloadAllWebdav,
  downloadWebdav,
  getWebdavLastReport,
  startWebdavScheduler,
  stopWebdavScheduler,
  testWebdavConnection,
  uploadWebdav
} from '@shared/api/webdavSync';

function SubGroupTitle({ icon, title, description }) {
  return (
    <div className="mb-2 mt-1 flex items-baseline gap-2">
      <i className={`${icon} text-qc-fg-muted`} />
      <h3 className="text-sm font-semibold text-qc-fg">{title}</h3>
      {description && (
        <span className="text-xs text-qc-fg-muted">{description}</span>
      )}
    </div>
  );
}

function WebdavSection({ settings, onSettingChange }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState('');
  const [lastReport, setLastReport] = useState(null);

  useEffect(() => {
    let mounted = true;
    getWebdavLastReport()
      .then(report => {
        if (!mounted || !report?.result || !report?.mode) return;
        setLastReport({ actionId: `${report.automatic ? 'auto' : 'manual'}-${report.mode}`, mode: report.mode, result: report.result, time: Date.now(), automatic: Boolean(report.automatic) });
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = listen('webdav-sync-report', event => {
      const payload = event.payload || {};
      if (!payload.result || !payload.mode) return;
      setLastReport({ actionId: `auto-${payload.mode}`, mode: payload.mode, result: payload.result, time: Date.now(), automatic: true });
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };
  }, []);

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

  const formatReport = (result, mode) => {
    const total = mode === 'push' ? result?.pushed || 0 : result?.pulled || 0;
    const clipboard = mode === 'push' ? result?.pushed_clipboard || 0 : result?.pulled_clipboard || 0;
    const favorites = mode === 'push' ? result?.pushed_favorites || 0 : result?.pulled_favorites || 0;
    const groups = mode === 'push' ? result?.pushed_groups || 0 : result?.pulled_groups || 0;

    return t('settings.webdav.syncResultDetail', { total, clipboard, favorites, groups });
  };

  const runAction = async (actionId, action, successKey, mode) => {
    try {
      setBusy(actionId);
      const result = await action();
      if (result && typeof result === 'object' && ('pulled' in result || 'pushed' in result)) {
        setLastReport({ actionId, mode, result, time: Date.now() });
        toast.success(`${t(successKey)}：${formatReport(result, mode)}`, { duration: 5000 });
        if (Array.isArray(result.errors) && result.errors.length > 0) {
          toast.warning(result.errors.join('；'), { duration: 6000 });
        }
      } else {
        setLastReport(null);
        toast.success(t(successKey));
      }
    } catch (e) {
      toast.error(e?.message || String(e), { duration: 6000 });
    } finally {
      setBusy('');
    }
  };

  const handleDownloadAll = async () => {
    const ok = await showConfirm(t('settings.webdav.pullAllConfirm'));
    if (!ok) return;
    await runAction('downloadAllWebdav', downloadAllWebdav, 'settings.webdav.pullAllComplete', 'pull');
  };

  const reportItems = lastReport?.result
    ? (lastReport.mode === 'push' ? lastReport.result.pushed_items : lastReport.result.pulled_items) || []
    : [];

  const renderReportDetail = () => {
    if (!lastReport) return null;

    const result = lastReport.result;
    const total = lastReport.mode === 'push' ? result.pushed || 0 : result.pulled || 0;

    return (
      <div className="mt-3 rounded-xl border border-qc-border bg-qc-surface/60 p-3 text-sm text-qc-fg">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="font-medium">
            {t('settings.webdav.lastSyncDetail')}
            {lastReport.automatic ? ` · ${t('settings.webdav.autoSyncSource')}` : ''}
          </span>
          <span className="text-xs text-qc-fg-muted">{formatReport(result, lastReport.mode)}</span>
        </div>
        {total === 0 ? (
          <div className="text-qc-fg-muted">{t('settings.webdav.noChanges')}</div>
        ) : (
          <div className="max-h-40 space-y-1 overflow-auto pr-1">
            {reportItems.slice(0, 30).map((item, index) => (
              <div key={`${item.category}-${item.id}-${index}`} className="flex items-center gap-2 text-xs text-qc-fg-muted">
                <span className="shrink-0 rounded-md bg-qc-hover px-1.5 py-0.5 text-qc-fg">{t(`settings.webdav.category.${item.category}`)}</span>
                <span className="min-w-0 flex-1 truncate">{item.summary || item.id}</span>
                <span className="shrink-0 truncate max-w-28">{item.source_device_id}</span>
              </div>
            ))}
            {reportItems.length > 30 && (
              <div className="text-xs text-qc-fg-muted">{t('settings.webdav.moreItems', { count: reportItems.length - 30 })}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <SettingsSection
      title={t('settings.webdav.title')}
      description={t('settings.webdav.description')}
    >
      {/* 子区 1：连接配置 */}
      <SettingItem label={t('settings.webdav.enabled')} description={t('settings.webdav.enabledDesc')}>
        <Toggle checked={Boolean(settings.webdavEnabled)} onChange={checked => update('webdavEnabled', checked)} />
      </SettingItem>

      <SettingItem label={t('settings.webdav.url')}>
        <Input value={settings.webdavUrl || ''} commitOnBlur onCommit={v => update('webdavUrl', String(v))} placeholder={t('settings.webdav.urlPlaceholder')} className="w-80" />
      </SettingItem>

      <SettingItem label={t('settings.webdav.username')}>
        <Input value={settings.webdavUsername || ''} commitOnBlur onCommit={v => update('webdavUsername', String(v))} placeholder={t('settings.webdav.usernamePlaceholder')} className="w-80" />
      </SettingItem>

      <SettingItem label={t('settings.webdav.password')}>
        <Input type="password" value={settings.webdavPassword || ''} commitOnBlur onCommit={v => update('webdavPassword', String(v))} placeholder={t('settings.webdav.passwordPlaceholder')} className="w-80" />
      </SettingItem>

      <SettingItem label={t('settings.webdav.rootPath')}>
        <Input value={settings.webdavRootPath || 'quickclipboard'} commitOnBlur onCommit={v => update('webdavRootPath', String(v))} placeholder={t('settings.webdav.rootPathPlaceholder')} className="w-80" />
      </SettingItem>

      {/* 子区 2：同步操作 */}
      <div className="pt-5">
        <SubGroupTitle
          icon="ti ti-cloud-up"
          title={t('settings.webdav.syncTitle')}
          description={t('settings.webdav.syncDesc')}
        />
      </div>
      <SettingItem label={t('settings.webdav.syncCategories')} description={t('settings.webdav.syncCategoriesDesc')}>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-qc-fg">
            <Toggle checked={settings.webdavSyncClipboard !== false} onChange={checked => update('webdavSyncClipboard', checked)} />
            {t('settings.webdav.syncClipboard')}
          </label>
          <label className="flex items-center gap-2 text-sm text-qc-fg">
            <Toggle checked={settings.webdavSyncFavorites !== false} onChange={checked => update('webdavSyncFavorites', checked)} />
            {t('settings.webdav.syncFavorites')}
          </label>
          <label className="flex items-center gap-2 text-sm text-qc-fg">
            <Toggle checked={Boolean(settings.webdavSyncImages)} onChange={checked => update('webdavSyncImages', checked)} />
            {t('settings.webdav.syncImages')}
          </label>
        </div>
      </SettingItem>

      <SettingItem stacked label={t('settings.webdav.manualActions')} description={t('settings.webdav.manualActionsDesc')}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => runAction('testWebdavConnection', testWebdavConnection, 'settings.webdav.testSuccess', 'push')} disabled={Boolean(busy)} variant="secondary" icon={<i className="ti ti-plug-connected" />}>
              {busy === 'testWebdavConnection' ? t('settings.webdav.testing') : t('settings.webdav.testConnection')}
            </Button>
            <Button onClick={() => runAction('uploadWebdav', uploadWebdav, 'settings.webdav.pushComplete', 'push')} disabled={Boolean(busy)} variant="primary" icon={<i className="ti ti-upload" />}>
              {busy === 'uploadWebdav' ? t('settings.webdav.pushing') : t('settings.webdav.upload')}
            </Button>
            <Button onClick={() => runAction('downloadWebdav', downloadWebdav, 'settings.webdav.pullComplete', 'pull')} disabled={Boolean(busy)} variant="secondary" icon={<i className="ti ti-download" />}>
              {busy === 'downloadWebdav' ? t('settings.webdav.pulling') : t('settings.webdav.download')}
            </Button>
            <Button onClick={handleDownloadAll} disabled={Boolean(busy)} variant="secondary" icon={<i className="ti ti-restore" />}>
              {busy === 'downloadAllWebdav' ? t('settings.webdav.pullingAll') : t('settings.webdav.downloadAll')}
            </Button>
          </div>
          {renderReportDetail()}
        </div>
      </SettingItem>

      {/* 子区 3：自动同步 */}
      <div className="pt-5">
        <SubGroupTitle
          icon="ti ti-clock-play"
          title={t('settings.webdav.autoSyncTitle')}
          description={t('settings.webdav.autoSyncDesc')}
        />
      </div>
      <SettingItem label={t('settings.webdav.autoPush')} description={t('settings.webdav.autoPushDesc')}>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={Boolean(settings.webdavAutoPush)} onChange={checked => update('webdavAutoPush', checked)} />
          <span className="text-sm text-qc-fg-muted">{t('settings.webdav.pushDelaySecs')}</span>
          <Input type="number" value={settings.webdavPushDelaySecs ?? 10} commitOnBlur onCommit={v => update('webdavPushDelaySecs', Math.max(1, parseInt(String(v), 10) || 10))} min={1} className="w-24" />
        </div>
      </SettingItem>

      <SettingItem label={t('settings.webdav.autoPull')} description={t('settings.webdav.autoPullDesc')}>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={Boolean(settings.webdavAutoPull)} onChange={checked => update('webdavAutoPull', checked)} />
          <span className="text-sm text-qc-fg-muted">{t('settings.webdav.pullIntervalSecs')}</span>
          <Input type="number" value={settings.webdavPullIntervalSecs ?? 30} commitOnBlur onCommit={v => update('webdavPullIntervalSecs', Math.max(10, parseInt(String(v), 10) || 30))} min={10} className="w-24" />
        </div>
      </SettingItem>
    </SettingsSection>
  );
}

export default WebdavSection;

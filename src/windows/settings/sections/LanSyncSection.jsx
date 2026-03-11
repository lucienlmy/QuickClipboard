import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { copyTextToClipboard } from '@shared/api/system';
import QRCode from 'qrcode';
import { createPortal } from 'react-dom';
import SettingsSection from '../components/SettingsSection';
import Toggle from '@shared/components/ui/Toggle';
import Select from '@shared/components/ui/Select';
import Input from '@shared/components/ui/Input';
import Button from '@shared/components/ui/Button';

function LanSyncSection({
  settings,
  onSettingChange
}) {
  const { t } = useTranslation();

  const [snapshot, setSnapshot] = useState(null);
  const [snapshotError, setSnapshotError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [recommendedPeerUrls, setRecommendedPeerUrls] = useState([]);
  const [copyTip, setCopyTip] = useState('');

  const [qrUrl, setQrUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');

  const [showAllLocalUrls, setShowAllLocalUrls] = useState(false);

  const localUrlLimit = 5;
  const localUrlsAll = Array.isArray(recommendedPeerUrls) ? recommendedPeerUrls : [];
  const localUrlsVisible = showAllLocalUrls ? localUrlsAll : localUrlsAll.slice(0, localUrlLimit);
  const hasMoreLocalUrls = localUrlsAll.length > localUrlLimit;

  useEffect(() => {
    let disposed = false;
    let timerId;

    const tick = async () => {
      try {
        const info = await invoke('lan_sync_get_info');
        if (disposed) return;
        setSnapshot(info?.snapshot ?? null);
        if (typeof info?.device_id === 'string') {
          setDeviceId(info.device_id);
        }
        setRecommendedPeerUrls(Array.isArray(info?.recommended_peer_urls) ? info.recommended_peer_urls : []);
        setSnapshotError('');
      } catch (e) {
        if (disposed) return;
        setSnapshotError(String(e));
      }
    };

    tick();
    timerId = setInterval(tick, 1000);
    return () => {
      disposed = true;
      clearInterval(timerId);
    };
  }, []);

  const onCopy = async (text) => {
    try {
      await copyTextToClipboard(text);
      setCopyTip(t('common.copied'));
      setTimeout(() => setCopyTip(''), 1200);
    } catch (_e) {
      setCopyTip(t('common.copyFailed'));
      setTimeout(() => setCopyTip(''), 1200);
    }
  };

  const openQr = async (url) => {
    setQrUrl(url);
    setQrDataUrl('');
    setQrError('');
    setQrLoading(true);

    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M'
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      setQrError(String(e));
    } finally {
      setQrLoading(false);
    }
  };

  const closeQr = () => {
    setQrUrl('');
    setQrDataUrl('');
    setQrError('');
    setQrLoading(false);
  };

  const stateLabel = useMemo(() => {
    const state = snapshot?.state;
    if (!state) return '';
    switch (state) {
      case 'Stopped':
        return t('settings.lanSync.stateStopped');
      case 'Listening':
        return t('settings.lanSync.stateListening');
      case 'Connecting':
        return t('settings.lanSync.stateConnecting');
      case 'Connected':
        return t('settings.lanSync.stateConnected');
      case 'Disconnected':
        return t('settings.lanSync.stateDisconnected');
      default:
        return String(state);
    }
  }, [snapshot?.state, t]);

  const modeOptions = [{
    value: 'off',
    label: t('settings.lanSync.modeOff')
  }, {
    value: 'server',
    label: t('settings.lanSync.modeServer')
  }, {
    value: 'client',
    label: t('settings.lanSync.modeClient')
  }];

  const isServer = settings.lanSyncMode === 'server';
  const isClient = settings.lanSyncMode === 'client';

  return <SettingsSection title={t('settings.lanSync.title')} description={t('settings.lanSync.description')}>
      <div className="py-3.5 border-b border-gray-100 dark:border-gray-700/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <label className="block text-sm font-medium text-gray-800 dark:text-white">{t('settings.lanSync.status')}</label>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t('settings.lanSync.statusDesc')}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge
              enabled={Boolean(snapshot?.enabled)}
              text={snapshot ? (snapshot.enabled ? t('settings.lanSync.statusYes') : t('settings.lanSync.statusNo')) : '-'}
            />
            <StatusBadge
              variant="neutral"
              text={snapshot ? stateLabel : '-'}
              title={t('settings.lanSync.statusState')}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
          <StatusCard label={t('settings.lanSync.statusDeviceId')} value={deviceId || '-'} />
          <StatusCard label={t('settings.lanSync.statusConnectedCount')} value={snapshot?.server_connected_count ?? 0} />
          <StatusCard label={t('settings.lanSync.statusPeerUrl')} value={snapshot?.peer_url ?? '-'} />

          <StatusCard label={t('settings.lanSync.enabled')}>
            <div className="mt-1">
              <Toggle checked={Boolean(settings.lanSyncEnabled)} onChange={checked => onSettingChange('lanSyncEnabled', checked)} />
            </div>
          </StatusCard>

          <StatusCard label={t('settings.lanSync.autoStart')}>
            <div className="mt-1">
              <Toggle checked={settings.lanSyncAutoStart !== false} onChange={checked => onSettingChange('lanSyncAutoStart', checked)} />
            </div>
          </StatusCard>

          <StatusCard label={t('settings.lanSync.mode')}>
            <div className="mt-1">
              <Select value={settings.lanSyncMode || 'off'} onChange={value => onSettingChange('lanSyncMode', value)} options={modeOptions} className="w-full" />
            </div>
          </StatusCard>

          {settings.lanSyncEnabled && isServer ? (
            <StatusCard label={t('settings.lanSync.serverPort')}>
              <div className="mt-1">
                <Input
                  type="number"
                  value={settings.lanSyncServerPort ?? 18181}
                  onChange={e => onSettingChange('lanSyncServerPort', parseInt(e.target.value) || 18181)}
                  min={1}
                  max={65535}
                  className="w-full"
                />
              </div>
            </StatusCard>
          ) : (
            <StatusCard label={t('settings.lanSync.statusServerPort')} value={snapshot?.server_port ?? '-'} />
          )}

          {settings.lanSyncEnabled && isClient ? (
            <>
              <StatusCard label={t('settings.lanSync.peerUrl')}>
                <div className="mt-1">
                  <Input
                    type="text"
                    value={settings.lanSyncPeerUrl || ''}
                    onChange={e => onSettingChange('lanSyncPeerUrl', e.target.value)}
                    className="w-full"
                    placeholder="ws://127.0.0.1:18181"
                  />
                </div>
              </StatusCard>
              <StatusCard label={t('settings.lanSync.autoReconnect')}>
                <div className="mt-1">
                  <Toggle checked={settings.lanSyncAutoReconnect !== false} onChange={checked => onSettingChange('lanSyncAutoReconnect', checked)} />
                </div>
              </StatusCard>
            </>
          ) : null}
        </div>

        {snapshot?.reconnecting ? (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            {t('settings.lanSync.statusReconnecting')} #{snapshot?.reconnect_attempt ?? 0}{snapshot?.next_retry_in_ms != null ? `, ${t('settings.lanSync.statusNextRetry')} ${Math.ceil(snapshot.next_retry_in_ms / 1000)}s` : ''}
          </div>
        ) : null}

        {snapshotError ? (
          <div className="mt-2 text-xs text-red-600 break-all">{t('settings.lanSync.statusFetchFailed')}: {snapshotError}</div>
        ) : null}
      </div>

      <div className="py-3.5 border-b border-gray-100 dark:border-gray-700/50">
        <label className="block text-sm font-medium text-gray-800 dark:text-white">{t('settings.lanSync.localUrls')}</label>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t('settings.lanSync.localUrlsDesc')}</p>
        <div className="mt-2 flex flex-col gap-2">
          {localUrlsAll?.length ? (
            <div className="flex flex-col gap-2 max-h-56 overflow-auto pr-1">
              {localUrlsVisible.map(url => (
                <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200/70 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/40">
                  <div className="text-sm text-gray-700 dark:text-gray-200 break-all flex-1">{url}</div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openQr(url)}
                    title={t('settings.lanSync.qrShow')}
                    aria-label={t('settings.lanSync.qrShow')}
                    className="min-w-16"
                    icon={<i className="ti ti-qrcode" />}
                  >
                    {t('settings.lanSync.qrShow')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onCopy(url)}
                    title={t('common.copy')}
                    aria-label={t('common.copy')}
                    className="min-w-16"
                    icon={<i className="ti ti-copy" />}
                  >
                    {t('common.copy')}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">{t('settings.lanSync.localUrlsEmpty')}</div>
          )}

          {hasMoreLocalUrls ? (
            <div className="flex items-center">
              <button
                type="button"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => setShowAllLocalUrls(v => !v)}
              >
                {showAllLocalUrls ? t('settings.lanSync.localUrlsCollapse') : t('settings.lanSync.localUrlsMore', { count: localUrlsAll.length - localUrlLimit })}
              </button>
            </div>
          ) : null}
          {copyTip ? (
            <div className="text-xs text-gray-500">{copyTip}</div>
          ) : null}
        </div>
      </div>

      {qrUrl ? createPortal(
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeQr();
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[340px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t('settings.lanSync.qrTitle')}</h3>
              <button
                onClick={closeQr}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <i className="ti ti-x" style={{ fontSize: 20 }} />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 break-all">{qrUrl}</div>

              <div className="flex items-center justify-center">
                {qrLoading ? (
                  <div className="text-sm text-gray-500">{t('common.loading')}</div>
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt={t('settings.lanSync.qrTitle')} className="w-[240px] h-[240px] bg-white rounded-md" />
                ) : (
                  <div className="text-sm text-gray-500">{t('settings.lanSync.qrFailed')}</div>
                )}
              </div>

              {qrError ? (
                <div className="text-xs text-red-600 break-all">{qrError}</div>
              ) : null}

              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onCopy(qrUrl)}
                  icon={<i className="ti ti-copy" />}
                >
                  {t('common.copy')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={closeQr}
                  icon={<i className="ti ti-x" />}
                >
                  {t('common.close')}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

    </SettingsSection>;
}

export default LanSyncSection;

function StatusBadge({ enabled, text, title, variant }) {
  const base = 'px-2 py-1 rounded-full text-xs font-medium border';
  const v = variant || (enabled ? 'success' : 'danger');
  const cls = v === 'success'
    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800/60'
    : v === 'danger'
      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800/60'
      : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/40 dark:text-gray-200 dark:border-gray-700/60';

  return (
    <div className={`${base} ${cls}`} title={title}>
      {text}
    </div>
  );
}

function StatusCard({ label, value, children }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200/70 dark:border-gray-700/60">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      {children != null ? (
        <div className="mt-1">{children}</div>
      ) : value !== undefined ? (
        <div className="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-100 break-all">{value}</div>
      ) : null}
    </div>
  );
}

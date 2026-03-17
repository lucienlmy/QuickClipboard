import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import Button from '@shared/components/ui/Button';
import Input from '@shared/components/ui/Input';
import { showConfirm } from '../../../shared/utils/dialog';
import { copyTextToClipboard } from '@shared/api/system';
import QRCode from 'qrcode';
import SettingsSection from '../components/SettingsSection';
import Toggle from '@shared/components/ui/Toggle';
import Select from '@shared/components/ui/Select';

function LanSyncSection({
  settings,
  onSettingChange
}) {
  const { t } = useTranslation();

  const isServer = settings.lanSyncMode === 'server';
  const isClient = settings.lanSyncMode === 'client';

  const [snapshot, setSnapshot] = useState(null);
  const [snapshotError, setSnapshotError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [recommendedPeerUrls, setRecommendedPeerUrls] = useState([]);
  const [copyTip, setCopyTip] = useState('');

  const [qrUrl, setQrUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const lastQrPayloadRef = useRef('');
  const qrInFlightRef = useRef(false);

  const autoRefreshPairCodeInFlightRef = useRef(false);
  const lastAutoRefreshPairCodeAtRef = useRef(0);

  const [showAllLocalUrls, setShowAllLocalUrls] = useState(false);

  const [serverPairCode, setServerPairCode] = useState(null);
  const [serverPairCodeRemainingMs, setServerPairCodeRemainingMs] = useState(null);

  const [trustedDevices, setTrustedDevices] = useState([]);

  const [clientPairCode, setClientPairCode] = useState('');
  const clientPairCodeConnectTimerRef = useRef(null);

  const [clientConnecting, setClientConnecting] = useState(false);
  const [clientDisconnecting, setClientDisconnecting] = useState(false);
  const clientConnectBusyTimerRef = useRef(null);
  const clientDisconnectBusyTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (clientPairCodeConnectTimerRef.current) {
        clearTimeout(clientPairCodeConnectTimerRef.current);
        clientPairCodeConnectTimerRef.current = null;
      }
      if (clientConnectBusyTimerRef.current) {
        clearTimeout(clientConnectBusyTimerRef.current);
        clientConnectBusyTimerRef.current = null;
      }
      if (clientDisconnectBusyTimerRef.current) {
        clearTimeout(clientDisconnectBusyTimerRef.current);
        clientDisconnectBusyTimerRef.current = null;
      }
    };
  }, []);

  const localUrlLimit = 5;
  const localUrlsAll = Array.isArray(recommendedPeerUrls) ? recommendedPeerUrls : [];
  const localUrlsVisible = showAllLocalUrls ? localUrlsAll : localUrlsAll.slice(0, localUrlLimit);
  const hasMoreLocalUrls = localUrlsAll.length > localUrlLimit;

  useEffect(() => {
    let disposed = false;
    let timerId;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const info = await invoke('lan_sync_get_info');
        if (disposed) return;
        setSnapshot(info?.snapshot ?? null);
        if (typeof info?.device_id === 'string') {
          setDeviceId(info.device_id);
        }
        setRecommendedPeerUrls(Array.isArray(info?.recommended_peer_urls) ? info.recommended_peer_urls : []);
        setSnapshotError('');

        if (settings.lanSyncEnabled && settings.lanSyncMode === 'server') {
          const pair = await invoke('lan_sync_get_server_pair_code');
          if (disposed) return;
          if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'number') {
            setServerPairCode(pair[0]);
            setServerPairCodeRemainingMs(pair[1]);
          } else {
            setServerPairCode(null);
            setServerPairCodeRemainingMs(null);

            const now = Date.now();
            if (!autoRefreshPairCodeInFlightRef.current && now - lastAutoRefreshPairCodeAtRef.current > 1500) {
              autoRefreshPairCodeInFlightRef.current = true;
              lastAutoRefreshPairCodeAtRef.current = now;
              try {
                const newPair = await invoke('lan_sync_refresh_server_pair_code');
                if (disposed) return;
                if (Array.isArray(newPair) && typeof newPair[0] === 'string' && typeof newPair[1] === 'number') {
                  setServerPairCode(newPair[0]);
                  setServerPairCodeRemainingMs(newPair[1]);
                }
              } catch (_e) {
              } finally {
                autoRefreshPairCodeInFlightRef.current = false;
              }
            }
          }

          const devices = await invoke('lan_sync_list_trusted_devices');
          if (disposed) return;
          setTrustedDevices(Array.isArray(devices) ? devices : []);
        } else {
          setServerPairCode(null);
          setServerPairCodeRemainingMs(null);
          setTrustedDevices([]);
        }
      } catch (e) {
        if (disposed) return;
        setSnapshotError(String(e));
      } finally {
        inFlight = false;
      }
    };

    tick();
    timerId = setInterval(tick, 1000);
    return () => {
      disposed = true;
      clearInterval(timerId);
    };
  }, [settings.lanSyncEnabled, settings.lanSyncMode]);

  useEffect(() => {
    setClientPairCode('');
    if (clientPairCodeConnectTimerRef.current) {
      clearTimeout(clientPairCodeConnectTimerRef.current);
      clientPairCodeConnectTimerRef.current = null;
    }

    if (clientConnectBusyTimerRef.current) {
      clearTimeout(clientConnectBusyTimerRef.current);
      clientConnectBusyTimerRef.current = null;
    }
    if (clientDisconnectBusyTimerRef.current) {
      clearTimeout(clientDisconnectBusyTimerRef.current);
      clientDisconnectBusyTimerRef.current = null;
    }
    setClientConnecting(false);
    setClientDisconnecting(false);
  }, [settings.lanSyncMode, settings.lanSyncEnabled]);

  useEffect(() => {
    if (!isClient) return;
    const s = snapshot?.state;
    if (s === 'Connected') {
      setClientConnecting(false);
      if (clientConnectBusyTimerRef.current) {
        clearTimeout(clientConnectBusyTimerRef.current);
        clientConnectBusyTimerRef.current = null;
      }
    }
    if (s === 'Disconnected' || s === 'Stopped') {
      setClientDisconnecting(false);
      if (clientDisconnectBusyTimerRef.current) {
        clearTimeout(clientDisconnectBusyTimerRef.current);
        clientDisconnectBusyTimerRef.current = null;
      }
    }
  }, [snapshot?.state, isClient]);

  const onClientPairCodeChange = (raw) => {
    const normalized = String(raw || '').replace(/\s+/g, '').slice(0, 10);
    setClientPairCode(normalized);

    if (clientPairCodeConnectTimerRef.current) {
      clearTimeout(clientPairCodeConnectTimerRef.current);
      clientPairCodeConnectTimerRef.current = null;
    }

    if (!settings.lanSyncEnabled || !isClient) return;
    if (!normalized || normalized.length !== 10) return;

    clientPairCodeConnectTimerRef.current = setTimeout(async () => {
      try {
        await invoke('lan_sync_connect_peer', {
          peerUrl: settings.lanSyncPeerUrl || '',
          autoReconnect: settings.lanSyncAutoReconnect !== false,
          pairCode: normalized
        });
      } catch (_e) {
      }
    }, 450);
  };

  const connectClientNow = async () => {
    if (!settings.lanSyncEnabled || !isClient) return;
    try {
      setClientConnecting(true);
      if (clientConnectBusyTimerRef.current) {
        clearTimeout(clientConnectBusyTimerRef.current);
        clientConnectBusyTimerRef.current = null;
      }
      clientConnectBusyTimerRef.current = setTimeout(() => {
        clientConnectBusyTimerRef.current = null;
        setClientConnecting(false);
      }, 8000);

      const code = (clientPairCode || '').trim();
      await invoke('lan_sync_connect_peer', {
        peerUrl: settings.lanSyncPeerUrl || '',
        autoReconnect: settings.lanSyncAutoReconnect !== false,
        pairCode: code.length === 10 ? code : null
      });
    } catch (_e) {
    } finally {
    }
  };

  const disconnectClientNow = async () => {
    if (!settings.lanSyncEnabled || !isClient) return;
    try {
      setClientDisconnecting(true);
      if (clientDisconnectBusyTimerRef.current) {
        clearTimeout(clientDisconnectBusyTimerRef.current);
        clientDisconnectBusyTimerRef.current = null;
      }
      clientDisconnectBusyTimerRef.current = setTimeout(() => {
        clientDisconnectBusyTimerRef.current = null;
        setClientDisconnecting(false);
      }, 5000);

      await invoke('lan_sync_disconnect_peer');
    } catch (_e) {
    } finally {
    }
  };

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

  const buildLanSyncQrPayload = (url) => {
    if (!settings.lanSyncEnabled || settings.lanSyncMode !== 'server') return url;
    if (typeof serverPairCode !== 'string' || !serverPairCode.trim()) return url;
    if (typeof serverPairCodeRemainingMs !== 'number' || serverPairCodeRemainingMs <= 0) return url;

    const sep = url.includes('?') ? '&' : '?';
    const expRaw = Date.now() + serverPairCodeRemainingMs;
    const bucketMs = 30_000;
    const exp = Math.floor(expRaw / bucketMs) * bucketMs;
    return `${url}${sep}pair_code=${encodeURIComponent(serverPairCode.trim())}&exp=${exp}`;
  };

  useEffect(() => {
    let disposed = false;

    const refreshQrIfNeeded = async () => {
      if (!qrUrl) return;
      if (qrInFlightRef.current) return;

      const payload = buildLanSyncQrPayload(qrUrl);
      if (payload === lastQrPayloadRef.current) return;

      qrInFlightRef.current = true;
      setQrLoading(true);
      setQrError('');

      try {
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: 'M'
        });
        if (disposed) return;
        lastQrPayloadRef.current = payload;
        setQrDataUrl(dataUrl);
      } catch (e) {
        if (disposed) return;
        setQrError(String(e));
      } finally {
        qrInFlightRef.current = false;
        if (!disposed) setQrLoading(false);
      }
    };

    refreshQrIfNeeded();
    return () => {
      disposed = true;
    };
  }, [qrUrl, settings.lanSyncEnabled, settings.lanSyncMode, serverPairCode, serverPairCodeRemainingMs]);

  const openQr = async (url) => {
    const payload = buildLanSyncQrPayload(url);
    lastQrPayloadRef.current = '';
    setQrUrl(url);
    setQrDataUrl('');
    setQrError('');
    setQrLoading(true);

    try {
      const dataUrl = await QRCode.toDataURL(payload, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M'
      });
      lastQrPayloadRef.current = payload;
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
    lastQrPayloadRef.current = '';
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

  const formatPairCode = (code) => {
    if (typeof code !== 'string') return '';
    const s = code.replace(/\s+/g, '');
    if (!s) return '';
    return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 10)}`.trim();
  };

  const formatRemaining = (ms) => {
    if (typeof ms !== 'number' || ms <= 0) return '';
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const refreshPairCode = async () => {
    try {
      const pair = await invoke('lan_sync_refresh_server_pair_code');
      if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'number') {
        setServerPairCode(pair[0]);
        setServerPairCodeRemainingMs(pair[1]);
      } else {
        setServerPairCode(null);
        setServerPairCodeRemainingMs(null);
      }
    } catch (_e) {
    }
  };

  const refreshTrustedDevices = async () => {
    try {
      const devices = await invoke('lan_sync_list_trusted_devices');
      setTrustedDevices(Array.isArray(devices) ? devices : []);
    } catch (e) {
    }
  };

  const disconnectTrustedDevice = async (deviceId) => {
    try {
      await invoke('lan_sync_disconnect_device', { deviceId });
    } catch (_e) {
    }
    await refreshTrustedDevices();
  };

  const removeTrustedDevice = async (deviceId) => {
    const ok = await showConfirm(t('settings.lanSync.trustedDeviceRemoveConfirm'));
    if (!ok) return;

    try {
      await invoke('lan_sync_remove_trusted_device', { deviceId });
    } catch (_e) {
    }
    await refreshTrustedDevices();
  };

  return (
    <SettingsSection
      title={t('settings.lanSync.title')}
      description={t('settings.lanSync.description')}
    >
      <div className="space-y-6">
        {/* 状态概览卡片 */}
        <StatusOverviewCard
          snapshot={snapshot}
          deviceId={deviceId}
          stateLabel={stateLabel}
          settings={settings}
          onSettingChange={onSettingChange}
          modeOptions={modeOptions}
        />

        {/* 错误显示 */}
        {snapshotError && (
          <div className="p-4 rounded-xl bg-red-50/50 border border-red-100">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-1">
              <i className="ti ti-alert-circle" />
              {t('settings.lanSync.statusFetchFailed')}
            </div>
            <div className="text-xs text-red-600 opacity-80 break-all font-mono leading-relaxed">
              {snapshotError}
            </div>
          </div>
        )}

        {/* 服务器模式功能 */}
        {settings.lanSyncEnabled && isServer && (
          <ServerFeatures
            localUrlsAll={localUrlsAll}
            localUrlsVisible={localUrlsVisible}
            localUrlLimit={localUrlLimit}
            hasMoreLocalUrls={hasMoreLocalUrls}
            showAllLocalUrls={showAllLocalUrls}
            setShowAllLocalUrls={setShowAllLocalUrls}
            openQr={openQr}
            qrUrl={qrUrl}
            qrDataUrl={qrDataUrl}
            qrLoading={qrLoading}
            qrError={qrError}
            closeQr={closeQr}
            onCopy={onCopy}
            copyTip={copyTip}
            serverPairCode={serverPairCode}
            serverPairCodeRemainingMs={serverPairCodeRemainingMs}
            formatPairCode={formatPairCode}
            formatRemaining={formatRemaining}
            refreshPairCode={refreshPairCode}
            trustedDevices={trustedDevices}
            refreshTrustedDevices={refreshTrustedDevices}
            disconnectTrustedDevice={disconnectTrustedDevice}
            removeTrustedDevice={removeTrustedDevice}
          />
        )}

        {/* 客户端模式功能 */}
        {settings.lanSyncEnabled && isClient && (
          <ClientFeatures
            snapshot={snapshot}
            settings={settings}
            clientPairCode={clientPairCode}
            onClientPairCodeChange={onClientPairCodeChange}
            clientConnecting={clientConnecting}
            clientDisconnecting={clientDisconnecting}
            connectClientNow={connectClientNow}
            disconnectClientNow={disconnectClientNow}
            onSettingChange={onSettingChange}
          />
        )}
      </div>
    </SettingsSection>
  );
}

export default LanSyncSection;

// 状态概览卡片组件
function StatusOverviewCard({
  snapshot,
  deviceId,
  stateLabel,
  settings,
  onSettingChange,
  modeOptions
}) {
  const { t } = useTranslation();

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
          <h3 className="text-lg font-semibold text-qc-fg">
            {t('settings.lanSync.status')}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            enabled={Boolean(snapshot?.enabled)}
            text={snapshot ? (snapshot.enabled ? t('settings.lanSync.statusYes') : t('settings.lanSync.statusNo')) : '-'}
          />
          <StatusBadge
            variant="neutral"
            text={snapshot ? stateLabel : '-'}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatusCard
          label={t('settings.lanSync.statusDeviceId')}
          desc={t('settings.lanSync.statusDeviceIdDesc')}
          value={deviceId || '-'}
        />

        {settings.lanSyncEnabled && settings.lanSyncMode === 'server' && (
          <StatusCard
            label={t('settings.lanSync.statusConnectedCount')}
            desc={t('settings.lanSync.statusConnectedCountDesc')}
            value={snapshot?.server_connected_count ?? 0}
          />
        )}

        {settings.lanSyncEnabled && settings.lanSyncMode === 'client' && (
          <StatusCard
            label={t('settings.lanSync.statusPeerUrl')}
            desc={t('settings.lanSync.statusPeerUrlDesc')}
            value={snapshot?.peer_url ?? '-'}
          />
        )}

        <StatusCard label={t('settings.lanSync.enabled')} desc={t('settings.lanSync.enabledDesc')}>
          <div className="mt-2">
            <Toggle
              checked={Boolean(settings.lanSyncEnabled)}
              onChange={checked => onSettingChange('lanSyncEnabled', checked)}
            />
          </div>
        </StatusCard>

        <StatusCard label={t('settings.lanSync.autoStart')} desc={t('settings.lanSync.autoStartDesc')}>
          <div className="mt-2">
            <Toggle
              checked={settings.lanSyncAutoStart !== false}
              onChange={checked => onSettingChange('lanSyncAutoStart', checked)}
            />
          </div>
        </StatusCard>

        <StatusCard label={t('settings.lanSync.sendEnabled')} desc={t('settings.lanSync.sendEnabledDesc')}>
          <div className="mt-2">
            <Toggle
              checked={settings.lanSyncSendEnabled !== false}
              onChange={checked => onSettingChange('lanSyncSendEnabled', checked)}
            />
          </div>
        </StatusCard>

        <StatusCard label={t('settings.lanSync.receiveEnabled')} desc={t('settings.lanSync.receiveEnabledDesc')}>
          <div className="mt-2">
            <Toggle
              checked={settings.lanSyncReceiveEnabled !== false}
              onChange={checked => onSettingChange('lanSyncReceiveEnabled', checked)}
            />
          </div>
        </StatusCard>

        <StatusCard label={t('settings.lanSync.receiveWriteClipboard')} desc={t('settings.lanSync.receiveWriteClipboardDesc')}>
          <div className="mt-2">
            <Toggle
              checked={Boolean(settings.lanSyncReceiveWriteClipboard)}
              onChange={checked => onSettingChange('lanSyncReceiveWriteClipboard', checked)}
              disabled={settings.lanSyncReceiveEnabled === false}
            />
          </div>
        </StatusCard>

        <StatusCard label={t('settings.lanSync.mode')} desc={t('settings.lanSync.modeDesc')}>
          <div className="mt-2">
            <Select
              value={settings.lanSyncMode || 'off'}
              onChange={value => onSettingChange('lanSyncMode', value)}
              options={modeOptions}
              className="w-full"
            />
          </div>
        </StatusCard>

        {settings.lanSyncEnabled && settings.lanSyncMode === 'client' && (
          <StatusCard label={t('settings.lanSync.autoReconnect')} desc={t('settings.lanSync.autoReconnectDesc')}>
            <div className="mt-2">
              <Toggle
                checked={settings.lanSyncAutoReconnect !== false}
                onChange={checked => onSettingChange('lanSyncAutoReconnect', checked)}
              />
            </div>
          </StatusCard>
        )}

        {settings.lanSyncEnabled && settings.lanSyncMode === 'server' && (
          <StatusCard label={t('settings.lanSync.serverPort')} desc={t('settings.lanSync.serverPortDesc')}>
            <div className="mt-2">
              <Input
                type="number"
                value={settings.lanSyncServerPort ?? 18181}
                commitOnBlur
                onCommit={(raw) => {
                  const v = parseInt(String(raw), 10);
                  onSettingChange('lanSyncServerPort', Number.isFinite(v) ? v : 18181);
                }}
                min={1}
                max={65535}
                className="w-full"
              />
            </div>
          </StatusCard>
        )}
      </div>

      {settings.lanSyncEnabled &&
        settings.lanSyncMode === 'client' &&
        snapshot?.reconnecting &&
        snapshot?.state !== 'Connected' && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50/50 border border-blue-100/50 flex items-center gap-2 text-sm text-blue-700">
            <i className="ti ti-refresh animate-spin" />
            <span>{t('settings.lanSync.statusReconnecting')} #{snapshot?.reconnect_attempt ?? 0}</span>
            {snapshot?.next_retry_in_ms != null && (
              <span className="opacity-70">
                ({t('settings.lanSync.statusNextRetry')} {Math.ceil(snapshot.next_retry_in_ms / 1000)}s)
              </span>
            )}
          </div>
        )}
    </div>
  );
}

// 服务器功能组件
function ServerFeatures({
  localUrlsAll,
  localUrlsVisible,
  localUrlLimit,
  hasMoreLocalUrls,
  showAllLocalUrls,
  setShowAllLocalUrls,
  openQr,
  qrUrl,
  qrDataUrl,
  qrLoading,
  qrError,
  closeQr,
  onCopy,
  copyTip,
  serverPairCode,
  serverPairCodeRemainingMs,
  formatPairCode,
  formatRemaining,
  refreshPairCode,
  trustedDevices,
  refreshTrustedDevices,
  disconnectTrustedDevice,
  removeTrustedDevice
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* 本地URL区域 */}
      <div className="relative p-1">
        <div className="flex items-center justify-between mb-4">
          <div>
            <label className="flex items-center gap-2 text-base font-semibold text-qc-fg">
              <i className="ti ti-broadcast text-blue-500" />
              {t('settings.lanSync.localUrls')}
            </label>
            <p className="text-sm text-qc-fg-muted mt-1">
              {t('settings.lanSync.localUrlsDesc')}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {localUrlsAll?.length ? (
            <div className="space-y-2 max-h-64 overflow-auto pr-2">
              {localUrlsVisible.map(url => (
                <div
                  key={url}
                  className="flex items-center gap-3 p-3 rounded-lg border border-qc-border bg-qc-panel hover:bg-qc-hover transition-colors"
                >
                  <div className="text-sm text-qc-fg break-all flex-1 font-mono">
                    {url}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openQr(url)}
                      title={t('settings.lanSync.qrShow')}
                      aria-label={t('settings.lanSync.qrShow')}
                      className="!px-3"
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
                      className="!px-3"
                      icon={<i className="ti ti-copy" />}
                    >
                      {t('common.copy')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center rounded-xl border-2 border-dashed border-qc-border">
              <div className="ti ti-devices text-3xl text-qc-fg-subtle mb-3" />
              <div className="text-sm text-qc-fg-muted">
                {t('settings.lanSync.localUrlsEmpty')}
              </div>
            </div>
          )}

          {hasMoreLocalUrls && (
            <div className="flex justify-center">
              <button
                type="button"
                className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                onClick={() => setShowAllLocalUrls(v => !v)}
              >
                {showAllLocalUrls
                  ? t('settings.lanSync.localUrlsCollapse')
                  : t('settings.lanSync.localUrlsMore', { count: localUrlsAll.length - localUrlLimit })}
              </button>
            </div>
          )}

          {copyTip && (
            <div className="text-center text-sm text-green-600 animate-fade-in">
              {copyTip}
            </div>
          )}
        </div>

        {qrUrl && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeQr();
            }}
          >
            {qrLoading ? (
              <div className="flex flex-col items-center gap-2 text-white/90">
                <i className="ti ti-loader-2 animate-spin text-3xl" />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            ) : qrDataUrl ? (
              <div className="p-3 bg-qc-surface rounded-lg border border-qc-border">
                <img src={qrDataUrl} alt={t('settings.lanSync.qrTitle')} className="w-56 h-56" />
              </div>
            ) : (
              <div className="text-sm text-white/90 text-center px-4">
                {qrError ? qrError : t('settings.lanSync.qrFailed')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 配对码区域 */}
      <div className="p-1">
        <div className="mb-4">
          <label className="flex items-center gap-2 text-base font-semibold text-qc-fg">
            <i className="ti ti-key text-amber-500" />
            {t('settings.lanSync.pairCodeTitle')}
          </label>
          <p className="text-sm text-qc-fg-muted mt-1">
            {t('settings.lanSync.pairCodeTitleDesc')}
          </p>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-lg bg-qc-panel border border-qc-border">
          <div className="flex-1">
            <div className="text-xs text-qc-fg-muted mb-1">
              {t('settings.lanSync.pairCode')}
            </div>
            <div className="font-mono text-xl font-bold tracking-wider text-blue-600">
              {serverPairCode ? formatPairCode(serverPairCode) : '---- ---- --'}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-xs text-qc-fg-muted mb-1">
                {t('settings.lanSync.pairCodeRemaining')}
              </div>
              <div className="font-mono text-lg font-semibold text-qc-fg">
                {serverPairCodeRemainingMs != null ? formatRemaining(serverPairCodeRemainingMs) : '--:--'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onCopy(serverPairCode || '')}
                className="!w-11 !h-11 !p-0 flex items-center justify-center rounded-lg"
                icon={<i className="ti ti-copy text-lg" />}
                disabled={!serverPairCode}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={refreshPairCode}
                className="!w-11 !h-11 !p-0 flex items-center justify-center rounded-lg"
                icon={<i className="ti ti-refresh text-lg" />}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 受信任设备区域 */}
      <div className="p-1">
        <div className="flex items-center justify-between mb-4">
          <div>
            <label className="flex items-center gap-2 text-base font-semibold text-qc-fg">
              <i className="ti ti-devices text-purple-500" />
              {t('settings.lanSync.trustedDevicesTitle')}
            </label>
            <p className="text-sm text-qc-fg-muted mt-1">
              {t('settings.lanSync.trustedDevicesDesc')}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={refreshTrustedDevices}
            className="h-9 text-sm opacity-70 hover:opacity-100"
            icon={<i className="ti ti-refresh" />}
          >
            {t('settings.common.refresh')}
          </Button>
        </div>

        <div>
          {Array.isArray(trustedDevices) && trustedDevices.length ? (
            <div className="space-y-3">
              {trustedDevices.map(d => (
                <div
                  key={d.device_id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-qc-border bg-qc-panel"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-qc-fg break-all font-mono">
                      {d.device_id}
                    </div>
                    <div className="mt-1 text-xs text-qc-fg-muted flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          d.connected ? 'bg-green-500' : 'bg-qc-fg-subtle'
                        }`}
                      />
                      <span>
                        {d.connected
                          ? t('settings.lanSync.trustedDeviceConnected')
                          : t('settings.lanSync.trustedDeviceDisconnected')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => disconnectTrustedDevice(d.device_id)}
                      disabled={!d.connected}
                      className="!px-3"
                      icon={<i className="ti ti-plug-connected-x" />}
                    >
                      {t('settings.lanSync.trustedDeviceDisconnect')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => removeTrustedDevice(d.device_id)}
                      className="!px-3"
                      icon={<i className="ti ti-trash" />}
                    >
                      {t('settings.lanSync.trustedDeviceRemove')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center rounded-xl border-2 border-dashed border-qc-border">
              <div className="ti ti-devices text-3xl text-qc-fg-subtle mb-3" />
              <div className="text-sm text-qc-fg-muted">
                {t('settings.lanSync.trustedDeviceEmpty')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 客户端功能组件
function ClientFeatures({
  snapshot,
  settings,
  clientPairCode,
  onClientPairCodeChange,
  clientConnecting,
  clientDisconnecting,
  connectClientNow,
  disconnectClientNow,
  onSettingChange
}) {
  const { t } = useTranslation();

  const s = snapshot?.state;
  const isConnected = s === 'Connected';
  const isConnectingState = s === 'Connecting';

  const connectDisabled = !settings.lanSyncPeerUrl || clientConnecting || clientDisconnecting || isConnected || isConnectingState;
  const disconnectDisabled = clientDisconnecting || clientConnecting || !snapshot || s === 'Stopped' || s === 'Disconnected';

  const connectLabel = (clientConnecting || isConnectingState) ? t('common.connecting') : t('common.connect');
  const disconnectLabel = clientDisconnecting ? t('common.disconnecting') : t('common.disconnect');

  return (
    <div className="space-y-6">
      {/* 连接配置 */}
      <div className="p-1">
        <div className="mb-4">
          <label className="flex items-center gap-2 text-base font-semibold text-qc-fg">
            <i className="ti ti-settings text-green-500" />
            {t('settings.lanSync.connectionConfig')}
          </label>
          <p className="text-sm text-qc-fg-muted mt-1">
            {t('settings.lanSync.connectionConfigDesc')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-qc-fg">
              {t('settings.lanSync.peerUrl')}
            </label>
            <Input
              type="text"
              value={settings.lanSyncPeerUrl || ''}
              commitOnBlur
              onCommit={(v) => onSettingChange('lanSyncPeerUrl', String(v))}
              className="w-full"
              placeholder="ws://127.0.0.1:18181"
            />
            <div className="text-xs text-qc-fg-muted">
              {t('settings.lanSync.peerUrlDesc')}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-qc-fg">
              {t('settings.lanSync.pairCode')}
            </label>
            <Input
              type="text"
              value={clientPairCode}
              onChange={e => onClientPairCodeChange(e.target.value)}
              className="w-full"
              placeholder="1234567890"
            />
            <div className="text-xs text-qc-fg-muted">
              {t('settings.lanSync.pairCodeDesc')}
            </div>
          </div>
        </div>
      </div>

      {/* 连接控制 */}
      <div className="p-1">
        <div className="mb-4">
          <label className="flex items-center gap-2 text-base font-semibold text-qc-fg">
            <i className="ti ti-plug text-purple-500" />
            {t('settings.lanSync.connectionControl')}
          </label>
          <p className="text-sm text-qc-fg-muted mt-1">
            {t('settings.lanSync.connectionControlDesc')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="md"
            variant="primary"
            onClick={connectClientNow}
            className="min-w-24"
            icon={<i className="ti ti-plug-connected" />}
            disabled={connectDisabled}
          >
            {connectLabel}
          </Button>
          <Button
            size="md"
            variant="secondary"
            onClick={disconnectClientNow}
            className="min-w-24"
            icon={<i className="ti ti-plug-connected-x" />}
            disabled={disconnectDisabled}
          >
            {disconnectLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// UI 组件
function StatusBadge({ enabled, text, title, variant }) {
  const base = 'px-3 py-1.5 rounded-full text-xs font-medium border';
  const v = variant || (enabled ? 'success' : 'danger');

  const styles = {
    success: 'bg-green-50 text-green-700 border-green-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-qc-panel text-qc-fg-muted border-qc-border'
  };

  return (
    <div className={`${base} ${styles[v]}`} title={title}>
      {text}
    </div>
  );
}

function StatusCard({ label, desc, value, children }) {
  return (
    <div className="group relative p-4 rounded-xl bg-qc-panel-2 border border-qc-border transition-all hover:shadow-md hover:border-qc-border-strong">
      <div className="text-xs text-qc-fg-muted pr-6 mb-2">
        {label}
      </div>

      {desc && (
        <div
          className="absolute top-3 right-3 w-5 h-5 rounded-full border border-qc-border flex items-center justify-center text-[10px] text-qc-fg-muted bg-qc-panel/70 cursor-help transition-colors group-hover:border-qc-border-strong group-hover:text-qc-fg"
          title={desc}
        >
          ?
        </div>
      )}

      {children != null ? (
        <div>{children}</div>
      ) : value !== undefined ? (
        <div className="text-base font-semibold text-qc-fg break-all">
          {value}
        </div>
      ) : null}
    </div>
  );
}

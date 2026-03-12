import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { showConfirm } from '../../../shared/utils/dialog';
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
          <StatusCard
            label={t('settings.lanSync.statusDeviceId')}
            desc={t('settings.lanSync.statusDeviceIdDesc')}
            value={deviceId || '-'}
          />

          {settings.lanSyncEnabled && isServer ? (
            <StatusCard
              label={t('settings.lanSync.statusConnectedCount')}
              desc={t('settings.lanSync.statusConnectedCountDesc')}
              value={snapshot?.server_connected_count ?? 0}
            />
          ) : null}

          {settings.lanSyncEnabled && isClient ? (
            <StatusCard
              label={t('settings.lanSync.statusPeerUrl')}
              desc={t('settings.lanSync.statusPeerUrlDesc')}
              value={snapshot?.peer_url ?? '-'}
            />
          ) : null}

          <StatusCard label={t('settings.lanSync.enabled')} desc={t('settings.lanSync.enabledDesc')}>
            <div className="mt-1">
              <Toggle checked={Boolean(settings.lanSyncEnabled)} onChange={checked => onSettingChange('lanSyncEnabled', checked)} />
            </div>
          </StatusCard>

          <StatusCard label={t('settings.lanSync.autoStart')} desc={t('settings.lanSync.autoStartDesc')}>
            <div className="mt-1">
              <Toggle checked={settings.lanSyncAutoStart !== false} onChange={checked => onSettingChange('lanSyncAutoStart', checked)} />
            </div>
          </StatusCard>

          <StatusCard label={t('settings.lanSync.mode')} desc={t('settings.lanSync.modeDesc')}>
            <div className="mt-1">
              <Select value={settings.lanSyncMode || 'off'} onChange={value => onSettingChange('lanSyncMode', value)} options={modeOptions} className="w-full" />
            </div>
          </StatusCard>

          {settings.lanSyncEnabled && isClient ? (
            <StatusCard label={t('settings.lanSync.autoReconnect')} desc={t('settings.lanSync.autoReconnectDesc')}>
              <div className="mt-1">
                <Toggle checked={settings.lanSyncAutoReconnect !== false} onChange={checked => onSettingChange('lanSyncAutoReconnect', checked)} />
              </div>
            </StatusCard>
          ) : null}

          {settings.lanSyncEnabled && isServer ? (
            <StatusCard label={t('settings.lanSync.serverPort')} desc={t('settings.lanSync.serverPortDesc')}>
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
          ) : null}

          {settings.lanSyncEnabled && isClient ? (
            <>
              <StatusCard label={t('settings.lanSync.peerUrl')} desc={t('settings.lanSync.peerUrlDesc')}>
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
              <StatusCard label={t('settings.lanSync.pairCode')} desc={t('settings.lanSync.pairCodeDesc')}>
                <div className="mt-1">
                  <Input
                    type="text"
                    value={clientPairCode}
                    onChange={e => onClientPairCodeChange(e.target.value)}
                    className="w-full"
                    placeholder="1234567890"
                  />
                </div>
              </StatusCard>

              <StatusCard label={t('settings.lanSync.connectionControl')} desc={t('settings.lanSync.connectionControlDesc')}>
                <div className="mt-2 flex items-center justify-end gap-2">
                  {(() => {
                    const s = snapshot?.state;
                    const isConnected = s === 'Connected';
                    const isConnectingState = s === 'Connecting';
                    const connectDisabled = !settings.lanSyncPeerUrl || clientConnecting || clientDisconnecting || isConnected || isConnectingState;
                    const disconnectDisabled = clientDisconnecting || clientConnecting || !snapshot || s === 'Stopped' || s === 'Disconnected';
                    const connectLabel = (clientConnecting || isConnectingState) ? t('common.connecting') : t('common.connect');
                    const disconnectLabel = clientDisconnecting ? t('common.disconnecting') : t('common.disconnect');

                    return (
                      <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={connectClientNow}
                    className="min-w-16"
                    icon={<i className="ti ti-plug-connected" />}
                    disabled={connectDisabled}
                  >
                    {connectLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={disconnectClientNow}
                    className="min-w-16"
                    icon={<i className="ti ti-plug-connected-x" />}
                    disabled={disconnectDisabled}
                  >
                    {disconnectLabel}
                  </Button>
                      </>
                    );
                  })()}
                </div>
              </StatusCard>
            </>
          ) : null}
        </div>

        {settings.lanSyncEnabled && isServer ? (
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-800 dark:text-white">{t('settings.lanSync.pairCodeTitle')}</label>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t('settings.lanSync.pairCodeTitleDesc')}</p>

            <div className="mt-2 flex items-center gap-2">
              <div className="px-3 py-2 rounded-lg border border-gray-200/70 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/40 font-mono text-sm text-gray-800 dark:text-gray-100">
                {serverPairCode ? formatPairCode(serverPairCode) : '-'}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onCopy(serverPairCode || '')}
                title={t('common.copy')}
                aria-label={t('common.copy')}
                className="min-w-16"
                icon={<i className="ti ti-copy" />}
                disabled={!serverPairCode}
              >
                {t('common.copy')}
              </Button>
              <div className="text-xs text-gray-600 dark:text-gray-300">
                {serverPairCodeRemainingMs != null ? `${t('settings.lanSync.pairCodeRemaining')}: ${formatRemaining(serverPairCodeRemainingMs)}` : ''}
              </div>
              {copyTip ? (
                <div className="text-xs text-gray-600 dark:text-gray-300">{copyTip}</div>
              ) : null}
              <div className="flex-1" />
              <Button
                size="sm"
                variant="secondary"
                onClick={refreshPairCode}
                title={t('settings.lanSync.pairCodeRefresh')}
                aria-label={t('settings.lanSync.pairCodeRefresh')}
                className="min-w-16"
                icon={<i className="ti ti-refresh" />}
              >
                {t('settings.lanSync.pairCodeRefresh')}
              </Button>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-800 dark:text-white">{t('settings.lanSync.trustedDevicesTitle')}</label>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t('settings.lanSync.trustedDevicesDesc')}</p>

              <div className="mt-2 flex flex-col gap-2">
                {Array.isArray(trustedDevices) && trustedDevices.length ? (
                  <div className="flex flex-col gap-2">
                    {trustedDevices.map(d => (
                      <div
                        key={d.device_id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200/70 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-800 dark:text-gray-100 break-all font-mono">{d.device_id}</div>
                          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <span
                              className={d.connected
                                ? 'inline-block w-2 h-2 rounded-full bg-green-500'
                                : 'inline-block w-2 h-2 rounded-full bg-gray-400'}
                            />
                            <span>
                              {d.connected ? t('settings.lanSync.trustedDeviceConnected') : t('settings.lanSync.trustedDeviceDisconnected')}
                            </span>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => disconnectTrustedDevice(d.device_id)}
                          disabled={!d.connected}
                          className="min-w-16"
                          icon={<i className="ti ti-plug-connected-x" />}
                        >
                          {t('settings.lanSync.trustedDeviceDisconnect')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => removeTrustedDevice(d.device_id)}
                          className="min-w-16"
                          icon={<i className="ti ti-trash" />}
                        >
                          {t('settings.lanSync.trustedDeviceRemove')}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">{t('settings.lanSync.trustedDeviceEmpty')}</div>
                )}

                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={refreshTrustedDevices}
                    className="min-w-16"
                    icon={<i className="ti ti-refresh" />}
                  >
                    {t('settings.common.refresh')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {settings.lanSyncEnabled && isClient && snapshot?.reconnecting ? (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
            {t('settings.lanSync.statusReconnecting')} #{snapshot?.reconnect_attempt ?? 0}{snapshot?.next_retry_in_ms != null ? `, ${t('settings.lanSync.statusNextRetry')} ${Math.ceil(snapshot.next_retry_in_ms / 1000)}s` : ''}
          </div>
        ) : null}

        {snapshotError ? (
          <div className="mt-2 text-xs text-red-600 break-all">{t('settings.lanSync.statusFetchFailed')}: {snapshotError}</div>
        ) : null}
      </div>

      {settings.lanSyncEnabled && isServer ? (
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
      ) : null}

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

              {serverPairCodeRemainingMs != null ? (
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {t('settings.lanSync.pairCodeRemaining')}: {formatRemaining(serverPairCodeRemainingMs)}
                </div>
              ) : null}

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

function StatusCard({ label, desc, value, children }) {
  return (
    <div className="group relative px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200/70 dark:border-gray-700/60 transition-colors hover:bg-gray-100/70 dark:hover:bg-gray-900/55 hover:border-gray-300/80 dark:hover:border-gray-600/80">
      <div className="text-xs text-gray-500 dark:text-gray-400 pr-5">{label}</div>
      {desc ? (
        <div
          className="absolute top-2 right-2 w-4 h-4 rounded-full border border-gray-300/80 dark:border-gray-600 flex items-center justify-center text-[10px] text-gray-500 dark:text-gray-300 bg-white/60 dark:bg-gray-900/40 cursor-help transition-colors group-hover:border-gray-400 dark:group-hover:border-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-200"
          title={desc}
        >
          ?
        </div>
      ) : null}
      {children != null ? (
        <div className="mt-1">{children}</div>
      ) : value !== undefined ? (
        <div className="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-100 break-all">{value}</div>
      ) : null}
    </div>
  );
}

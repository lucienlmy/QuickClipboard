import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Button from '@shared/components/ui/Button';
import Input from '@shared/components/ui/Input';
import Toggle from '@shared/components/ui/Toggle';
import SegmentedControl from '@shared/components/ui/SegmentedControl';
import {
  discoverSyncTransferLanPeers,
  fetchSyncTransferLanPeerSnapshot,
  getSyncTransferLanAutoSyncStatus,
  getSyncTransferLanStatus,
  getSyncTransferLanLocalSnapshot,
  getSyncTransferModeInfos,
  listSyncTransferLanPairedPeers,
  pairSyncTransferLanPeer,
  pullSyncTransferLanPeer,
  pushSyncTransferLanPeer,
  refreshSyncTransferLanPairingCode,
  removeSyncTransferLanPairedPeer,
  sendSyncTransferLanFileToPeer,
  startSyncTransferLanHttpServer,
  stopSyncTransferLanHttpServer,
  updateSyncTransferLanAutoSyncSettings,
} from '@shared/api/syncTransfer';
import { toast } from '@shared/store/toastStore';
import WebdavSection from './WebdavSection';

function SyncTransferSection({ settings, onSettingChange }) {
  const { t } = useTranslation();
  const [activeMode, setActiveMode] = useState('webdav');
  const [modeInfos, setModeInfos] = useState([]);
  const [lanStatus, setLanStatus] = useState(null);
  const [pairedPeers, setPairedPeers] = useState([]);
  const [lanBusy, setLanBusy] = useState('');
  const [peerSnapshot, setPeerSnapshot] = useState(null);
  const [lastPullReport, setLastPullReport] = useState(null);
  const [lastPushReport, setLastPushReport] = useState(null);
  const [localSnapshot, setLocalSnapshot] = useState(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState(null);
  const [discoveredPeers, setDiscoveredPeers] = useState([]);
  const [peerBaseUrl, setPeerBaseUrl] = useState('');
  const [peerPairingCode, setPeerPairingCode] = useState('');
  const [transferFilePath, setTransferFilePath] = useState('');
  const [lastFileTransfer, setLastFileTransfer] = useState(null);
  const [pairingCodeVisible, setPairingCodeVisible] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSyncTransferModeInfos()
      .then(items => {
        if (mounted && Array.isArray(items)) setModeInfos(items);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const loadLanState = async () => {
    const [status, peers, snapshot] = await Promise.all([
      getSyncTransferLanStatus(),
      listSyncTransferLanPairedPeers(),
      getSyncTransferLanLocalSnapshot(),
    ]);
    setLanStatus(status);
    setPairedPeers(Array.isArray(peers) ? peers : []);
    setLocalSnapshot(snapshot);
    try {
      setAutoSyncStatus(await getSyncTransferLanAutoSyncStatus());
    } catch {
      setAutoSyncStatus(null);
    }
  };

  useEffect(() => {
    if (activeMode !== 'lan') return;
    runLanAction('startServer', startSyncTransferLanHttpServer);
  }, [activeMode]);

  useEffect(() => {
    if (activeMode !== 'lan') return;
    let cancelled = false;
    const discover = async () => {
      try {
        const peers = await discoverSyncTransferLanPeers(900);
        if (!cancelled) {
          setDiscoveredPeers(Array.isArray(peers) ? peers : []);
        }
      } catch {
        if (!cancelled) {
          setDiscoveredPeers([]);
        }
      }
    };
    discover();
    const timer = window.setInterval(discover, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeMode]);

  const runLanAction = async (actionId, action) => {
    try {
      setLanBusy(actionId);
      await action();
      await loadLanState();
    } catch (e) {
      toast.error(e?.message || String(e), { duration: 5000 });
    } finally {
      setLanBusy('');
    }
  };

  const selectTransferFile = async () => {
    try {
      const selected = await open({ multiple: false, directory: false });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (selectedPath) {
        setTransferFilePath(selectedPath);
      }
    } catch (e) {
      toast.error(e?.message || String(e), { duration: 5000 });
    }
  };

  const modes = [
    {
      value: 'webdav',
      label: t('settings.syncTransfer.modes.webdav'),
    },
    {
      value: 'lan',
      label: t('settings.syncTransfer.modes.lan'),
    },
  ];
  const modeInfoById = new Map(modeInfos.map(info => [info.mode, info]));
  const modeOptions = modes.map(mode => {
    const info = modeInfoById.get(mode.value);
    const available = info?.available !== false;
    return {
      value: mode.value,
      label: available ? mode.label : `${mode.label} (${t('settings.syncTransfer.pending')})`,
    };
  });

  return (
    <div className="space-y-6">
      <SettingsSection title={t('settings.syncTransfer.title')} description={t('settings.syncTransfer.description')}>
        <SettingItem label={t('settings.syncTransfer.modeTitle')} description={t('settings.syncTransfer.modeDesc')}>
          <SegmentedControl
            value={activeMode}
            onChange={setActiveMode}
            options={modeOptions}
            className="max-w-sm"
          />
        </SettingItem>
      </SettingsSection>

      {activeMode === 'webdav' ? (
        <WebdavSection settings={settings} onSettingChange={onSettingChange} />
      ) : (
        <LanModePanel
          status={lanStatus}
          localSnapshot={localSnapshot}
          autoSyncStatus={autoSyncStatus}
          peers={pairedPeers}
          busy={lanBusy}
          onStartServer={() => runLanAction('startServer', startSyncTransferLanHttpServer)}
          onStopServer={() => runLanAction('stopServer', stopSyncTransferLanHttpServer)}
          onRefresh={() => runLanAction('refresh', refreshSyncTransferLanPairingCode)}
          onReload={() => runLanAction('reload', async () => {})}
          discoveredPeers={discoveredPeers}
          onDiscoverPeers={() => runLanAction('discoverPeers', async () => {
            const peers = await discoverSyncTransferLanPeers();
            setDiscoveredPeers(Array.isArray(peers) ? peers : []);
          })}
          peerBaseUrl={peerBaseUrl}
          peerPairingCode={peerPairingCode}
          onPeerBaseUrlChange={setPeerBaseUrl}
          onPairingCodeChange={setPeerPairingCode}
          onPairPeer={() => runLanAction('pairPeer', () => pairSyncTransferLanPeer(peerBaseUrl, peerPairingCode))}
          peerSnapshot={peerSnapshot}
          onFetchPeerSnapshot={deviceId => runLanAction(`snapshot-${deviceId}`, async () => {
            const snapshot = await fetchSyncTransferLanPeerSnapshot(deviceId);
            setPeerSnapshot({ deviceId, snapshot });
          })}
          lastPullReport={lastPullReport}
          onPullPeer={deviceId => runLanAction(`pull-${deviceId}`, async () => {
            const report = await pullSyncTransferLanPeer(deviceId);
            setLastPullReport({ deviceId, report });
          })}
          lastPushReport={lastPushReport}
          onPushPeer={deviceId => runLanAction(`push-${deviceId}`, async () => {
            const report = await pushSyncTransferLanPeer(deviceId);
            setLastPushReport({ deviceId, report });
          })}
          transferFilePath={transferFilePath}
          onTransferFilePathChange={setTransferFilePath}
          onSelectTransferFile={selectTransferFile}
          pairingCodeVisible={pairingCodeVisible}
          onTogglePairingCodeVisible={() => setPairingCodeVisible(value => !value)}
          lastFileTransfer={lastFileTransfer}
          onSendFile={deviceId => runLanAction(`sendFile-${deviceId}`, async () => {
            const result = await sendSyncTransferLanFileToPeer(deviceId, transferFilePath);
            setLastFileTransfer({ deviceId, result });
          })}
          onRemovePeer={deviceId => runLanAction(`remove-${deviceId}`, () => removeSyncTransferLanPairedPeer(deviceId))}
          onUpdateAutoSync={settings => runLanAction('updateAutoSync', () => updateSyncTransferLanAutoSyncSettings(settings))}
          t={t}
        />
      )}
    </div>
  );
}

function LanModePanel({
  status,
  localSnapshot,
  autoSyncStatus,
  peers,
  busy,
  peerBaseUrl,
  peerPairingCode,
  onPeerBaseUrlChange,
  onPairingCodeChange,
  onStartServer,
  onStopServer,
  onRefresh,
  onReload,
  discoveredPeers,
  onDiscoverPeers,
  onPairPeer,
  peerSnapshot,
  onFetchPeerSnapshot,
  lastPullReport,
  onPullPeer,
  lastPushReport,
  onPushPeer,
  transferFilePath,
  onTransferFilePathChange,
  onSelectTransferFile,
  pairingCodeVisible,
  onTogglePairingCodeVisible,
  lastFileTransfer,
  onSendFile,
  onRemovePeer,
  onUpdateAutoSync,
  t
}) {
  const localPairingCode = status?.pairing_code;
  const autoSettings = autoSyncStatus?.settings || {
    auto_push: false,
    auto_pull: false,
    interval_secs: 3,
  };
  const autoPushEnabled = Boolean(autoSettings.auto_push);
  const autoPullEnabled = Boolean(autoSettings.auto_pull);

  const updateAutoSetting = (patch) => {
    onUpdateAutoSync({
      ...autoSettings,
      ...patch,
    });
  };

  const formatTime = (value) => {
    if (!value) return t('settings.syncTransfer.neverSeen');
    try {
      return new Date(value).toLocaleString();
    } catch {
      return t('settings.syncTransfer.neverSeen');
    }
  };

  const updateAutoDirection = (direction, checked) => {
    onUpdateAutoSync({
      ...autoSettings,
      [direction]: checked,
    });
  };

  const pairingCodeText = localPairingCode?.pairing_code || '------';
  const displayedPairingCode = pairingCodeVisible ? pairingCodeText : '******';
  const selectDiscoveredPeer = (peer) => {
    onPeerBaseUrlChange(peer.base_url);
  };

  return (
    <div className="space-y-6">
      <SettingsSection title={t('settings.syncTransfer.lanTitle')} description={t('settings.syncTransfer.lanSimpleDesc')}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={t('settings.syncTransfer.httpState')}
              value={status?.http_running ? t('settings.syncTransfer.running') : t('settings.syncTransfer.stopped')}
              active={Boolean(status?.http_running)}
            />
            <StatusPill
              label={t('settings.syncTransfer.pairedCount')}
              value={String(status?.paired_count ?? 0)}
            />
            <StatusPill
              label={t('settings.syncTransfer.localSnapshot')}
              value={t('settings.syncTransfer.compactSnapshot', {
                history: Object.keys(localSnapshot?.history_states || {}).length,
                favorites: Object.keys(localSnapshot?.favorite_states || {}).length,
              })}
            />
          </div>

          <div className="rounded-lg border border-qc-border bg-qc-surface/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-qc-fg">{t('settings.syncTransfer.receivePanelTitle')}</div>
                <div className="text-xs text-qc-fg-muted">{t('settings.syncTransfer.receivePanelDesc')}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Toggle
                  checked={Boolean(status?.http_running)}
                  onChange={checked => (checked ? onStartServer() : onStopServer())}
                  disabled={busy === 'startServer' || busy === 'stopServer'}
                />
                <span className="text-sm text-qc-fg-muted">
                  {status?.http_running ? t('settings.syncTransfer.serviceRunning') : t('settings.syncTransfer.stopped')}
                </span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="rounded-lg border border-qc-border bg-qc-panel-2 p-3">
                <div className="mb-2 text-xs text-qc-fg-muted">{t('settings.syncTransfer.pairingCode')}</div>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 rounded-lg border border-qc-border bg-qc-surface px-3 py-2 text-center font-mono text-2xl tracking-widest text-qc-fg">
                    {displayedPairingCode}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onTogglePairingCodeVisible}
                    icon={<i className={pairingCodeVisible ? 'ti ti-eye-off' : 'ti ti-eye'} />}
                  >
                    {pairingCodeVisible ? t('settings.syncTransfer.hidePairingCode') : t('settings.syncTransfer.showPairingCode')}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={onRefresh} loading={busy === 'refresh'} icon={<i className="ti ti-refresh" />}>
                    {t('settings.syncTransfer.refreshPairingCode')}
                  </Button>
                </div>
                <div className="mt-2 text-xs text-qc-fg-muted">
                  {t('settings.syncTransfer.pairingMeta', { attempts: localPairingCode?.remaining_attempts ?? 0 })}
                </div>
              </div>

              <div className="min-w-0 rounded-lg border border-qc-border bg-qc-panel-2 p-3">
                <div className="mb-2 text-xs text-qc-fg-muted">{t('settings.syncTransfer.localEndpoints')}</div>
                {(status?.local_endpoints || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {status.local_endpoints.map(endpoint => (
                      <span
                        key={endpoint.base_url}
                        className="max-w-full break-all rounded-lg border border-qc-border bg-qc-surface px-3 py-2 text-left font-mono text-xs text-qc-fg"
                      >
                        {endpoint.base_url}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-qc-fg-muted">{t('settings.syncTransfer.noLocalEndpoints')}</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-qc-border bg-qc-surface/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-qc-fg">{t('settings.syncTransfer.connectPanelTitle')}</div>
                <div className="text-xs text-qc-fg-muted">{t('settings.syncTransfer.connectPanelDesc')}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={onDiscoverPeers} loading={busy === 'discoverPeers'} icon={<i className="ti ti-radar" />}>
                {t('settings.syncTransfer.refreshDiscovery')}
              </Button>
            </div>

            <div className="mb-3 divide-y divide-qc-border rounded-lg border border-qc-border bg-qc-panel-2">
              {discoveredPeers.length > 0 ? discoveredPeers.map(peer => {
                const selected = peer.base_url === peerBaseUrl;
                return (
                  <button
                    key={peer.device_id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-qc-hover ${selected ? 'bg-qc-hover' : ''}`}
                    onClick={() => selectDiscoveredPeer(peer)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-qc-fg">{peer.device_name || peer.device_id}</span>
                      <span className="block truncate text-xs text-qc-fg-muted">{peer.base_url}</span>
                    </span>
                    <span className="shrink-0 text-xs text-qc-fg-muted">{t('settings.syncTransfer.clickToUse')}</span>
                  </button>
                );
              }) : (
                <div className="px-3 py-6 text-center text-sm text-qc-fg-muted">{t('settings.syncTransfer.noDiscoveredPeersHint')}</div>
              )}
            </div>

            <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,220px)_auto]">
              <Input
                value={peerBaseUrl}
                onChange={e => onPeerBaseUrlChange(e.target.value)}
                placeholder="http://192.168.1.10:35691"
                className="w-full"
              />
              <Input
                value={peerPairingCode}
                onChange={e => onPairingCodeChange(e.target.value)}
                placeholder={t('settings.syncTransfer.peerPairingCode')}
                className="w-full"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={onPairPeer}
                loading={busy === 'pairPeer'}
                disabled={!peerBaseUrl.trim() || !peerPairingCode.trim()}
                icon={<i className="ti ti-link-plus" />}
                className="w-full lg:w-auto"
              >
                {t('settings.syncTransfer.pairPeer')}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-qc-border bg-qc-surface/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-qc-fg">{t('settings.syncTransfer.pairedPeers')}</div>
                <div className="text-xs text-qc-fg-muted">{t('settings.syncTransfer.lanDevicesStepDesc')}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={onReload} loading={busy === 'reload'} icon={<i className="ti ti-refresh" />}>
                {t('settings.common.refresh')}
              </Button>
            </div>

            {peers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-qc-border px-3 py-6 text-center text-sm text-qc-fg-muted">{t('settings.syncTransfer.noPairedPeers')}</div>
            ) : (
              <div className="divide-y divide-qc-border">
                {peers.map(peer => (
                  <div key={peer.device_id} className="grid gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-qc-fg">{peer.device_name || peer.device_id}</div>
                      <div className="truncate text-xs text-qc-fg-muted">{peer.base_url || peer.device_id}</div>
                      <div className="truncate text-xs text-qc-fg-subtle">
                        {t('settings.syncTransfer.lastSeen')}: {formatTime(peer.last_seen_at_ms)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onFetchPeerSnapshot(peer.device_id)}
                        loading={busy === `snapshot-${peer.device_id}`}
                        icon={<i className="ti ti-list-search" />}
                      >
                        {t('settings.syncTransfer.fetchSnapshot')}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onPushPeer(peer.device_id)}
                        loading={busy === `push-${peer.device_id}`}
                        icon={<i className="ti ti-upload" />}
                      >
                        {t('settings.syncTransfer.pushPeer')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onPullPeer(peer.device_id)}
                        loading={busy === `pull-${peer.device_id}`}
                        icon={<i className="ti ti-download" />}
                      >
                        {t('settings.syncTransfer.pullPeer')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onSendFile(peer.device_id)}
                        loading={busy === `sendFile-${peer.device_id}`}
                        disabled={!transferFilePath.trim()}
                        icon={<i className="ti ti-file-upload" />}
                      >
                        {t('settings.syncTransfer.sendFile')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onRemovePeer(peer.device_id)}
                        loading={busy === `remove-${peer.device_id}`}
                        icon={<i className="ti ti-trash" />}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {peerSnapshot?.snapshot && (
            <div className="rounded-lg border border-qc-border bg-qc-surface/60 p-3 text-sm text-qc-fg-muted">
              {t('settings.syncTransfer.peerSnapshotSummary', {
                history: Object.keys(peerSnapshot.snapshot.history_states || {}).length,
                favorites: Object.keys(peerSnapshot.snapshot.favorite_states || {}).length,
                groups: (peerSnapshot.snapshot.groups || []).length,
              })}
            </div>
          )}
          {lastPullReport?.report && (
            <div className="rounded-lg border border-qc-border bg-qc-surface/60 p-3 text-sm text-qc-fg-muted">
              {t('settings.syncTransfer.pullResultSummary', {
                total: lastPullReport.report.pulled || 0,
                history: lastPullReport.report.pulled_clipboard || 0,
                favorites: lastPullReport.report.pulled_favorites || 0,
                groups: lastPullReport.report.pulled_groups || 0,
              })}
            </div>
          )}
          {lastPushReport?.report && (
            <div className="rounded-lg border border-qc-border bg-qc-surface/60 p-3 text-sm text-qc-fg-muted">
              {t('settings.syncTransfer.pushResultSummary', {
                total: lastPushReport.report.pushed || 0,
                history: lastPushReport.report.pushed_clipboard || 0,
                favorites: lastPushReport.report.pushed_favorites || 0,
                groups: lastPushReport.report.pushed_groups || 0,
              })}
            </div>
          )}
          {lastFileTransfer?.result && (
            <div className="rounded-lg border border-qc-border bg-qc-surface/60 p-3 text-sm text-qc-fg-muted">
              {t('settings.syncTransfer.fileTransferResult', { path: lastFileTransfer.result.path || '-' })}
            </div>
          )}

          <div className="rounded-lg border border-qc-border bg-qc-surface/50 p-4">
            <div className="mb-3">
              <div className="text-sm font-medium text-qc-fg">{t('settings.syncTransfer.filePanelTitle')}</div>
              <div className="text-xs text-qc-fg-muted">{t('settings.syncTransfer.filePanelDesc')}</div>
            </div>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={transferFilePath}
                onChange={e => onTransferFilePathChange(e.target.value)}
                placeholder="C:\\Users\\You\\Desktop\\file.zip"
                className="min-w-0"
              />
              <Button size="sm" variant="secondary" onClick={onSelectTransferFile} icon={<i className="ti ti-file-search" />}>
                {t('settings.syncTransfer.selectTransferFile')}
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.syncTransfer.advancedTitle')} description={t('settings.syncTransfer.advancedDesc')}>
        <SettingItem label={t('settings.syncTransfer.autoSyncDirections')} description={t('settings.syncTransfer.autoSyncDirectionsDesc')}>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-qc-fg">
              <Toggle
                checked={autoPushEnabled}
                onChange={checked => updateAutoDirection('auto_push', checked)}
                disabled={busy === 'updateAutoSync'}
              />
              {t('settings.syncTransfer.autoPush')}
            </label>
            <label className="flex items-center gap-2 text-sm text-qc-fg">
              <Toggle
                checked={autoPullEnabled}
                onChange={checked => updateAutoDirection('auto_pull', checked)}
                disabled={busy === 'updateAutoSync'}
              />
              {t('settings.syncTransfer.autoPull')}
            </label>
          </div>
        </SettingItem>
        <SettingItem label={t('settings.syncTransfer.autoSyncInterval')} description={t('settings.syncTransfer.autoSyncIntervalDesc')}>
          <Input
            type="number"
            min="1"
            max="3600"
            value={autoSettings.interval_secs}
            commitOnBlur
            onCommit={v => updateAutoSetting({ interval_secs: Math.max(1, Math.min(3600, parseInt(String(v), 10) || 3)) })}
            className="w-28"
          />
        </SettingItem>
      </SettingsSection>
    </div>
  );
}

function StatusPill({ label, value, active = false }) {
  return (
    <span className={`rounded-lg border px-3 py-2 text-sm ${active ? 'border-blue-400/60 bg-blue-500/10 text-qc-fg' : 'border-qc-border bg-qc-panel-2 text-qc-fg-muted'}`}>
      {label}: {value}
    </span>
  );
}

export default SyncTransferSection;

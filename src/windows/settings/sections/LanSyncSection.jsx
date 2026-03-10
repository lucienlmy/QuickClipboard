import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import SettingsSection from '../components/SettingsSection';
import SettingItem from '../components/SettingItem';
import Toggle from '@shared/components/ui/Toggle';
import Select from '@shared/components/ui/Select';
import Input from '@shared/components/ui/Input';

function LanSyncSection({
  settings,
  onSettingChange
}) {
  const { t } = useTranslation();

  const [snapshot, setSnapshot] = useState(null);
  const [snapshotError, setSnapshotError] = useState('');
  const [deviceId, setDeviceId] = useState('');

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
      <SettingItem label={t('settings.lanSync.status')} description={t('settings.lanSync.statusDesc')}>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-gray-700 dark:text-gray-200">{t('settings.lanSync.statusEnabled')}: {snapshot ? (snapshot.enabled ? t('settings.lanSync.statusYes') : t('settings.lanSync.statusNo')) : '-'}</span>
            <span className="text-gray-700 dark:text-gray-200">{t('settings.lanSync.statusState')}: {snapshot ? stateLabel : '-'}</span>
          </div>
          <div className="text-gray-600 dark:text-gray-300 break-all">{t('settings.lanSync.statusDeviceId')}: {deviceId || '-'}</div>
          <div className="flex items-center gap-3">
            <span className="text-gray-600 dark:text-gray-300">{t('settings.lanSync.statusServerPort')}: {snapshot?.server_port ?? '-'}</span>
            <span className="text-gray-600 dark:text-gray-300">{t('settings.lanSync.statusConnectedCount')}: {snapshot?.server_connected_count ?? 0}</span>
          </div>
          <div className="text-gray-600 dark:text-gray-300 break-all">{t('settings.lanSync.statusPeerUrl')}: {snapshot?.peer_url ?? '-'}</div>
          {snapshot?.reconnecting ? (
            <div className="text-gray-600 dark:text-gray-300">{t('settings.lanSync.statusReconnecting')} #{snapshot?.reconnect_attempt ?? 0}{snapshot?.next_retry_in_ms != null ? `, ${t('settings.lanSync.statusNextRetry')} ${Math.ceil(snapshot.next_retry_in_ms / 1000)}s` : ''}</div>
          ) : null}
          {snapshotError ? (
            <div className="text-red-600">{t('settings.lanSync.statusFetchFailed')}: {snapshotError}</div>
          ) : null}
        </div>
      </SettingItem>
      <SettingItem label={t('settings.lanSync.enabled')} description={t('settings.lanSync.enabledDesc')}>
        <Toggle checked={settings.lanSyncEnabled} onChange={checked => onSettingChange('lanSyncEnabled', checked)} />
      </SettingItem>

      <SettingItem label={t('settings.lanSync.mode')} description={t('settings.lanSync.modeDesc')}>
        <Select value={settings.lanSyncMode || 'off'} onChange={value => onSettingChange('lanSyncMode', value)} options={modeOptions} className="w-56" />
      </SettingItem>

      {settings.lanSyncEnabled && isServer && (
        <SettingItem label={t('settings.lanSync.serverPort')} description={t('settings.lanSync.serverPortDesc')}>
          <Input type="number" value={settings.lanSyncServerPort ?? 18181} onChange={e => onSettingChange('lanSyncServerPort', parseInt(e.target.value) || 18181)} min={1} max={65535} className="w-32" />
        </SettingItem>
      )}

      {settings.lanSyncEnabled && isClient && (
        <>
          <SettingItem label={t('settings.lanSync.peerUrl')} description={t('settings.lanSync.peerUrlDesc')}>
            <Input type="text" value={settings.lanSyncPeerUrl || ''} onChange={e => onSettingChange('lanSyncPeerUrl', e.target.value)} className="w-[420px]" placeholder="ws://127.0.0.1:18181" />
          </SettingItem>

          <SettingItem label={t('settings.lanSync.autoReconnect')} description={t('settings.lanSync.autoReconnectDesc')}>
            <Toggle checked={settings.lanSyncAutoReconnect !== false} onChange={checked => onSettingChange('lanSyncAutoReconnect', checked)} />
          </SettingItem>
        </>
      )}
    </SettingsSection>;
}

export default LanSyncSection;

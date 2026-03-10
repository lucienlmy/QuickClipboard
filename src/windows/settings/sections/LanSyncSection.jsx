import { useTranslation } from 'react-i18next';
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

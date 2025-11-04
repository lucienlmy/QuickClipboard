import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'

function GeneralSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

  const historyLimitOptions = [
    { value: 50, label: `50 ${t('settings.general.items')}` },
    { value: 100, label: `100 ${t('settings.general.items')}` },
    { value: 200, label: `200 ${t('settings.general.items')}` },
    { value: 500, label: `500 ${t('settings.general.items')}` },
    { value: 9999, label: `9999 ${t('settings.general.items')}` },
    { value: 999999, label: t('settings.general.unlimited') }
  ]

  return (
    <SettingsSection
      title={t('settings.general.title')}
      description={t('settings.general.description')}
    >
      <SettingItem
        label={t('settings.general.autoStart')}
        description={t('settings.general.autoStartDesc')}
      >
        <Toggle
          checked={settings.autoStart}
          onChange={(checked) => onSettingChange('autoStart', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.general.startupNotification')}
        description={t('settings.general.startupNotificationDesc')}
      >
        <Toggle
          checked={settings.showStartupNotification}
          onChange={(checked) => onSettingChange('showStartupNotification', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.general.historyLimit')}
        description={t('settings.general.historyLimitDesc')}
      >
        <Select
          value={settings.historyLimit}
          onChange={(value) => onSettingChange('historyLimit', parseInt(value))}
          options={historyLimitOptions}
        />
      </SettingItem>
    </SettingsSection>
  )
}

export default GeneralSection


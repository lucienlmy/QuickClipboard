import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'

function GeneralSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

  const historyLimitOptions = [
    { value: 50, label: '50 条' },
    { value: 100, label: '100 条' },
    { value: 200, label: '200 条' },
    { value: 500, label: '500 条' },
    { value: 9999, label: '9999 条' },
    { value: 999999, label: '不限' }
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


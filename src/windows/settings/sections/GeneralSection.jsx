import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'
import { setAutoStart } from '@shared/api/settings'
import { toast } from '@shared/store/toastStore'

function GeneralSection({ settings, onSettingChange }) {
  const { t } = useTranslation()
  const [autoStartLoading, setAutoStartLoading] = useState(false)

  const historyLimitOptions = [
    { value: 50, label: `50 ${t('settings.general.items')}` },
    { value: 100, label: `100 ${t('settings.general.items')}` },
    { value: 200, label: `200 ${t('settings.general.items')}` },
    { value: 500, label: `500 ${t('settings.general.items')}` },
    { value: 9999, label: `9999 ${t('settings.general.items')}` },
    { value: 999999, label: t('settings.general.unlimited') }
  ]

  const handleAutoStartChange = async (checked) => {
    setAutoStartLoading(true)
    try {
      await setAutoStart(checked)
      await onSettingChange('autoStart', checked)
      toast.success(checked ? '已启用开机自启动' : '已禁用开机自启动')
    } catch (error) {
      console.error('设置开机自启动失败:', error)
      toast.error('设置开机自启动失败')
    } finally {
      setAutoStartLoading(false)
    }
  }

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
          onChange={handleAutoStartChange}
          disabled={autoStartLoading}
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


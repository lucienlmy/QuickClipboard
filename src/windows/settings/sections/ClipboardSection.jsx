import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'

function ClipboardSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

  const positionOptions = [
    { value: 'smart', label: t('settings.clipboard.positionSmart') },
    { value: 'remember', label: t('settings.clipboard.positionRemember') }
  ]

  return (
    <SettingsSection
      title={t('settings.clipboard.title')}
      description={t('settings.clipboard.description')}
    >
      <SettingItem
        label={t('settings.clipboard.monitor')}
        description={t('settings.clipboard.monitorDesc')}
      >
        <Toggle
          checked={settings.clipboardMonitor}
          onChange={(checked) => onSettingChange('clipboardMonitor', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.clipboard.saveImages')}
        description={t('settings.clipboard.saveImagesDesc')}
      >
        <Toggle
          checked={settings.saveImages}
          onChange={(checked) => onSettingChange('saveImages', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.clipboard.showImagePreview')}
        description={t('settings.clipboard.showImagePreviewDesc')}
      >
        <Toggle
          checked={settings.showImagePreview}
          onChange={(checked) => onSettingChange('showImagePreview', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.clipboard.autoScrollToTop')}
        description={t('settings.clipboard.autoScrollToTopDesc')}
      >
        <Toggle
          checked={settings.autoScrollToTopOnShow}
          onChange={(checked) => onSettingChange('autoScrollToTopOnShow', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.clipboard.windowPosition')}
        description={t('settings.clipboard.windowPositionDesc')}
      >
        <Select
          value={settings.windowPositionMode}
          onChange={(value) => onSettingChange('windowPositionMode', value)}
          options={positionOptions}
        />
      </SettingItem>
    </SettingsSection>
  )
}

export default ClipboardSection


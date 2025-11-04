import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'
import FileInput from '../components/FileInput'

function PreviewSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

  const itemsCountOptions = [
    { value: 3, label: '3 ' + t('settings.preview.items') },
    { value: 5, label: '5 ' + t('settings.preview.items') },
    { value: 7, label: '7 ' + t('settings.preview.items') },
    { value: 9, label: '9 ' + t('settings.preview.items') }
  ]

  return (
    <SettingsSection
      title={t('settings.preview.title')}
      description={t('settings.preview.description')}
    >
      <SettingItem
        label={t('settings.preview.enabled')}
        description={t('settings.preview.enabledDesc')}
      >
        <Toggle
          checked={settings.previewEnabled}
          onChange={(checked) => onSettingChange('previewEnabled', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.preview.itemsCount')}
        description={t('settings.preview.itemsCountDesc')}
      >
        <Select
          value={settings.previewItemsCount || 5}
          onChange={(value) => onSettingChange('previewItemsCount', parseInt(value))}
          options={itemsCountOptions}
          className="w-40"
        />
      </SettingItem>

      <SettingItem
        label={t('settings.preview.autoPaste')}
        description={t('settings.preview.autoPasteDesc')}
      >
        <Toggle
          checked={settings.previewAutoPaste}
          onChange={(checked) => onSettingChange('previewAutoPaste', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.preview.scrollSound')}
        description={t('settings.preview.scrollSoundDesc')}
      >
        <Toggle
          checked={settings.previewScrollSound}
          onChange={(checked) => onSettingChange('previewScrollSound', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.preview.scrollSoundFile')}
        description={t('settings.preview.scrollSoundFileDesc')}
      >
        <FileInput
          value={settings.previewScrollSoundPath || ''}
          onChange={(value) => onSettingChange('previewScrollSoundPath', value)}
          onTest={() => {}}
          onReset={() => onSettingChange('previewScrollSoundPath', '')}
          placeholder={t('settings.sound.selectFile')}
        />
      </SettingItem>
    </SettingsSection>
  )
}

export default PreviewSection

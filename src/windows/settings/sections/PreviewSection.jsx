import { useTranslation } from 'react-i18next'
import { playScrollSound } from '@shared/api'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Select from '@shared/components/ui/Select'
import FileInput from '../components/FileInput'

function PreviewSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

  const handlePlayScrollSound = async () => {
    try {
      await playScrollSound()
    } catch (error) {
      console.error('播放滚动音效失败:', error)
    }
  }

  const itemsCountOptions = [
    { value: 3, label: '3 ' + t('settings.quickpaste.items') },
    { value: 5, label: '5 ' + t('settings.quickpaste.items') },
    { value: 7, label: '7 ' + t('settings.quickpaste.items') },
    { value: 9, label: '9 ' + t('settings.quickpaste.items') }
  ]

  return (
    <SettingsSection
      title={t('settings.quickpaste.title')}
      description={t('settings.quickpaste.description')}
    >
      <SettingItem
        label={t('settings.quickpaste.enabled')}
        description={t('settings.quickpaste.enabledDesc')}
      >
        <Toggle
          checked={settings.quickpasteEnabled}
          onChange={(checked) => onSettingChange('quickpasteEnabled', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.quickpaste.itemsCount')}
        description={t('settings.quickpaste.itemsCountDesc')}
      >
        <Select
          value={settings.quickpasteItemsCount || 5}
          onChange={(value) => onSettingChange('quickpasteItemsCount', parseInt(value))}
          options={itemsCountOptions}
          className="w-40"
        />
      </SettingItem>

      <SettingItem
        label={t('settings.quickpaste.autoPaste')}
        description={t('settings.quickpaste.autoPasteDesc')}
      >
        <Toggle
          checked={settings.quickpasteAutoPaste}
          onChange={(checked) => onSettingChange('quickpasteAutoPaste', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.quickpaste.scrollSound')}
        description={t('settings.quickpaste.scrollSoundDesc')}
      >
        <Toggle
          checked={settings.quickpasteScrollSound}
          onChange={(checked) => onSettingChange('quickpasteScrollSound', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.quickpaste.scrollSoundFile')}
        description={t('settings.quickpaste.scrollSoundFileDesc')}
      >
        <FileInput
          value={settings.quickpasteScrollSoundPath || ''}
          onChange={(value) => onSettingChange('quickpasteScrollSoundPath', value)}
          onTest={handlePlayScrollSound}
          onReset={() => onSettingChange('quickpasteScrollSoundPath', '')}
          placeholder={t('settings.sound.selectFile')}
        />
      </SettingItem>
    </SettingsSection>
  )
}

export default PreviewSection

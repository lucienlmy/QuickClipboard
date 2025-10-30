import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'

function SoundSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t('settings.sound.title')}
      description={t('settings.sound.description')}
    >
      <SettingItem
        label={t('settings.sound.enable')}
        description={t('settings.sound.enableDesc')}
      >
        <Toggle
          checked={settings.soundEnabled}
          onChange={(checked) => onSettingChange('soundEnabled', checked)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.sound.volume')}
        description={t('settings.sound.volumeDesc')}
      >
        <div className="flex items-center gap-3 min-w-[200px]">
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={settings.soundVolume}
            onChange={(e) => onSettingChange('soundVolume', parseInt(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
            {settings.soundVolume}%
          </span>
        </div>
      </SettingItem>
    </SettingsSection>
  )
}

export default SoundSection


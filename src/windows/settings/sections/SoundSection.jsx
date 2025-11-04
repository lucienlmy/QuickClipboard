import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import Slider from '@shared/components/ui/Slider'
import FileInput from '../components/FileInput'
import Button from '@shared/components/ui/Button'
import { IconTrash } from '@tabler/icons-react'

function SoundSection({ settings, onSettingChange }) {
  const { t } = useTranslation()

  const handleClearCache = async () => {
  }

  return (
    <>
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
          <Slider
            value={settings.soundVolume || 50}
            onChange={(value) => onSettingChange('soundVolume', value)}
            min={0}
            max={100}
            step={5}
            unit="%"
            className="w-64"
          />
        </SettingItem>

        <SettingItem
          label={t('settings.sound.copySound')}
          description={t('settings.sound.copySoundDesc')}
        >
          <FileInput
            value={settings.copySoundPath || ''}
            onChange={(value) => onSettingChange('copySoundPath', value)}
            onTest={() => {/* 播放音效 */}}
            onReset={() => onSettingChange('copySoundPath', '')}
            placeholder={t('settings.sound.selectFile')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.sound.pasteSound')}
          description={t('settings.sound.pasteSoundDesc')}
        >
          <FileInput
            value={settings.pasteSoundPath || ''}
            onChange={(value) => onSettingChange('pasteSoundPath', value)}
            onTest={() => {/* 播放音效 */}}
            onReset={() => onSettingChange('pasteSoundPath', '')}
            placeholder={t('settings.sound.selectFile')}
          />
        </SettingItem>

        <SettingItem
          label={t('settings.sound.clearCache')}
          description={t('settings.sound.clearCacheDesc')}
        >
          <Button
            onClick={handleClearCache}
            variant="secondary"
            icon={<IconTrash />}
          >
            {t('settings.common.clear')}
          </Button>
        </SettingItem>
      </SettingsSection>
    </>
  )
}

export default SoundSection

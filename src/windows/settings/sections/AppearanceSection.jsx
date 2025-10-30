import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'

function AppearanceSection({ settings, onSettingChange }) {
  const { t } = useTranslation()
  const { theme } = useSnapshot(settingsStore)

  const themeOptions = [
    { 
      id: 'auto', 
      label: t('settings.appearance.themeAuto'),
      preview: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    { 
      id: 'light', 
      label: t('settings.appearance.themeLight'),
      preview: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
    },
    { 
      id: 'dark', 
      label: t('settings.appearance.themeDark'),
      preview: 'linear-gradient(135deg, #2c3e50 0%, #000000 100%)'
    },
    { 
      id: 'background', 
      label: t('settings.appearance.themeBackground'),
      preview: 'linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)'
    }
  ]

  return (
    <SettingsSection
      title={t('settings.appearance.title')}
      description={t('settings.appearance.description')}
    >
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-white mb-3">
            {t('settings.appearance.themeSelect')}
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            {t('settings.appearance.themeSelectDesc')}
          </p>
          
          <div className="grid grid-cols-4 gap-3">
            {themeOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => settingsStore.setTheme(option.id)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  theme === option.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div 
                  className="w-full h-16 rounded-md shadow-sm"
                  style={{ background: option.preview }}
                />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <SettingItem
          label={t('settings.appearance.clipboardAnimation')}
          description={t('settings.appearance.clipboardAnimationDesc')}
        >
          <Toggle
            checked={settings.clipboardAnimationEnabled}
            onChange={(checked) => onSettingChange('clipboardAnimationEnabled', checked)}
          />
        </SettingItem>
      </div>
    </SettingsSection>
  )
}

export default AppearanceSection


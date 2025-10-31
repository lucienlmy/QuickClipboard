import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { open } from '@tauri-apps/plugin-dialog'
import { settingsStore } from '@shared/store/settingsStore'
import { toast } from '@shared/store/toastStore'
import SettingsSection from '../components/SettingsSection'
import SettingItem from '../components/SettingItem'
import Toggle from '@shared/components/ui/Toggle'
import { IconPhoto, IconX } from '@tabler/icons-react'

function AppearanceSection({ settings, onSettingChange }) {
  const { t } = useTranslation()
  const { theme, darkThemeStyle, backgroundImagePath } = useSnapshot(settingsStore)

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

  const handleSelectBackgroundImage = async () => {
    try {
      const selected = await open({
        title: t('settings.appearance.selectBackgroundImage'),
        multiple: false,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']
          }
        ]
      })

      if (selected) {
        await onSettingChange('backgroundImagePath', selected)
        toast.success(t('settings.appearance.backgroundImageSet'))
      }
    } catch (error) {
      console.error('Failed to select background image:', error)
      toast.error(t('settings.appearance.backgroundImageError'))
    }
  }

  const handleClearBackgroundImage = async () => {
    try {
      await onSettingChange('backgroundImagePath', '')
      toast.success(t('settings.appearance.backgroundImageCleared'))
    } catch (error) {
      console.error('Failed to clear background image:', error)
    }
  }

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

        {(theme === 'dark' || theme === 'auto') && (
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-3">
              {t('settings.appearance.darkThemeStyle') || '暗色风格'}
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {t('settings.appearance.darkThemeStyleDesc') || '选择暗色主题的显示风格'}
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onSettingChange('darkThemeStyle', 'modern')}
                className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all ${
                  darkThemeStyle === 'modern'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="w-full">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    {t('settings.appearance.darkThemeModern') || '现代风格'}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {t('settings.appearance.darkThemeModernDesc') || '色彩丰富的现代暗色主题'}
                  </div>
                </div>
              </button>

              <button
                onClick={() => onSettingChange('darkThemeStyle', 'classic')}
                className={`flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all ${
                  darkThemeStyle === 'classic'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="w-full">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    {t('settings.appearance.darkThemeClassic') || '经典风格'}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {t('settings.appearance.darkThemeClassicDesc') || '低调优雅的灰色暗色主题'}
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {theme === 'background' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              {t('settings.appearance.backgroundImage')}
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('settings.appearance.backgroundImageDesc')}
            </p>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectBackgroundImage}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                <IconPhoto size={18} />
                {backgroundImagePath ? t('settings.appearance.changeBackgroundImage') : t('settings.appearance.selectBackgroundImage')}
              </button>

              {backgroundImagePath && (
                <button
                  onClick={handleClearBackgroundImage}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  <IconX size={18} />
                  {t('settings.appearance.clearBackgroundImage')}
                </button>
              )}
            </div>

            {backgroundImagePath && (
              <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {t('settings.appearance.currentImage')}: {backgroundImagePath}
              </div>
            )}
          </div>
        )}

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


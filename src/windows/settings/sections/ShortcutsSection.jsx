import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'

function ShortcutsSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t('settings.shortcuts.title')}
      description={t('settings.shortcuts.description')}
    >
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        {t('settings.shortcuts.globalDesc')}
      </div>
    </SettingsSection>
  )
}

export default ShortcutsSection


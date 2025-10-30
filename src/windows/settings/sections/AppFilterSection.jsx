import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'

function AppFilterSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t('settings.sections.appFilter')}
      description="智能控制程序在不同应用中的行为"
    >
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        应用过滤功能开发中...
      </div>
    </SettingsSection>
  )
}

export default AppFilterSection


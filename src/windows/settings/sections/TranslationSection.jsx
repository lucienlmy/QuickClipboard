import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'

function TranslationSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t('settings.sections.translation')}
      description="配置自动翻译功能和相关选项"
    >
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        翻译功能开发中...
      </div>
    </SettingsSection>
  )
}

export default TranslationSection


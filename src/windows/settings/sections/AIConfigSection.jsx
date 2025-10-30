import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'

function AIConfigSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t('settings.sections.aiConfig')}
      description="配置AI服务的基本参数"
    >
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        AI配置功能开发中...
      </div>
    </SettingsSection>
  )
}

export default AIConfigSection


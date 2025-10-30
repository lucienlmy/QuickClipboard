import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'

function PreviewSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t('settings.sections.preview')}
      description="配置快速预览窗口的功能和外观"
    >
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        预览窗口设置开发中...
      </div>
    </SettingsSection>
  )
}

export default PreviewSection


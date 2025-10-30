import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'

function ScreenshotSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t('settings.sections.screenshot')}
      description="配置截屏功能和快捷键"
    >
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        截屏设置开发中...
      </div>
    </SettingsSection>
  )
}

export default ScreenshotSection


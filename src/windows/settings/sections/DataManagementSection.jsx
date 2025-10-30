import { useTranslation } from 'react-i18next'
import SettingsSection from '../components/SettingsSection'

function DataManagementSection() {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t('settings.sections.dataManagement')}
      description="导入导出应用数据，备份和恢复"
    >
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        数据管理功能开发中...
      </div>
    </SettingsSection>
  )
}

export default DataManagementSection


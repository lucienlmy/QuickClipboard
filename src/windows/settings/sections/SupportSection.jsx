import { useTranslation } from 'react-i18next'
import { IconBrandGithub, IconBrandBilibili, IconBrandWechat } from '@tabler/icons-react'
import SettingsSection from '../components/SettingsSection'
import Button from '@shared/components/ui/Button'

function SupportSection() {
  const { t } = useTranslation()

  const handleOpenGitHub = () => {
    window.open('https://github.com/mosheng1/QuickClipboard', '_blank')
  }

  const handleOpenBilibili = () => {
    window.open('https://space.bilibili.com/438982697', '_blank')
  }

  return (
    <SettingsSection
      title={t('settings.support.title')}
      description={t('settings.support.description')}
    >
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            💝 {t('settings.support.thankYou')}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {t('settings.support.intro')}
          </p>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-center gap-2">
              <span className="text-yellow-500">⭐</span>
              {t('settings.support.star')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-red-500">🐛</span>
              {t('settings.support.feedback')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-blue-500">📢</span>
              {t('settings.support.share')}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-orange-500">☕</span>
              {t('settings.support.donate')}
            </li>
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            🔗 {t('settings.support.followAuthor')}
          </h3>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              icon={<IconBrandGithub size={20} />}
              onClick={handleOpenGitHub}
            >
              GitHub
            </Button>
            <Button
              variant="secondary"
              icon={<IconBrandBilibili size={20} />}
              onClick={handleOpenBilibili}
            >
              {t('settings.support.bilibili')}
            </Button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            ☕ {t('settings.support.appreciateTitle')}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {t('settings.support.appreciateDesc')}
          </p>
          <div className="flex justify-center">
            <div className="text-center">
              <div className="w-48 h-48 bg-gray-100 dark:bg-gray-600 rounded-lg flex items-center justify-center mb-3">
                <IconBrandWechat size={64} className="text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings.support.wechatCode')}
              </p>
            </div>
          </div>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
            {t('settings.support.thankSupport')}
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}

export default SupportSection


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
      title={t('settings.sections.support')}
      description="如果这个小工具对您有帮助，欢迎支持作者继续开发"
    >
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            💝 感谢您的使用
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            QuickClipboard 是一个开源的剪贴板管理工具，致力于提升您的工作效率。
            如果这个工具对您有帮助，您可以通过以下方式支持作者：
          </p>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-center gap-2">
              <span className="text-yellow-500">⭐</span>
              给项目点个 Star
            </li>
            <li className="flex items-center gap-2">
              <span className="text-red-500">🐛</span>
              反馈 Bug 和建议
            </li>
            <li className="flex items-center gap-2">
              <span className="text-blue-500">📢</span>
              推荐给朋友使用
            </li>
            <li className="flex items-center gap-2">
              <span className="text-orange-500">☕</span>
              请作者喝杯咖啡
            </li>
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            🔗 关注作者
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
              哔哩哔哩
            </Button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            ☕ 赞赏支持
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            如果这个工具让您的工作更高效，欢迎请作者喝杯咖啡！
          </p>
          <div className="flex justify-center">
            <div className="text-center">
              <div className="w-48 h-48 bg-gray-100 dark:bg-gray-600 rounded-lg flex items-center justify-center mb-3">
                <IconBrandWechat size={64} className="text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                微信赞赏码
              </p>
            </div>
          </div>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
            您的支持是作者持续开发的动力！❤️
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}

export default SupportSection


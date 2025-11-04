import { useTranslation } from 'react-i18next'
import {
  IconSettings,
  IconPalette,
  IconKeyboard,
  IconClipboard,
  IconBrain,
  IconLanguage,
  IconEye,
  IconCamera,
  IconVolume,
  IconFilter,
  IconDatabase,
  IconHeart,
  IconInfoCircle
} from '@tabler/icons-react'

const navigationItems = [
  { id: 'general', icon: IconSettings, labelKey: 'settings.sections.general' },
  { id: 'appearance', icon: IconPalette, labelKey: 'settings.sections.appearance' },
  { id: 'shortcuts', icon: IconKeyboard, labelKey: 'settings.sections.shortcuts' },
  { id: 'clipboard', icon: IconClipboard, labelKey: 'settings.sections.clipboard' },
  { id: 'aiConfig', icon: IconBrain, labelKey: 'settings.sections.aiConfig' },
  { id: 'translation', icon: IconLanguage, labelKey: 'settings.sections.translation' },
  { id: 'preview', icon: IconEye, labelKey: 'settings.sections.preview' },
  { id: 'screenshot', icon: IconCamera, labelKey: 'settings.sections.screenshot' },
  { id: 'sound', icon: IconVolume, labelKey: 'settings.sections.sound' },
  { id: 'appFilter', icon: IconFilter, labelKey: 'settings.sections.appFilter' },
  { id: 'dataManagement', icon: IconDatabase, labelKey: 'settings.sections.dataManagement' },
  { id: 'support', icon: IconHeart, labelKey: 'settings.sections.support' },
  { id: 'about', icon: IconInfoCircle, labelKey: 'settings.sections.about' }
]

function SettingsSidebar({ activeSection, onSectionChange }) {
  const { t } = useTranslation()

  return (
    <aside className="settings-sidebar w-56 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
      <nav className="p-3 space-y-0.5">
        {navigationItems.map(({ id, icon: Icon, labelKey }, index) => (
          <button
            key={id}
            onClick={() => onSectionChange(id)}
            className={`
              group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium 
              transition-all duration-200 
              focus:outline-none active:scale-[0.98]
              animate-slide-in-left-fast
              ${
                activeSection === id
                  ? 'bg-blue-500 text-white shadow-md scale-[1.02]'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/50 hover:shadow-sm hover:scale-[1.01] hover:translate-x-0.5'
              }
            `}
            style={{
              animationDelay: `${index * 25}ms`,
              animationFillMode: 'backwards'
            }}
          >
            <Icon 
              size={18} 
              strokeWidth={2}
              className={`
                transition-transform duration-200
                ${activeSection === id ? 'scale-110' : 'group-hover:scale-110 group-hover:rotate-3'}
              `}
            />
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              {t(labelKey)}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default SettingsSidebar


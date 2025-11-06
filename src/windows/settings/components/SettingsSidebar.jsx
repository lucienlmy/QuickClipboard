import { useTranslation } from 'react-i18next'
import SidebarButton from './SidebarButton'
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
  // { id: 'aiConfig', icon: IconBrain, labelKey: 'settings.sections.aiConfig' },
  // { id: 'translation', icon: IconLanguage, labelKey: 'settings.sections.translation' },
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
    <aside className="settings-sidebar w-56 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700 overflow-y-auto transition-colors duration-500">
      <nav className="p-3 space-y-0.5">
        {navigationItems.map(({ id, icon, labelKey }, index) => (
          <SidebarButton
            key={id}
            id={id}
            icon={icon}
            label={t(labelKey)}
            isActive={activeSection === id}
            onClick={onSectionChange}
            index={index}
          />
        ))}
      </nav>
    </aside>
  )
}

export default SettingsSidebar

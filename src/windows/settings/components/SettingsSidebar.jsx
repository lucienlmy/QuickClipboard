import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import { useTranslation } from 'react-i18next';
import SidebarButton from './SidebarButton';
export const navigationItems = [{
  id: 'general',
  icon: "ti ti-settings",
  labelKey: 'settings.sections.general'
}, {
  id: 'appearance',
  icon: "ti ti-palette",
  labelKey: 'settings.sections.appearance'
}, {
  id: 'shortcuts',
  icon: "ti ti-keyboard",
  labelKey: 'settings.sections.shortcuts'
}, {
  id: 'clipboard',
  icon: "ti ti-clipboard",
  labelKey: 'settings.sections.clipboard'
},
// { id: 'aiConfig', icon:"ti ti-brain", labelKey: 'settings.sections.aiConfig' },
// { id: 'translation', icon:"ti ti-language", labelKey: 'settings.sections.translation' },
{
  id: 'quickpaste',
  icon: "ti ti-clipboard-check",
  labelKey: 'settings.sections.quickpaste'
}, {
  id: 'screenshot',
  icon: "ti ti-camera",
  labelKey: 'settings.sections.screenshot'
}, {
  id: 'sound',
  icon: "ti ti-volume",
  labelKey: 'settings.sections.sound'
}, {
  id: 'appFilter',
  icon: "ti ti-filter",
  labelKey: 'settings.sections.appFilter'
}, {
  id: 'dataManagement',
  icon: "ti ti-database",
  labelKey: 'settings.sections.dataManagement'
}, {
  id: 'about',
  icon: "ti ti-info-circle",
  labelKey: 'settings.sections.about'
}];
function SettingsSidebar({
  activeSection,
  onSectionChange
}) {
  const {
    t
  } = useTranslation();
  return <aside className="settings-sidebar w-56 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 border-r border-gray-200 dark:border-gray-700 overflow-y-auto transition-colors duration-500">
      <nav className="p-3 space-y-0.5">
        {navigationItems.map(({
        id,
        icon,
        labelKey
      }, index) => <SidebarButton key={id} id={id} icon={icon} label={t(labelKey)} isActive={activeSection === id} onClick={onSectionChange} index={index} />)}
      </nav>
    </aside>;
}
export default SettingsSidebar;
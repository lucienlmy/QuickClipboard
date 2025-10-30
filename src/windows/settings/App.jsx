import { useState } from 'react'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'
import SettingsHeader from './components/SettingsHeader'
import SettingsSidebar from './components/SettingsSidebar'
import GeneralSection from './sections/GeneralSection'
import AppearanceSection from './sections/AppearanceSection'
import ShortcutsSection from './sections/ShortcutsSection'
import ClipboardSection from './sections/ClipboardSection'
import AIConfigSection from './sections/AIConfigSection'
import TranslationSection from './sections/TranslationSection'
import PreviewSection from './sections/PreviewSection'
import ScreenshotSection from './sections/ScreenshotSection'
import SoundSection from './sections/SoundSection'
import AppFilterSection from './sections/AppFilterSection'
import DataManagementSection from './sections/DataManagementSection'
import SupportSection from './sections/SupportSection'
import AboutSection from './sections/AboutSection'
import ToastContainer from '@shared/components/common/ToastContainer'

function App() {
  const snap = useSnapshot(settingsStore)
  const [activeSection, setActiveSection] = useState('general')


  const handleSettingChange = async (key, value) => {
    await settingsStore.saveSetting(key, value)
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSection settings={snap} onSettingChange={handleSettingChange} />
      case 'appearance':
        return <AppearanceSection settings={snap} onSettingChange={handleSettingChange} />
      case 'shortcuts':
        return <ShortcutsSection />
      case 'clipboard':
        return <ClipboardSection settings={snap} onSettingChange={handleSettingChange} />
      case 'aiConfig':
        return <AIConfigSection />
      case 'translation':
        return <TranslationSection />
      case 'preview':
        return <PreviewSection />
      case 'screenshot':
        return <ScreenshotSection />
      case 'sound':
        return <SoundSection settings={snap} onSettingChange={handleSettingChange} />
      case 'appFilter':
        return <AppFilterSection />
      case 'dataManagement':
        return <DataManagementSection />
      case 'support':
        return <SupportSection />
      case 'about':
        return <AboutSection />
      default:
        return <GeneralSection settings={snap} onSettingChange={handleSettingChange} />
    }
  }

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${snap.theme === 'dark' ? 'dark bg-gray-900' : 'bg-white'}`}>
      <SettingsHeader />
      
      <div className="flex-1 flex overflow-hidden">
        <SettingsSidebar 
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
        
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
          {renderSection()}
        </main>
      </div>

      <ToastContainer />
    </div>
  )
}

export default App


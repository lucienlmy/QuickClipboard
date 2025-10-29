import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'
import TitleBar from './components/TitleBar'
import TabNavigation from './components/TabNavigation'
import ClipboardTab from './components/ClipboardTab'
import QuickTextsTab from './components/QuickTextsTab'
import FooterBar from './components/FooterBar'

function App() {
  const { t } = useTranslation()
  const { theme } = useSnapshot(settingsStore)
  const [activeTab, setActiveTab] = useState('clipboard')
  const [contentFilter, setContentFilter] = useState('all')

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${theme === 'dark' ? 'dark bg-gray-900' : 'bg-white'}`} style={{ borderRadius: '8px' }}>
      <TitleBar />
      
      <TabNavigation 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        contentFilter={contentFilter}
        onFilterChange={setContentFilter}
      />
      
      <div className="flex-1 overflow-hidden">
        {activeTab === 'clipboard' && (
          <ClipboardTab filter={contentFilter} />
        )}
        {activeTab === 'quick-texts' && (
          <QuickTextsTab />
        )}
      </div>

      <FooterBar />
    </div>
  )
}

export default App

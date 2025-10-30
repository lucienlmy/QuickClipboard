import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'
import { groupsStore } from '@shared/store/groupsStore'
import TitleBar from './components/TitleBar'
import TabNavigation from './components/TabNavigation'
import ClipboardTab from './components/ClipboardTab'
import FavoritesTab from './components/FavoritesTab'
import FooterBar from './components/FooterBar'
import GroupsPopup from './components/GroupsPopup'

function App() {
  const { t } = useTranslation()
  const { theme } = useSnapshot(settingsStore)
  const [activeTab, setActiveTab] = useState('clipboard')
  const [contentFilter, setContentFilter] = useState('all')

  // 处理分组切换
  const handleGroupChange = async (groupName) => {
    groupsStore.setCurrentGroup(groupName)
    // 重新加载收藏列表
    const { loadFavorites } = await import('@shared/store/favoritesStore')
    await loadFavorites()
  }

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${theme === 'dark' ? 'dark bg-gray-900' : 'bg-white'}`} style={{ borderRadius: '8px' }}>
      <TitleBar />
      
      <TabNavigation 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        contentFilter={contentFilter}
        onFilterChange={setContentFilter}
      />
      
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'clipboard' && (
          <ClipboardTab contentFilter={contentFilter} />
        )}
        {activeTab === 'favorites' && (
          <FavoritesTab contentFilter={contentFilter} />
        )}
      </div>

      <FooterBar>
        <GroupsPopup 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onGroupChange={handleGroupChange} 
        />
      </FooterBar>
    </div>
  )
}

export default App

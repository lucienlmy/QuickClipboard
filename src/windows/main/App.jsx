import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'
import { groupsStore } from '@shared/store/groupsStore'
import { useWindowDrag } from '@shared/hooks/useWindowDrag'
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme'
import { useSettingsSync } from '@shared/hooks/useSettingsSync'
import { applyBackgroundImage, clearBackgroundImage } from '@shared/utils/backgroundManager'
import TitleBar from './components/TitleBar'
import TabNavigation from './components/TabNavigation'
import ClipboardTab from './components/ClipboardTab'
import FavoritesTab from './components/FavoritesTab'
import FooterBar from './components/FooterBar'
import GroupsPopup from './components/GroupsPopup'
import ToastContainer from '@shared/components/common/ToastContainer'

function App() {
  const { t } = useTranslation()
  const { theme, backgroundImagePath } = useSnapshot(settingsStore)
  const { effectiveTheme, isDark, isBackground } = useTheme()
  const [activeTab, setActiveTab] = useState('clipboard')
  const [contentFilter, setContentFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  
  // 监听设置变更事件（跨窗口同步）
  useSettingsSync()
  
  // 主内容区域拖拽，排除所有交互元素和列表项
  const contentDragRef = useWindowDrag({
    excludeSelectors: ['[data-no-drag]', 'button', '[role="button"]', 'a', 'input', 'textarea'],
    allowChildren: true
  })

  // 应用主题到body
  useEffect(() => {
    applyThemeToBody(theme, 'main')
  }, [theme, effectiveTheme])

  // 应用背景图片（仅在背景主题时）
  useEffect(() => {
    if (isBackground && backgroundImagePath) {
      applyBackgroundImage({
        containerSelector: '.main-container',
        backgroundImagePath,
        windowName: 'main'
      })
    } else {
      clearBackgroundImage('.main-container')
    }
  }, [isBackground, backgroundImagePath])

  // 处理分组切换
  const handleGroupChange = async (groupName) => {
    groupsStore.setCurrentGroup(groupName)
    // 重新加载收藏列表
    const { loadFavorites } = await import('@shared/store/favoritesStore')
    await loadFavorites()
  }

  const containerClasses = `
    main-container 
    h-screen w-screen 
    flex flex-col 
    overflow-hidden 
    ${isDark && !isBackground ? 'dark bg-gray-900' : ''}
    ${!isDark && !isBackground ? 'bg-white' : ''}
  `.trim().replace(/\s+/g, ' ')

  return (
    <div 
      className={containerClasses} 
      style={{ 
        borderRadius: '8px'
      }}
    >
      <TitleBar 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('search.placeholder')}
      />
      
      <TabNavigation 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        contentFilter={contentFilter}
        onFilterChange={setContentFilter}
      />
      
      <div ref={contentDragRef} className="flex-1 overflow-hidden relative">
        {activeTab === 'clipboard' && (
          <ClipboardTab contentFilter={contentFilter} searchQuery={searchQuery} />
        )}
        {activeTab === 'favorites' && (
          <FavoritesTab contentFilter={contentFilter} searchQuery={searchQuery} />
        )}
      </div>

      <FooterBar>
        <GroupsPopup 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onGroupChange={handleGroupChange} 
        />
      </FooterBar>

      <ToastContainer />
    </div>
  )
}

export default App

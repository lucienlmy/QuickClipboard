import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@shared/store/settingsStore'
import { groupsStore } from '@shared/store/groupsStore'
import { navigationStore } from '@shared/store/navigationStore'
import { toolsStore } from '@shared/store/toolsStore'
import { useWindowDrag } from '@shared/hooks/useWindowDrag'
import { useTheme, applyThemeToBody } from '@shared/hooks/useTheme'
import { useSettingsSync } from '@shared/hooks/useSettingsSync'
import { useNavigationKeyboard } from '@shared/hooks/useNavigationKeyboard'
import { useWindowAnimation } from '@shared/hooks/useWindowAnimation'
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
  const { theme, darkThemeStyle, backgroundImagePath } = useSnapshot(settingsStore)
  const { effectiveTheme, isDark, isBackground } = useTheme()
  const [activeTab, setActiveTab] = useState('clipboard')
  const [contentFilter, setContentFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const clipboardTabRef = useRef(null)
  const favoritesTabRef = useRef(null)
  const groupsPopupRef = useRef(null)
  const searchRef = useRef(null)
  
  // 监听设置变更事件（跨窗口同步）
  useSettingsSync()
  
  // 窗口动画
  useWindowAnimation()
  
  // 同步当前标签页到导航store
  useEffect(() => {
    navigationStore.setActiveTab(activeTab)
  }, [activeTab])
  
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
    // 重置导航索引
    navigationStore.resetNavigation()
    // 重新加载收藏列表
    const { initFavorites } = await import('@shared/store/favoritesStore')
    await initFavorites(groupName)
  }
  
  // 导航键盘事件处理
  const handleNavigateUp = () => {
    if (activeTab === 'clipboard' && clipboardTabRef.current?.navigateUp) {
      clipboardTabRef.current.navigateUp()
    } else if (activeTab === 'favorites' && favoritesTabRef.current?.navigateUp) {
      favoritesTabRef.current.navigateUp()
    }
  }
  
  const handleNavigateDown = () => {
    if (activeTab === 'clipboard' && clipboardTabRef.current?.navigateDown) {
      clipboardTabRef.current.navigateDown()
    } else if (activeTab === 'favorites' && favoritesTabRef.current?.navigateDown) {
      favoritesTabRef.current.navigateDown()
    }
  }
  
  const handleExecuteItem = () => {
    if (activeTab === 'clipboard' && clipboardTabRef.current?.executeCurrentItem) {
      clipboardTabRef.current.executeCurrentItem()
    } else if (activeTab === 'favorites' && favoritesTabRef.current?.executeCurrentItem) {
      favoritesTabRef.current.executeCurrentItem()
    }
  }
  
  const handleTabLeft = () => {
    const tabs = ['clipboard', 'favorites']
    const currentIndex = tabs.indexOf(activeTab)
    const newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1
    setActiveTab(tabs[newIndex])
  }
  
  const handleTabRight = () => {
    const tabs = ['clipboard', 'favorites']
    const currentIndex = tabs.indexOf(activeTab)
    const newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1
    setActiveTab(tabs[newIndex])
  }
  
  const handleFocusSearch = () => {
    // 检查搜索框是否已聚焦
    const searchInput = document.querySelector('.titlebar-search input')
    const isSearchFocused = document.activeElement === searchInput
    
    if (isSearchFocused) {
      searchInput?.blur()
      navigationStore.resetNavigation()
    } else {
      if (searchRef.current?.focus) {
        searchRef.current.focus()
      }
    }
  }
  
  // 处理搜索框内的导航操作
  const handleSearchNavigate = (direction) => {
    if (direction === 'up') {
      handleNavigateUp()
    } else if (direction === 'down') {
      handleNavigateDown()
    } else if (direction === 'execute') {
      handleExecuteItem()
    }
  }
  
  // 固定/取消固定窗口
  const handleTogglePin = async () => {
    try {
      await toolsStore.handleToolClick('pin-button')
    } catch (error) {
      console.error('切换窗口固定状态失败:', error)
    }
  }
  
  // 切换到上一个分组
  const handlePreviousGroup = () => {
    if (activeTab !== 'favorites') {
      setActiveTab('favorites')
    }
    
    const groups = groupsStore.groups
    if (groups.length === 0) return
    
    const currentIndex = groups.findIndex(g => g.name === groupsStore.currentGroup)
    const prevIndex = currentIndex <= 0 ? groups.length - 1 : currentIndex - 1
    const prevGroup = groups[prevIndex]
    
    groupsStore.setCurrentGroup(prevGroup.name)
    handleGroupChange(prevGroup.name)
    
    if (groupsPopupRef.current?.showTemporarily) {
      groupsPopupRef.current.showTemporarily()
    }
  }
  
  // 切换到下一个分组
  const handleNextGroup = () => {
    if (activeTab !== 'favorites') {
      setActiveTab('favorites')
    }
    
    const groups = groupsStore.groups
    if (groups.length === 0) return
    
    const currentIndex = groups.findIndex(g => g.name === groupsStore.currentGroup)
    const nextIndex = currentIndex >= groups.length - 1 ? 0 : currentIndex + 1
    const nextGroup = groups[nextIndex]
    
    groupsStore.setCurrentGroup(nextGroup.name)
    handleGroupChange(nextGroup.name)
    
    if (groupsPopupRef.current?.showTemporarily) {
      groupsPopupRef.current.showTemporarily()
    }
  }
  
  // 设置全局键盘导航
  useNavigationKeyboard({
    onNavigateUp: handleNavigateUp,
    onNavigateDown: handleNavigateDown,
    onExecuteItem: handleExecuteItem,
    onTabLeft: handleTabLeft,
    onTabRight: handleTabRight,
    onFocusSearch: handleFocusSearch,
    onTogglePin: handleTogglePin,
    onPreviousGroup: handlePreviousGroup,
    onNextGroup: handleNextGroup,
    enabled: true
  })

  const outerContainerClasses = `
    h-screen w-screen 
    ${isDark && !isBackground ? 'dark' : ''}
  `.trim().replace(/\s+/g, ' ')

  const containerClasses = `
    main-container 
    h-full w-full
    flex flex-col 
    overflow-hidden
    ${isDark && !isBackground ? 'bg-gray-900' : ''}
    ${!isDark && !isBackground ? 'bg-white' : ''}
  `.trim().replace(/\s+/g, ' ')

  return (
    <div className={outerContainerClasses} style={{ padding: '4.5px' }}>
      <div 
        className={containerClasses} 
        style={{ 
          borderRadius: '8px',
          boxShadow: '0 0 5px 1px rgba(0, 0, 0, 0.3), 0 0 3px 0 rgba(0, 0, 0, 0.2)'
        }}
      >
      <TitleBar 
        ref={searchRef}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t('search.placeholder')}
        onNavigate={handleSearchNavigate}
      />
      
      <TabNavigation 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        contentFilter={contentFilter}
        onFilterChange={setContentFilter}
      />
      
      <div ref={contentDragRef} className="flex-1 overflow-hidden relative">
        {activeTab === 'clipboard' && (
          <ClipboardTab 
            ref={clipboardTabRef}
            contentFilter={contentFilter} 
            searchQuery={searchQuery} 
          />
        )}
        {activeTab === 'favorites' && (
          <FavoritesTab 
            ref={favoritesTabRef}
            contentFilter={contentFilter} 
            searchQuery={searchQuery} 
          />
        )}
      </div>

      <FooterBar>
        <GroupsPopup 
          ref={groupsPopupRef}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onGroupChange={handleGroupChange} 
        />
      </FooterBar>

      <ToastContainer />
      </div>
    </div>
  )
}

export default App

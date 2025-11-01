// 右键菜单工具函数
import { showContextMenuFromEvent, createMenuItem, createSeparator } from '@/plugins/context_menu/index.js'
import { openUrl } from '@tauri-apps/plugin-opener'
import i18n from '@shared/i18n'
import {
  addClipboardToFavorites,
  pinImageToScreen,
  saveImageFromClipboard,
  openFileWithDefaultProgram,
  openFileLocation,
  copyFilePaths,
  clearClipboardHistory,
  moveFavoriteToGroup,
  deleteFavorite
} from '@shared/api'

// 获取搜索引擎列表
function getSearchEngines() {
  return [
    { id: 'google', name: 'Google', favicon: 'https://www.google.com/favicon.ico', url: 'https://www.google.com/search?q=' },
    { id: 'bing', name: 'Bing', favicon: 'https://www.bing.com/favicon.ico', url: 'https://www.bing.com/search?q=' },
    { id: 'baidu', name: '百度', favicon: 'https://www.baidu.com/favicon.ico', url: 'https://www.baidu.com/s?wd=' }
  ]
}

// 获取当前搜索引擎
function getCurrentSearchEngine() {
  const engines = getSearchEngines()
  const savedEngineId = localStorage.getItem('current-search-engine')
  return engines.find(e => e.id === savedEngineId) || engines[0]
}

// 设置当前搜索引擎
function setCurrentSearchEngine(engineId) {
  localStorage.setItem('current-search-engine', engineId)
}

// 在浏览器中搜索文本
async function searchTextInBrowser(text, engineId = null) {
  try {
    const engine = engineId 
      ? getSearchEngines().find(e => e.id === engineId)
      : getCurrentSearchEngine()
    
    if (!engine) return
    
    const url = engine.url + encodeURIComponent(text)
    await openUrl(url)
    
    if (engineId) {
      setCurrentSearchEngine(engineId)
    }
  } catch (error) {
    console.error('搜索失败:', error)
  }
}

// 显示剪贴板项的右键菜单
export async function showClipboardItemContextMenu(event, item, index) {
  const menuItems = []
  const contentType = item.content_type || 'text'
  const plainText = typeof item.content === 'string' ? item.content.trim() : ''

  // 添加浏览器搜索选项（仅文本类型）
  if (plainText && (contentType === 'text' || contentType === 'rich_text')) {
    const searchEngines = getSearchEngines()
    const currentEngine = getCurrentSearchEngine()
    
    if (currentEngine && searchEngines.length > 0) {
      const searchMenuItem = createMenuItem(
        'search-current',
        i18n.t('contextMenu.searchWith', { engine: currentEngine.name }),
        { favicon: currentEngine.favicon }
      )
      
      // 添加子菜单
      searchMenuItem.children = searchEngines.map(engine =>
        createMenuItem(`search-${engine.id}`, engine.name, {
          favicon: engine.favicon,
          icon: engine.id === currentEngine.id ? 'ti ti-check' : undefined
        })
      )
      
      menuItems.push(searchMenuItem)
      menuItems.push(createSeparator())
    }
  }

  // 根据内容类型添加特有菜单项
  if (contentType === 'image') {
    // 图片类型菜单
    menuItems.push(
      createMenuItem('pin-image', i18n.t('contextMenu.pinToScreen'), { icon: 'ti ti-pin' }),
      createMenuItem('save-image', i18n.t('contextMenu.saveImage'), { icon: 'ti ti-download' })
    )
  } else if (contentType === 'file') {
    // 文件类型菜单
    menuItems.push(
      createMenuItem('open-file', i18n.t('contextMenu.openWithDefault'), { icon: 'ti ti-external-link' }),
      createMenuItem('open-location', i18n.t('contextMenu.openLocation'), { icon: 'ti ti-folder-open' }),
      createMenuItem('copy-path', i18n.t('contextMenu.copyPath'), { icon: 'ti ti-copy' })
    )
  } else if (contentType === 'text' || contentType === 'link' || contentType === 'rich_text') {
    // 文本、链接和富文本类型菜单
    menuItems.push(
      createMenuItem('edit-text', contentType === 'rich_text' ? i18n.t('contextMenu.editPlainText') : i18n.t('contextMenu.editText'), { icon: 'ti ti-edit' })
    )
  }

  // 添加分隔线（如果前面有菜单项）
  if (menuItems.length > 0 && menuItems[menuItems.length - 1].separator !== true) {
    menuItems.push(createSeparator())
  }

  // 获取分组列表用于"添加到收藏"子菜单
  const { groupsStore } = await import('@shared/store/groupsStore')
  const groups = groupsStore.groups || []
  
  
  const addToFavoritesItem = createMenuItem('add-to-favorites', i18n.t('contextMenu.addToFavorites'), { icon: 'ti ti-star' })
  
  // 添加分组子菜单
  if (groups.length > 0) {
    addToFavoritesItem.children = groups.map(group => {
      const menuId = `add-to-group-${group.name}`
      return createMenuItem(menuId, group.name, {
        icon: group.icon || 'ti ti-folder'
      })
    })
  }

  // 通用菜单项
  menuItems.push(
    addToFavoritesItem,
    createMenuItem('delete-item', i18n.t('contextMenu.deleteItem'), { icon: 'ti ti-trash' }),
    createSeparator(),
    createMenuItem('clear-all', i18n.t('contextMenu.clearAll'), { icon: 'ti ti-trash-x' })
  )

  // 显示菜单
  const result = await showContextMenuFromEvent(event, menuItems)

  // 处理菜单选择
  if (!result) return
  

  try {
    // 处理搜索
    if (result === 'search-current') {
      await searchTextInBrowser(plainText)
      return
    } else if (result.startsWith('search-')) {
      const engineId = result.substring(7)
      await searchTextInBrowser(plainText, engineId)
      return
    }
    
    // 处理添加到收藏（选择分组）
    if (result.startsWith('add-to-group-')) {
      const groupName = result.substring(13)
      try {
        await addClipboardToFavorites(item.id, groupName)
      } catch (error) {
        console.error('添加到收藏失败:', error)
      }
      return
    }
    
    // 如果点击了父菜单项"添加到收藏"（没有选择分组），默认添加到"全部"
    if (result === 'add-to-favorites') {
      try {
        await addClipboardToFavorites(item.id)
      } catch (error) {
        console.error('添加到收藏失败:', error)
      }
      return
    }
    
    switch (result) {
      case 'pin-image':
        await pinImageToScreen(item.id)
        break
      
      case 'save-image':
        await saveImageFromClipboard(item.id)
        break
      
      case 'open-file':
        await openFileWithDefaultProgram(item.id)
        break
      
      case 'open-location':
        await openFileLocation(item.id)
        break
      
      case 'copy-path':
        await copyFilePaths(item.id)
        break
      
      case 'edit-text':
        const { openEditorForClipboard } = await import('@shared/api/textEditor')
        await openEditorForClipboard(item, index)
        break
      
      case 'delete-item':
        const { deleteClipboardItem } = await import('@shared/store/clipboardStore')
        await deleteClipboardItem(item.id)
        break
      
      case 'clear-all':
        const { showConfirm } = await import('@shared/utils/dialog')
        const confirmed = await showConfirm(
          '确定要清空所有剪贴板历史记录吗？此操作不可撤销。',
          '确认清空'
        )
        if (confirmed) {
          await clearClipboardHistory()
          const { loadClipboardItems } = await import('@shared/store/clipboardStore')
          await loadClipboardItems()
        }
        break
    }
  } catch (error) {
    console.error('处理菜单操作失败:', error)
  }
}

// 显示收藏项的右键菜单
export async function showFavoriteItemContextMenu(event, item, index) {
  const menuItems = []
  const contentType = item.content_type || 'text'

  // 根据内容类型添加特有菜单项
  if (contentType === 'text' || contentType === 'rich_text') {
    menuItems.push(
      createMenuItem('edit-item', i18n.t('contextMenu.editText'), { icon: 'ti ti-edit' })
    )
  }

  // 添加分隔线
  if (menuItems.length > 0) {
    menuItems.push(createSeparator())
  }

  // 获取分组列表用于"移动到分组"子菜单
  const { groupsStore } = await import('@shared/store/groupsStore')
  const groups = groupsStore.groups || []
  
  const moveToGroupItem = createMenuItem('move-to-group', i18n.t('contextMenu.moveToGroup'), { icon: 'ti ti-folder' })
  
  // 添加分组子菜单（排除当前项已经所属的分组）
  if (groups.length > 0) {
    moveToGroupItem.children = groups
      .filter(group => group.name !== item.group_name)
      .map(group => {
        const menuId = `move-to-group-${group.name}`
        return createMenuItem(menuId, group.name, {
          icon: group.icon || 'ti ti-folder'
        })
      })
  }

  // 通用菜单项
  menuItems.push(
    moveToGroupItem,
    createSeparator(),
    createMenuItem('delete-item', i18n.t('contextMenu.delete'), { icon: 'ti ti-trash' })
  )

  // 显示菜单
  const result = await showContextMenuFromEvent(event, menuItems)

  // 处理菜单选择
  if (!result) return

  try {
    // 处理移动到分组
    if (result.startsWith('move-to-group-')) {
      const groupName = result.substring(14)
      await moveFavoriteToGroup(item.id, groupName)
      const { loadFavorites } = await import('@shared/store/favoritesStore')
      await loadFavorites()
      return
    }
    
    switch (result) {
      case 'edit-item':
        const { openEditorForFavorite } = await import('@shared/api/textEditor')
        await openEditorForFavorite(item)
        break
      
      case 'delete-item':
        const { showConfirm } = await import('@shared/utils/dialog')
        const confirmed = await showConfirm(
          '确定要删除此收藏项吗？',
          '确认删除'
        )
        if (confirmed) {
          await deleteFavorite(item.id)
          const { loadFavorites } = await import('@shared/store/favoritesStore')
          await loadFavorites()
        }
        break
    }
  } catch (error) {
    console.error('处理菜单操作失败:', error)
  }
}


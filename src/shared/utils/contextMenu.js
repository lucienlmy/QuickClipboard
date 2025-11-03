// 右键菜单工具函数
import { showContextMenuFromEvent, createMenuItem, createSeparator } from '@/plugins/context_menu/index.js'
import { openUrl } from '@tauri-apps/plugin-opener'
import i18n from '@shared/i18n'
import { extractAllLinks, normalizeUrl } from './linkUtils'
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

// 打开链接
async function openLink(url) {
  try {
    const normalizedUrl = normalizeUrl(url)
    await openUrl(normalizedUrl)
  } catch (error) {
    console.error('打开链接失败:', error)
  }
}

// 创建链接菜单项
function createLinkMenuItems(item) {
  const links = extractAllLinks({
    content: item.content,
    html_content: item.html_content
  })
  
  if (links.length === 0) return { menuItems: [], links }
  
  const menuItems = []
  
  if (links.length === 1) {
    menuItems.push(
      createMenuItem('open-link', i18n.t('contextMenu.openInBrowser'), { icon: 'ti ti-external-link' })
    )
  } else {
    const linkMenuItem = createMenuItem(
      'open-links',
      i18n.t('contextMenu.openLinks', { count: links.length }),
      { icon: 'ti ti-external-link' }
    )
    
    linkMenuItem.children = [
      ...links.map((link, idx) => {
        const displayText = link.length > 50 ? link.substring(0, 50) + '...' : link
        return createMenuItem(`open-link-${idx}`, displayText, { icon: 'ti ti-link' })
      }),
      createSeparator(),
      createMenuItem('open-all-links', i18n.t('contextMenu.openAll'), { icon: 'ti ti-external-link' })
    ]
    
    menuItems.push(linkMenuItem)
  }
  
  return { menuItems, links }
}

// 创建搜索菜单项
function createSearchMenuItems(plainText, contentType) {
  if (!plainText || contentType.includes('image') || contentType.includes('file')) {
    return []
  }
  
  const searchEngines = getSearchEngines()
  const currentEngine = getCurrentSearchEngine()
  
  if (!currentEngine || searchEngines.length === 0) {
    return []
  }
  
  const searchMenuItem = createMenuItem(
    'search-current',
    i18n.t('contextMenu.searchWith', { engine: currentEngine.name }),
    { favicon: currentEngine.favicon }
  )
  
  searchMenuItem.children = searchEngines.map(engine =>
    createMenuItem(`search-${engine.id}`, engine.name, {
      favicon: engine.favicon,
      icon: engine.id === currentEngine.id ? 'ti ti-check' : undefined
    })
  )
  
  return [searchMenuItem]
}

// 创建内容类型特定菜单项
function createContentTypeMenuItems(contentType) {
  if (contentType.includes('image')) {
    return [
      createMenuItem('pin-image', i18n.t('contextMenu.pinToScreen'), { icon: 'ti ti-pin' }),
      createMenuItem('save-image', i18n.t('contextMenu.saveImage'), { icon: 'ti ti-download' })
    ]
  }
  
  if (contentType.includes('file')) {
    return [
      createMenuItem('open-file', i18n.t('contextMenu.openWithDefault'), { icon: 'ti ti-external-link' }),
      createMenuItem('open-location', i18n.t('contextMenu.openLocation'), { icon: 'ti ti-folder-open' }),
      createMenuItem('copy-path', i18n.t('contextMenu.copyPath'), { icon: 'ti ti-copy' })
    ]
  }
  
  const isRichText = contentType.includes('rich_text')
  return [
    createMenuItem('edit-text', isRichText ? i18n.t('contextMenu.editPlainText') : i18n.t('contextMenu.editText'), { icon: 'ti ti-edit' })
  ]
}

// 处理链接相关操作
async function handleLinkActions(result, links) {
  if (result === 'open-link' && links.length === 1) {
    await openLink(links[0])
    return true
  }
  
  if (result.startsWith('open-link-')) {
    const linkIndex = parseInt(result.substring(10))
    if (linkIndex >= 0 && linkIndex < links.length) {
      await openLink(links[linkIndex])
    }
    return true
  }
  
  if (result === 'open-all-links') {
    for (const link of links) {
      await openLink(link)
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return true
  }
  
  return false
}

// 处理搜索相关操作
async function handleSearchActions(result, plainText) {
  if (result === 'search-current') {
    await searchTextInBrowser(plainText)
    return true
  }
  
  if (result.startsWith('search-')) {
    const engineId = result.substring(7)
    await searchTextInBrowser(plainText, engineId)
    return true
  }
  
  return false
}

// 显示剪贴板项的右键菜单
export async function showClipboardItemContextMenu(event, item, index) {
  const menuItems = []
  const contentType = item.content_type || 'text'
  const plainText = typeof item.content === 'string' ? item.content.trim() : ''

  const { menuItems: linkMenuItems, links } = createLinkMenuItems(item)
  if (linkMenuItems.length > 0) {
    menuItems.push(...linkMenuItems, createSeparator())
  }

  const searchMenuItems = createSearchMenuItems(plainText, contentType)
  if (searchMenuItems.length > 0) {
    menuItems.push(...searchMenuItems, createSeparator())
  }

  const contentMenuItems = createContentTypeMenuItems(contentType)
  if (contentMenuItems.length > 0) {
    menuItems.push(...contentMenuItems)
  }

  // 添加分隔线
  if (menuItems.length > 0 && !menuItems[menuItems.length - 1].separator) {
    menuItems.push(createSeparator())
  }

  // 添加"添加到收藏"菜单
  const { groupsStore } = await import('@shared/store/groupsStore')
  const groups = groupsStore.groups || []
  
  const addToFavoritesItem = createMenuItem('add-to-favorites', i18n.t('contextMenu.addToFavorites'), { icon: 'ti ti-star' })
  
  if (groups.length > 0) {
    addToFavoritesItem.children = groups.map(group => 
      createMenuItem(`add-to-group-${group.name}`, group.name, {
        icon: group.icon || 'ti ti-folder'
      })
    )
  }

  // 添加通用菜单项
  menuItems.push(
    addToFavoritesItem,
    createMenuItem('delete-item', i18n.t('contextMenu.deleteItem'), { icon: 'ti ti-trash' }),
    createSeparator(),
    createMenuItem('clear-all', i18n.t('contextMenu.clearAll'), { icon: 'ti ti-trash-x' })
  )

  // 显示菜单并处理结果
  const result = await showContextMenuFromEvent(event, menuItems)
  if (!result) return

  try {
    // 处理链接操作
    if (await handleLinkActions(result, links)) return
    
    // 处理搜索操作
    if (await handleSearchActions(result, plainText)) return
    
    // 处理添加到收藏
    if (result.startsWith('add-to-group-')) {
      const groupName = result.substring(13)
      await addClipboardToFavorites(item.id, groupName)
      return
    }
    
    if (result === 'add-to-favorites') {
      await addClipboardToFavorites(item.id)
      return
    }
    
    // 处理其他操作
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

  // 添加链接菜单
  const { menuItems: linkMenuItems, links } = createLinkMenuItems(item)
  if (linkMenuItems.length > 0) {
    menuItems.push(...linkMenuItems, createSeparator())
  }

  // 添加编辑菜单（仅文本类型）
  if (contentType === 'text' || contentType === 'rich_text') {
    menuItems.push(
      createMenuItem('edit-item', i18n.t('contextMenu.editText'), { icon: 'ti ti-edit' }),
      createSeparator()
    )
  }

  // 添加"移动到分组"菜单
  const { groupsStore } = await import('@shared/store/groupsStore')
  const groups = groupsStore.groups || []
  
  const moveToGroupItem = createMenuItem('move-to-group', i18n.t('contextMenu.moveToGroup'), { icon: 'ti ti-folder' })
  
  if (groups.length > 0) {
    moveToGroupItem.children = groups
      .filter(group => group.name !== item.group_name)
      .map(group => 
        createMenuItem(`move-to-group-${group.name}`, group.name, {
          icon: group.icon || 'ti ti-folder'
        })
      )
  }

  // 添加通用菜单项
  menuItems.push(
    moveToGroupItem,
    createSeparator(),
    createMenuItem('delete-item', i18n.t('contextMenu.delete'), { icon: 'ti ti-trash' })
  )

  const result = await showContextMenuFromEvent(event, menuItems)
  if (!result) return

  try {
    if (await handleLinkActions(result, links)) return
    
    // 处理移动到分组
    if (result.startsWith('move-to-group-')) {
      const groupName = result.substring(14)
      await moveFavoriteToGroup(item.id, groupName)
      const { refreshFavorites } = await import('@shared/store/favoritesStore')
      await refreshFavorites()
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
          const { refreshFavorites } = await import('@shared/store/favoritesStore')
          await refreshFavorites()
        }
        break
    }
  } catch (error) {
    console.error('处理菜单操作失败:', error)
  }
}

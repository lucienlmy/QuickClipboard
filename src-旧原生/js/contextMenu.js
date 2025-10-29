// 通用右键菜单模块 - 使用菜单窗口插件
import { openUrl } from '@tauri-apps/plugin-opener';
import { showNotification } from './notificationManager.js';
import { extractAllLinks } from './utils/linkUtils.js';
import { searchWithEngine, getSearchEngines, getCurrentSearchEngine, setCurrentSearchEngine } from './searchEngineManager.js';
import { showContextMenu as showMenuPlugin, createMenuItem as createPluginMenuItem, createSeparator as createPluginSeparator } from '../plugins/context_menu/index.js';
import { getCurrentSettings } from '../settings/js/settingsManager.js';

let menuRequestCounter = 0;
let activeMenuRequestId = 0;

// 在浏览器中搜索文本
async function searchTextInBrowser(text, engineId = null) {
  try {
    const url = searchWithEngine(text, engineId);
    await openUrl(url);
    if (engineId) {
      setCurrentSearchEngine(engineId);
    }
    
    showNotification('已在浏览器中搜索选中文本', 'success', 2000);
  } catch (error) {
    console.error('搜索失败:', error);
    showNotification('在浏览器中搜索失败', 'error');
  }
}

// 创建链接选择对话框
function createLinkSelectionDialog(links, callback) {
  // 移除已存在的对话框
  const existingDialog = document.querySelector('.link-selection-dialog');
  if (existingDialog) {
    existingDialog.remove();
  }
  
  // 创建对话框容器
  const dialog = document.createElement('div');
  dialog.className = 'link-selection-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    z-index: 10001;
    min-width: 300px;
    max-width: 400px;
    max-height: 50vh;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  // 创建对话框标题
  const title = document.createElement('div');
  title.className = 'dialog-title';
  title.style.cssText = `
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
    font-size: 14px;
    font-weight: 500;
    color: #333;
  `;
  title.textContent = '选择要打开的链接';
  dialog.appendChild(title);
  
  // 创建链接列表容器
  const listContainer = document.createElement('div');
  listContainer.className = 'dialog-content';
  listContainer.style.cssText = `
    padding: 4px 0;
    overflow-y: auto;
    flex: 1;
  `;
  
  // 添加链接选项
  links.forEach((link) => {
    const item = document.createElement('div');
    item.className = 'dialog-item';
    item.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      transition: background-color 0.15s ease;
      border-bottom: 1px solid #f5f5f5;
      font-size: 13px;
      color: #2196F3;
      word-break: break-all;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    
    // 显示链接文本，截断过长的链接
    const displayText = link.length > 50 ? link.substring(0, 50) + '...' : link;
    item.textContent = displayText;
    item.title = link; // 悬停时显示完整链接
    
    // 点击链接直接打开
    item.addEventListener('click', () => {
      callback([link]);
      dialog.remove();
      // 移除遮罩层
      const overlay = document.querySelector('.dialog-overlay');
      if (overlay) {
        overlay.remove();
      }
    });
    
    // 添加悬停效果
    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = '#f5f5f5';
    });
    
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = 'transparent';
    });
    
    listContainer.appendChild(item);
  });
  
  dialog.appendChild(listContainer);
  
  // 添加遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 10000;
  `;
  overlay.addEventListener('click', () => {
    dialog.remove();
    overlay.remove();
  });
  
  document.body.appendChild(overlay);
  document.body.appendChild(dialog);
}

// 打开链接
async function openLink(url) {
  try {
    // 如果URL不包含协议，添加https://
    if (!url.match(/^https?:\/\//i)) {
      url = 'https://' + url;
    }

    await openUrl(url);
    showNotification('已在浏览器中打开链接', 'success', 2000);
  } catch (error) {
    console.error('打开链接失败:', error);
    showNotification('打开链接失败', 'error');
  }
}

// 显示通用右键菜单
export async function showContextMenu(event, options) {
  event.preventDefault();
  event.stopPropagation();

  const menuItems = [];
  const plainTextForSearch = typeof options.content === 'string' ? options.content.trim() : '';

  // 检测并添加打开链接选项
  if (options.content || options.html_content) {
    const links = extractAllLinks({
      content: options.content,
      html_content: options.html_content
    });
    
    if (links.length === 1) {
      // 只有一个链接，直接显示打开选项
      menuItems.push(createPluginMenuItem('open-link', '在浏览器中打开', {
        icon: 'ti ti-external-link'
      }));
    } else if (links.length > 1) {
      // 多个链接，显示选择链接选项
      menuItems.push(createPluginMenuItem('open-links', `打开链接 (${links.length}个)`, {
        icon: 'ti ti-external-link'
      }));
    }
  }

  // 添加浏览器搜索选项
  if (plainTextForSearch && (options.content_type === 'text' || options.content_type === 'rich_text')) {
    // 如果已经有链接菜单项，添加分隔线
    if (menuItems.length > 0) {
      menuItems.push(createPluginSeparator());
    }
    
    // 获取搜索引擎列表和当前使用的引擎
    const searchEngines = getSearchEngines();
    const currentEngine = getCurrentSearchEngine(); // 使用上次使用的引擎
    
    // 创建主搜索菜单项
    if (currentEngine && searchEngines.length > 0) {
      const searchMenuItem = createPluginMenuItem(
        `search-current`,
        `在 ${currentEngine.name} 中搜索`, 
        {
          favicon: currentEngine.favicon
        }
      );
      
      // 添加子菜单（包含所有引擎和添加自定义引擎选项）
      if (searchEngines.length >= 1) {
        searchMenuItem.children = [
          ...searchEngines.map(engine => 
            createPluginMenuItem(`search-${engine.id}`, engine.name, {
              favicon: engine.favicon,
              icon: engine.id === currentEngine.id ? 'ti ti-check' : undefined
            })
          ),
          createPluginSeparator(),
          createPluginMenuItem('add-custom-search-engine', '添加自定义搜索引擎', {
            icon: 'ti ti-plus'
          })
        ];
      }
      
      menuItems.push(searchMenuItem);
    }
  }

  // 添加自定义菜单项
  if (options.items && options.items.length > 0) {
    // 如果已经有其他菜单项，添加分隔线
    if (menuItems.length > 0) {
      menuItems.push(createPluginSeparator());
    }

    options.items.forEach((item, index) => {
      if (item.type === 'separator') {
        menuItems.push(createPluginSeparator());
      } else {
        let icon = item.icon;
        if (icon && icon.startsWith('ti-') && !icon.startsWith('ti ti-')) {
          icon = 'ti ' + icon;
        }
        
        menuItems.push(createPluginMenuItem(item.id || `custom-${index}`, item.text, {
          icon: icon,
          disabled: item.disabled || false
        }));
      }
    });
  }

  // 如果没有任何菜单项，不显示菜单
  if (menuItems.length === 0) {
    return;
  }

  const requestId = ++menuRequestCounter;
  activeMenuRequestId = requestId;

  // 获取当前主题
  const settings = getCurrentSettings();
  const theme = settings.theme || 'auto';

  try {
    // 显示菜单并等待用户选择
    const result = await showMenuPlugin({
      items: menuItems,
      x: event.clientX,
      y: event.clientY,
      theme: theme
    });

    if (requestId !== activeMenuRequestId) {
      return;
    }

    // 处理用户选择
    if (!result) {
      return; // 用户取消了
    }

    // 处理链接打开
    const links = extractAllLinks({
      content: options.content,
      html_content: options.html_content
    });

    if (result === 'open-link' && links.length === 1) {
      await openLink(links[0]);
    } else if (result === 'open-links' && links.length > 1) {
      createLinkSelectionDialog(links, async (selectedLinks) => {
        for (const link of selectedLinks) {
          await openLink(link);
        }
      });
    }
    // 处理搜索引擎搜索
    else if (result === 'search-current') {
      // 点击父选项，使用当前引擎搜索
      const currentEngine = getCurrentSearchEngine();
      await searchTextInBrowser(plainTextForSearch, currentEngine.id);
    }
    else if (result.startsWith('search-')) {
      // 点击子选项，使用指定引擎搜索
      const engineId = result.substring(7);
      await searchTextInBrowser(plainTextForSearch, engineId);
    }
    // 处理添加自定义搜索引擎
    else if (result === 'add-custom-search-engine') {
      const { createCustomSearchEngineDialog } = await import('./searchEngineSelector.js');
      createCustomSearchEngineDialog(() => {
        // 添加成功后可以选择性地刷新某些内容
      });
    }
    // 处理自定义菜单项
    else if (options.items) {
      // 查找匹配的自定义菜单项
      let customItem = null;
      for (let i = 0; i < options.items.length; i++) {
        const item = options.items[i];
        // 检查是否匹配
        if ((item.id && item.id === result) || `custom-${i}` === result) {
          customItem = item;
          break;
        }
      }
      
      if (customItem && customItem.onClick) {
        customItem.onClick();
      }
    }
  } finally {
    if (requestId === activeMenuRequestId) {
      activeMenuRequestId = 0;
    }
  }
}

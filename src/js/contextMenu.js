// 通用右键菜单模块
import { openUrl } from '@tauri-apps/plugin-opener';
import { showNotification } from './notificationManager.js';
import { extractAllLinks } from './utils/linkUtils.js';
import { searchWithEngine } from './searchEngineManager.js';
import { createSearchEngineSelector } from './searchEngineSelector.js';

// 在浏览器中搜索文本
async function searchTextInBrowser(text, engineId = null) {
  try {
    const url = searchWithEngine(text, engineId);
    await openUrl(url);
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
  links.forEach((link, index) => {
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

// 创建菜单项
function createMenuItem(iconClass, text, onClick) {
  const item = document.createElement('div');
  item.className = 'context-menu-item';
  item.style.cssText = `
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    color: #333;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid #f5f5f5;
  `;

  item.innerHTML = `
    <i class="ti ${iconClass}" style="margin-right: 8px; font-size: 14px;"></i>
    <span>${text}</span>
  `;

  item.addEventListener('mouseenter', () => {
    item.style.backgroundColor = '#f5f5f5';
  });

  item.addEventListener('mouseleave', () => {
    item.style.backgroundColor = 'transparent';
  });

  item.addEventListener('click', onClick);
  return item;
}

// 创建分隔线
function createSeparator() {
  const separator = document.createElement('div');
  separator.className = 'context-menu-separator';
  separator.style.cssText = `
    height: 1px;
    background: #e8e8e8;
    margin: 4px 0;
  `;
  return separator;
}

// 根据需要添加分隔线
function appendSeparatorIfNeeded(menuItems) {
  if (menuItems.length === 0) {
    return;
  }

  const lastItem = menuItems[menuItems.length - 1];
  if (lastItem && lastItem.classList && lastItem.classList.contains('context-menu-separator')) {
    return;
  }

  menuItems.push(createSeparator());
}

// 隐藏当前显示的右键菜单
export function hideContextMenu() {
  const existingMenu = document.querySelector('.context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
}

// 显示通用右键菜单
export function showContextMenu(event, options) {
  // 移除已存在的菜单
  hideContextMenu();

  // 创建菜单容器
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = `
    position: fixed;
    top: ${event.clientY}px;
    left: ${event.clientX}px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    min-width: 150px;
    padding: 4px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  const menuItems = [];
  const plainTextForSearch = typeof options.content === 'string' ? options.content.trim() : '';

  // 检测并添加打开链接选项
  if (options.content || options.html_content) {
    // 使用统一的链接提取工具函数
    const links = extractAllLinks({
      content: options.content,
      html_content: options.html_content
    });
    
    if (links.length === 1) {
      // 只有一个链接，直接显示打开选项
      const openItem = createMenuItem('ti-external-link', '在浏览器中打开', async () => {
        await openLink(links[0]);
        menu.remove();
      });
      menuItems.push(openItem);
    } else if (links.length > 1) {
      // 多个链接，显示选择链接选项
      const openItem = createMenuItem('ti-external-link', `打开链接 (${links.length}个)`, async () => {
        menu.remove();
        createLinkSelectionDialog(links, async (selectedLinks) => {
          // 打开所有选中的链接
          for (const link of selectedLinks) {
            await openLink(link);
          }
        });
      });
      menuItems.push(openItem);
    }
  }

  // 添加浏览器搜索选项
  if (plainTextForSearch && (options.content_type === 'text' || options.content_type === 'rich_text')) {
    appendSeparatorIfNeeded(menuItems);
    const searchItem = createSearchEngineSelector(plainTextForSearch, async (engineId) => {
      await searchTextInBrowser(plainTextForSearch, engineId);
      menu.remove();
    });
    menuItems.push(searchItem);
  }

  // 添加自定义菜单项
  if (options.items && options.items.length > 0) {
    // 如果已经有链接菜单项，添加分隔线
    appendSeparatorIfNeeded(menuItems);

    options.items.forEach(item => {
      if (item.type === 'separator') {
        menuItems.push(createSeparator());
      } else {
        const menuItem = createMenuItem(item.icon, item.text, () => {
          item.onClick();
          menu.remove();
        });

        // 应用自定义样式
        if (item.style) {
          Object.assign(menuItem.style, item.style);
        }

        menuItems.push(menuItem);
      }
    });
  }

  // 添加所有菜单项到容器
  menuItems.forEach(menuItem => {
    menu.appendChild(menuItem);
  });

  document.body.appendChild(menu);

  // 点击其他地方关闭菜单
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);

  // 调整菜单位置，确保不超出屏幕
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (event.clientX - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (event.clientY - rect.height) + 'px';
  }
}

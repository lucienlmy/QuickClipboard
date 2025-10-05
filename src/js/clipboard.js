import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  clipboardHistory,
  setClipboardHistory,
  activeItemIndex,
  setActiveItemIndex,
  isDragging,
  currentFilter,
  searchInput,
  isOneTimePaste,
  pasteWithFormat
} from './config.js';
import { showNotification, showPasteLoading, hidePasteLoading } from './notificationManager.js';
import { showContextMenu } from './contextMenu.js';
import {
  shouldTranslateText,
  safeTranslateAndInputText,
  showTranslationIndicator,
  hideTranslationIndicator
} from './aiTranslation.js';
import { escapeHtml, formatTimestamp } from './utils/formatters.js';
import { highlightMultipleSearchTerms, highlightMultipleSearchTermsWithPosition, highlightMultipleSearchTermsInHTML, getCurrentSearchTerms } from './utils/highlight.js';
import { processHTMLImages } from './utils/htmlProcessor.js';
import { matchesFilter, matchesSearch } from './utils/typeFilter.js';
import { isLinkContent } from './utils/linkUtils.js';

import { VirtualList } from './virtualList.js';

// 图片缓存
const imageCache = new Map();
const thumbnailCache = new Map();

// 虚拟列表实例
let clipboardVirtualList = null;


// 生成剪贴板项目HTML字符串
function generateClipboardItemHTML(item, index) {
  // 直接使用后端返回的content_type字段
  const contentType = item.content_type || 'text';

  let contentHTML = '';

  // 生成内容HTML
  if (contentType === 'image') {
    contentHTML = generateImageHTML(item);
  } else if (contentType === 'file') {
    contentHTML = generateFilesHTML(item);
  } else {
    // 检查是否有HTML内容且开启格式显示
    if (item.html_content && pasteWithFormat && !isLinkContent(item)) {
      // 有HTML内容且开启格式显示，但不是纯链接内容，直接渲染HTML
      const searchTerms = getCurrentSearchTerms();
      let displayHTML = item.html_content;

      // 对HTML内容应用搜索高亮
      if (searchTerms.length > 0) {
        displayHTML = highlightMultipleSearchTermsInHTML(displayHTML, searchTerms);
      }

      // 处理HTML内容中的图片
      displayHTML = processHTMLImages(displayHTML);

      contentHTML = `<div class="clipboard-text clipboard-html"><div>${displayHTML}</div></div>`;
    } else {
      // 纯文本内容，使用原有逻辑
      const searchTerms = getCurrentSearchTerms();
      const highlightResult = highlightMultipleSearchTermsWithPosition(item.content, searchTerms);

      // 如果有搜索关键字，添加滚动定位功能
      if (searchTerms.length > 0 && highlightResult.firstKeywordPosition !== -1) {
        contentHTML = `<div class="clipboard-text searchable" data-first-keyword="${highlightResult.firstKeywordPosition}"><div>${highlightResult.html}</div></div>`;
      } else {
        contentHTML = `<div class="clipboard-text"><div>${highlightResult.html}</div></div>`;
      }
    }
  }

  // 生成序号和快捷键
  const numberHTML = `<div class="clipboard-number">${index + 1}</div>`;
  
  // 只在正常列表状态（非搜索、非筛选）下显示快捷键提示
  const isSearching = searchInput && searchInput.value.trim() !== '';
  const isFiltering = currentFilter !== 'all';
  const shouldShowShortcut = !isSearching && !isFiltering && index < 9;
  
  const shortcutHTML = shouldShowShortcut ?
    `<div class="clipboard-index">Ctrl+${index + 1}</div>` : '';

  // 生成操作按钮
  let actionsHTML = '<div class="clipboard-actions">';

  actionsHTML += '</div>';

  // 生成日期时间HTML - 优先使用created_at，如果为空则使用timestamp
  // 对于文件类型，时间戳会在文件HTML内部显示，所以这里不显示
  const timeValue = item.created_at || item.created_at;
  const timestampHTML = contentType === 'file' ? '' : `<div class="clipboard-timestamp">${formatTimestamp(timeValue)}</div>`;

  // 组合完整的HTML
  const activeClass = index === activeItemIndex ? ' active' : '';
  const noShortcutClass = index >= 9 ? ' no-shortcut' : '';

  return `
    <div class="clipboard-item${activeClass}${noShortcutClass}" draggable="true" data-index="${index}">
      ${timestampHTML}
      ${contentHTML}
      ${numberHTML}
      ${shortcutHTML}
      ${actionsHTML}
    </div>
  `;
}



// 生成图片HTML
function generateImageHTML(item) {
  // 为图片元素生成唯一ID，用于后续异步加载
  const imgId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  if (item.image_id) {
    // 使用image_id字段
    return `<img id="${imgId}" class="clipboard-image" src="" alt="剪贴板图片" data-image-id="${item.image_id}" data-needs-load="true" loading="lazy">`;
  } else if (item.content.startsWith('image:')) {
    // 从text中提取image_id
    const imageId = item.content.substring(6);
    return `<img id="${imgId}" class="clipboard-image" src="" alt="剪贴板图片" data-image-id="${imageId}" data-needs-load="true" loading="lazy">`;
  } else if (item.content.startsWith('data:image/')) {
    // 旧格式的完整图片数据
    return `<img class="clipboard-image" src="${item.content}" alt="剪贴板图片" loading="lazy">`;
  } else {
    // 未知格式，显示占位符
    return `<div class="clipboard-image" style="background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; color: #666;">图片加载失败</div>`;
  }
}

// 生成文件图标HTML字符串
function generateFileIconHTML(file, size = 'medium') {
  const sizeMap = {
    small: '16px',
    medium: '20px',
    large: '24px'
  };

  const iconSize = sizeMap[size] || sizeMap.medium;
  const alt = file.file_type || '文件';

  // 获取图标数据
  let iconSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBmaWxsPSIjQ0NDQ0NDIi8+Cjwvc3ZnPgo=';
  let needsAsyncLoad = false;
  let filePath = '';

  if (file.icon_data) {
    if (file.icon_data.startsWith('image_file://')) {
      // 这是一个图片文件路径，需要异步加载
      filePath = file.icon_data.substring(13);
      needsAsyncLoad = true;
    } else {
      // 使用原有的base64数据
      iconSrc = file.icon_data;
    }
  }

  const dataAttributes = needsAsyncLoad ?
    `data-file-path="${escapeHtml(filePath)}" data-needs-load="true"` : '';

  return `<img class="file-icon" src="${iconSrc}" alt="${escapeHtml(alt)}" style="width: ${iconSize}; height: ${iconSize}; object-fit: cover; border-radius: 2px;" ${dataAttributes}>`;
}

// 生成文件HTML
function generateFilesHTML(item) {
  try {
    const filesJson = item.content.substring(6);
    const filesData = JSON.parse(filesJson);

    // 格式化时间 - 优先使用created_at，如果为空则使用timestamp
    const timeValue = item.created_at || item.created_at;
    const timeStr = formatTimestamp(timeValue);

    // 顶部显示：时间和文件数量
    let filesHTML = `<div class="file-summary">${timeStr} • ${filesData.files.length} 个文件</div>`;
    filesHTML += '<div class="clipboard-files">';
    // 添加内部包装层，用于处理图标模式下的内容方向
    filesHTML += '  <div class="clipboard-files-inner">';

    filesData.files.forEach(file => {
      const iconHTML = generateFileIconHTML(file, 'medium');
      const fileSize = formatFileSize(file.size || 0);
      filesHTML += `
        <div class="file-item" data-path="${escapeHtml(file.path)}">
          ${iconHTML}
          <div class="file-info">
            <div class="file-name">${escapeHtml(file.name)} <span class="file-size">${fileSize}</span></div>
            <div class="file-path">${escapeHtml(file.path)}</div>
          </div>
        </div>
      `;
    });

    filesHTML += '  </div>';
    filesHTML += '</div>';
    return filesHTML;
  } catch (error) {
    return `<div class="clipboard-text">文件数据解析错误</div>`;
  }
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// =================== 剪贴板操作函数 ===================

// 读取剪贴板文本
export async function readClipboardText() {
  try {
    return await invoke('get_clipboard_text');
  } catch (error) {
    console.error('读取剪贴板文本失败:', error);
    return null;
  }
}

// 写入剪贴板文本
export async function writeClipboardText(text) {
  try {
    await invoke('set_clipboard_text', { text });
    return true;
  } catch (error) {
    console.error('写入剪贴板文本失败:', error);
    return false;
  }
}

// 写入剪贴板图片
export async function writeClipboardImage(dataUrl) {
  try {
    await invoke('set_clipboard_image', { data_url: dataUrl });
    return true;
  } catch (error) {
    console.error('写入剪贴板图片失败:', error);
    return false;
  }
}

// 增量添加剪贴板项
export function addClipboardItemIncremental(item, isNew) {
  // 如果是新增项，直接添加到数组开头
  if (isNew) {
    console.log('增量添加：新增项');
    const newHistory = [item, ...clipboardHistory];
    setClipboardHistory(newHistory);
    window.clipboardHistory = newHistory;
  } else {
    // 如果是移动已存在的项，先删除原有位置的项，再添加到开头
    const newHistory = clipboardHistory.filter(
      existingItem => existingItem.content !== item.content
    );
    const afterLength = newHistory.length;
    newHistory.unshift(item);
    setClipboardHistory(newHistory);
    window.clipboardHistory = newHistory;
  }

  // 增量渲染
  renderClipboardItems();
}

// 刷新剪贴板历史（全量更新，用于特定场景）
export async function refreshClipboardHistory() {
  let retries = 3;

  while (retries > 0) {
    try {
      const history = await invoke('get_clipboard_history');

      // 如果历史记录有变化，更新UI
      if (JSON.stringify(history) !== JSON.stringify(clipboardHistory)) {
        setClipboardHistory(history);

        // 将剪贴板历史设置到全局作用域，供虚拟列表拖拽使用
        window.clipboardHistory = history;

        renderClipboardItems();
      }
      return; // 成功获取，退出重试循环
    } catch (error) {
      console.error('刷新剪贴板历史失败:', error);
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 200)); // 等待200ms后重试
      }
    }
  }

}


// 设置活动项目
export function setActiveItem(index) {
  setActiveItemIndex(index);
  renderClipboardItems();
}

// 过滤剪贴板项目
export function filterClipboardItems() {
  renderClipboardItems();

  // 导入并调用自动滚动功能
  import('./utils/highlight.js').then(module => {
    module.setupSearchResultScrolling();
  }).catch(() => { });
}

// 将剪贴板内容添加到常用
export async function addClipboardToFavorites(index) {
  try {
    const result = await invoke('add_clipboard_to_favorites', { index });
    // 显示成功提示
    showNotification('已添加到常用文本', 'success');

    // 返回结果，让调用者决定是否刷新常用文本列表
    return result;
  } catch (error) {
    console.error('添加到常用失败:', error);
    showNotification(error, 'error');
    throw error;
  }
}

// 更新剪贴板历史顺序
export async function updateClipboardOrder(oldIndex, newIndex) {
  try {
    const filteredData = getFilteredClipboardData();

    if (oldIndex >= filteredData.length || newIndex >= filteredData.length) {
      return;
    }

    const movedItem = filteredData[oldIndex];
    const targetItem = filteredData[newIndex];

    const originalOldIndex = clipboardHistory.findIndex(item =>
      item.content === movedItem.content && item.created_at === movedItem.created_at
    );
    const originalNewIndex = clipboardHistory.findIndex(item =>
      item.content === targetItem.content && item.created_at === targetItem.created_at
    );

    if (originalOldIndex === -1 || originalNewIndex === -1) {
      return;
    }

    await invoke('move_clipboard_item', {
      fromIndex: originalOldIndex,
      toIndex: originalNewIndex
    });

    await refreshClipboardHistory();

  } catch (error) {
    console.error('更新剪贴板顺序失败:', error);
    await refreshClipboardHistory();
  }
}

// 初始化虚拟列表
function initClipboardVirtualList() {

  if (clipboardVirtualList) {
    clipboardVirtualList.destroy();
  }

  clipboardVirtualList = new VirtualList({
    scrollId: 'clipboard-list',
    contentId: 'clipboard-content',
    data: getFilteredClipboardData(),
    renderItem: generateClipboardItemHTML,
    onSort: updateClipboardOrder,
    onItemClick: handleClipboardItemClick,
    onItemContextMenu: handleClipboardItemContextMenu,
    sortableOptions: {
      onStart: () => {
        document.querySelector('.tab-content.active').classList.add('dragging');
        const sidebar = document.getElementById('groups-sidebar');
        if (sidebar && !sidebar.classList.contains('pinned')) {
          sidebar.classList.add('show');
        }
      },
      onEnd: () => {
        document.querySelector('.tab-content.active').classList.remove('dragging');
        const sidebar = document.getElementById('groups-sidebar');
        if (sidebar && !sidebar.classList.contains('pinned')) {
          sidebar.classList.remove('show');
        }
      }
    }
  });

  // 将虚拟列表实例暴露到全局，供导航系统使用
  if (!window.clipboardModule) {
    window.clipboardModule = {};
  }
  window.clipboardModule.clipboardVirtualList = clipboardVirtualList;
}

// 获取过滤后的剪贴板数据
function getFilteredClipboardData() {
  const searchTerm = searchInput.value.toLowerCase();
  const filterType = currentFilter;

  return clipboardHistory.filter((item) => {
    const contentType = item.content_type || 'text';

    // 类型筛选
    if (!matchesFilter(contentType, filterType, item)) {
      return false;
    }

    // 搜索筛选
    return matchesSearch(item, searchTerm, contentType);
  });
}

// 检查文件是否存在并更新UI
async function checkFilesExistence() {
  const fileItems = document.querySelectorAll('#clipboard-list .file-item[data-path]');
  for (const item of fileItems) {
    const path = item.dataset.path;
    if (path) {
      try {
        const exists = await invoke('file_exists', { path });
        if (!exists) {
          item.classList.add('file-not-exist');
        } else {
          item.classList.remove('file-not-exist');
        }
      } catch (error) {
        console.warn(`检查文件是否存在失败: ${path}`, error);
      }
    }
  }
}

// 异步加载文件图标和图片
async function loadFileIcons() {
  // 加载文件图标
  const fileIcons = document.querySelectorAll('.file-icon[data-needs-load="true"]');

  for (const icon of fileIcons) {
    const filePath = icon.getAttribute('data-file-path');
    if (filePath) {
      try {
        const dataUrl = await invoke('read_image_file', { filePath });
        icon.src = dataUrl;
        icon.style.objectFit = 'cover';
        icon.style.borderRadius = '2px';
        icon.removeAttribute('data-needs-load');
        icon.removeAttribute('data-file-path');
      } catch (error) {
        console.warn('加载文件图标失败:', error);
        // 保持默认图标
      }
    }
  }

  // 加载剪贴板图片
  const clipboardImages = document.querySelectorAll('.clipboard-image[data-needs-load="true"]');

  for (const img of clipboardImages) {
    const imageId = img.getAttribute('data-image-id');
    if (imageId) {
      try {
        await loadImageById(img, imageId, true); // 先加载缩略图
        img.removeAttribute('data-needs-load');
        img.removeAttribute('data-image-id');
      } catch (error) {
        console.warn('加载剪贴板图片失败:', error);
        img.alt = '图片加载失败';
        img.style.backgroundColor = '#e0e0e0';
      }
    }
  }
}

export function renderClipboardItems() {
  if (!clipboardVirtualList) {
    initClipboardVirtualList();
  } else {
    const filteredData = getFilteredClipboardData();
    clipboardVirtualList.updateData(filteredData);
  }

  // 异步加载文件图标和检查文件是否存在
  setTimeout(() => {
    loadFileIcons();
    checkFilesExistence();
  }, 0);

  // 通知导航模块列表已更新
  import('./navigation.js').then(module => {
    module.onListUpdate();
  }).catch(() => { });
}

// 处理剪贴板项目点击事件
function handleClipboardItemClick(index, event) {
  if (isDragging) return;

  // 获取过滤后的数据，因为虚拟列表使用的是过滤后的数据
  const filteredData = getFilteredClipboardData();
  const item = filteredData[index];
  if (!item) return;

  // 找到在原始数组中的索引
  const originalIndex = clipboardHistory.findIndex(originalItem => originalItem === item);
  if (originalIndex === -1) return;

  // 处理主要的点击事件（粘贴）
  const clipboardItem = event.target.closest('.clipboard-item');
  handleClipboardItemPaste(item, originalIndex, clipboardItem);
}

// 处理剪贴板项目右键菜单
function handleClipboardItemContextMenu(index, event) {
  event.preventDefault();

  // 获取过滤后的数据，因为虚拟列表使用的是过滤后的数据
  const filteredData = getFilteredClipboardData();
  const item = filteredData[index];
  if (!item) return;

  // 找到在原始数组中的索引
  const originalIndex = clipboardHistory.findIndex(originalItem => originalItem === item);
  if (originalIndex === -1) return;

  showClipboardContextMenu(event, item, originalIndex);
}

// 处理剪贴板项目粘贴
async function handleClipboardItemPaste(item, index, element = null) {
  try {
    // 检查是否需要AI翻译
    const contentType = item.content_type || 'text';
    const isTextContent = contentType === 'text';
    const translationCheck = isTextContent ? shouldTranslateText(item.content, 'paste') : { should: false, reason: '非文本内容' };
    const needsTranslation = translationCheck.should;

    // 根据内容类型确定加载消息
    let loadingMessage = '正在粘贴...';
    if (contentType === 'file') {
      loadingMessage = '正在粘贴文件...';
    } else if (contentType === 'image') {
      loadingMessage = '正在粘贴图片...';
    } else if (needsTranslation) {
      loadingMessage = '正在翻译...';
    }

    // 显示加载状态
    showPasteLoading(element, loadingMessage);

    if (needsTranslation) {
      // 使用AI翻译并流式输入
      showTranslationIndicator('正在翻译...');

      // 定义降级回调函数
      const fallbackPaste = async () => {
        const params = {
          content: item.content,
          html_content: pasteWithFormat ? (item.html_content || null) : null,
          one_time: false
        };
        await invoke('paste_content', { params });
      };

      try {
        const result = await safeTranslateAndInputText(item.content, fallbackPaste);

        setActiveItem(index);

        if (result.success) {

          // 一次性粘贴：翻译成功后删除该剪贴板历史项
          if (isOneTimePaste) {
            try {
              setTimeout(async () => {
                await deleteClipboardItem(index);
              }, 100);
            } catch (_) { }
          }

          hideTranslationIndicator();
          hidePasteLoading(element, true, '翻译粘贴成功');
        } else {
          console.error('AI翻译失败:', result.error);
          hideTranslationIndicator();
          hidePasteLoading(element, false, '翻译失败');
          showNotification('翻译失败，请重试', 'error');
        }
      } catch (error) {
        console.error('AI翻译过程中发生错误:', error);
        hideTranslationIndicator();
        hidePasteLoading(element, false, '翻译过程中发生错误');
        showNotification('翻译过程中发生错误', 'error');
      }
    } else {
      // 不需要翻译，直接粘贴
      const params = {
        content: item.content,
        html_content: pasteWithFormat ? (item.html_content || null) : null,
        one_time: false
      };
      await invoke('paste_content', { params });
      setActiveItem(index);

      // 根据内容类型显示成功消息
      let successMessage = '粘贴成功';
      if (contentType === 'file') {
        successMessage = '文件粘贴成功';
      } else if (contentType === 'image') {
        successMessage = '图片粘贴成功';
      }

      // 一次性粘贴：粘贴成功后删除该剪贴板历史项
      if (isOneTimePaste) {
        try {
          setTimeout(async () => {
            await deleteClipboardItem(index);
          }, 100);
        } catch (_) { }
      }

      hidePasteLoading(element, true, successMessage);
    }
  } catch (error) {
    console.error('粘贴失败:', error);
    hidePasteLoading(element, false, '粘贴失败');
    showNotification('粘贴失败', 'error');
  }
}



// 删除剪贴板项目
async function deleteClipboardItem(index) {
  try {
    await invoke('delete_clipboard_item', {
      id: index
    });
    // 刷新剪贴板历史
    await refreshClipboardHistory();
    showNotification('项目已删除', 'success');
  } catch (error) {
    console.error('删除剪贴板项目失败:', error);
    showNotification('删除失败', 'error');
  }
}

// 清空剪贴板历史
async function clearClipboardHistory() {
  const { showConfirmModal } = await import('./ui.js');

  showConfirmModal(
    '确认清空',
    '确定要清空所有剪贴板历史记录吗？此操作不可撤销。',
    async () => {
      try {
        await invoke('clear_clipboard_history');
        showNotification('已清空剪贴板历史', 'success');
        // 刷新列表
        await refreshClipboardHistory();
      } catch (error) {
        console.error('清空剪贴板历史失败:', error);
        showNotification('清空失败', 'error');
      }
    }
  );
}

// 显示剪贴板右键菜单
function showClipboardContextMenu(event, item, index) {
  const menuItems = [];

  // 直接使用后端返回的content_type字段
  const contentType = item.content_type || 'text';

  // 根据内容类型添加特有菜单项
  if (contentType === 'image') {
    // 图片类型菜单
    menuItems.push(
      {
        icon: 'ti-pin',
        text: '钉到屏幕',
        onClick: async () => {
          await pinImageToScreen(item);
        }
      },
      {
        icon: 'ti-download',
        text: '另存为图片',
        onClick: () => {
          saveImageAsFromClipboard(item);
        }
      }
    );
  } else if (contentType === 'file') {
    // 文件类型菜单
    menuItems.push(
      {
        icon: 'ti-external-link',
        text: '使用默认程序打开',
        onClick: () => {
          openFileWithDefaultProgram(item);
        }
      },
      {
        icon: 'ti-folder-open',
        text: '打开文件位置',
        onClick: () => {
          openFileLocationFromClipboard(item);
        }
      },
      {
        icon: 'ti-copy',
        text: '复制文件路径',
        onClick: () => {
          copyFilePathsFromClipboard(item);
        }
      }
    );
  } else if (contentType === 'text' || contentType === 'link' || contentType === 'rich_text') {
    // 文本、链接和富文本类型菜单
    menuItems.push({
      icon: 'ti-edit',
      text: contentType === 'rich_text' ? '编辑纯文本' : '编辑',
      onClick: async () => {
        await openTextEditor(item, index);
      }
    });
  }

  // 通用菜单项
  menuItems.push(
    {
      icon: 'ti-star',
      text: '添加到常用文本',
      onClick: async () => {
        try {
          await invoke('add_clipboard_to_favorites', { index });
          showNotification('已添加到常用文本', 'success');

          // 触发常用文本列表刷新
          await invoke('emit_quick_texts_updated');
        } catch (error) {
          console.error('添加到常用文本失败:', error);
          showNotification('添加失败', 'error');
        }
      }
    },
    {
      icon: 'ti-trash',
      text: '删除当前项',
      onClick: async () => {
        await deleteClipboardItem(index);
      }
    },
    { type: 'separator' },
    {
      icon: 'ti-trash-x',
      text: '清空剪贴板',
      style: { color: '#ff4d4f' },
      onClick: async () => {
        await clearClipboardHistory();
      }
    }
  );

  showContextMenu(event, {
    content: item.content,
    html_content: item.html_content,
    content_type: contentType,
    items: menuItems
  });
}

// 打开文本编辑器
async function openTextEditor(item, index) {
  try {
    // 打开文本编辑窗口
    await invoke('open_text_editor_window');

    // 准备编辑数据
    const editorData = {
      index: index,
      content: item.content,
      title: `剪贴板项目 #${index + 1}`,
      timestamp: item.created_at
    };

    // 延迟发送数据，确保窗口已完全加载
    setTimeout(async () => {
      try {
        // 获取编辑器窗口并发送数据
        const { emit } = await import('@tauri-apps/api/event');
        await emit('editor-data', editorData);
        // 编辑数据已发送
      } catch (error) {
        console.error('发送编辑数据失败:', error);
        showNotification('打开编辑器失败', 'error');
      }
    }, 500);

  } catch (error) {
    console.error('打开文本编辑器失败:', error);
    showNotification('打开编辑器失败', 'error');
  }
}



// 根据图片ID加载图片
export async function loadImageById(imgElement, imageId, useThumbnail = true) {
  try {
    const cacheKey = `${imageId}_${useThumbnail ? 'thumb' : 'full'}`;
    const cache = useThumbnail ? thumbnailCache : imageCache;

    // 检查缓存
    if (cache.has(cacheKey)) {
      imgElement.src = cache.get(cacheKey);
      return;
    }

    // 从后端获取图片数据
    const command = useThumbnail ? 'get_image_thumbnail_url' : 'get_image_data_url';
    const dataUrl = await invoke(command, { imageId });

    // 缓存图片数据
    cache.set(cacheKey, dataUrl);

    // 设置图片源
    imgElement.src = dataUrl;

    // 如果是缩略图，添加点击事件加载完整图片
    if (useThumbnail) {
      imgElement.style.cursor = 'pointer';
      imgElement.addEventListener('click', async (e) => {
        e.stopPropagation(); // 防止触发父元素的点击事件
        await loadImageById(imgElement, imageId, false);
      });
    }

  } catch (error) {
    console.error('加载图片失败:', error);
    imgElement.alt = '图片加载失败';
    imgElement.style.backgroundColor = '#ffebee';
    imgElement.style.color = '#c62828';
    imgElement.textContent = '图片加载失败';
  }
}



// 获取剪贴板中的文件列表
export async function getClipboardFiles() {
  try {
    const files = await invoke('get_clipboard_files');
    return files;
  } catch (error) {
    console.error('获取剪贴板文件失败:', error);
    return [];
  }
}

// 钉图片到屏幕（已废弃）
async function pinImageToScreen(item) {
  showNotification('钉图片功能已移除，不再支持外部截屏程序', 'warning');
}


// 从剪贴板另存为图片
async function saveImageAsFromClipboard(item) {
  try {
    if (!item.content.startsWith('data:image/') && !item.content.startsWith('image:')) {
      showNotification('此图片格式暂不支持直接保存', 'info');
      return;
    }

    // 使用文件对话框选择保存位置
    const { save } = await import('@tauri-apps/plugin-dialog');
    const filePath = await save({
      title: '保存图片',
      defaultPath: `image_${Date.now()}.png`,
      filters: [{
        name: '图片文件',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']
      }]
    });

    if (!filePath) {
      return; // 用户取消了操作
    }

    // 调用后端保存图片
    await invoke('save_image_to_file', {
      content: item.content,
      filePath: filePath
    });

    showNotification('图片已保存', 'success');
  } catch (error) {
    console.error('保存图片失败:', error);
    showNotification('保存图片失败', 'error');
  }
}

// 使用默认程序打开文件
async function openFileWithDefaultProgram(item) {
  try {
    const filesJson = item.content.substring(6); // 去掉 "files:" 前缀
    const filesData = JSON.parse(filesJson);

    if (filesData.files && filesData.files.length > 0) {
      const firstFilePath = filesData.files[0].path;
      await invoke('open_file_with_default_program', { filePath: firstFilePath });
      showNotification('已使用默认程序打开文件', 'success');
    }
  } catch (error) {
    console.error('打开文件失败:', error);
    showNotification('打开文件失败', 'error');
  }
}

// 从剪贴板打开文件位置
async function openFileLocationFromClipboard(item) {
  try {
    const filesJson = item.content.substring(6); // 去掉 "files:" 前缀
    const filesData = JSON.parse(filesJson);

    if (filesData.files && filesData.files.length > 0) {
      const firstFilePath = filesData.files[0].path;
      await invoke('open_file_location', { filePath: firstFilePath });
      showNotification('已打开文件位置', 'success');
    }
  } catch (error) {
    console.error('打开文件位置失败:', error);
    showNotification('打开文件位置失败', 'error');
  }
}

// 从剪贴板复制文件路径
async function copyFilePathsFromClipboard(item) {
  try {
    const filesJson = item.content.substring(6); // 去掉 "files:" 前缀
    const filesData = JSON.parse(filesJson);

    if (filesData.files && filesData.files.length > 0) {
      const paths = filesData.files.map(file => file.path).join('\n');
      await navigator.clipboard.writeText(paths);
      showNotification(`已复制 ${filesData.files.length} 个文件路径`, 'success');
    }
  } catch (error) {
    console.error('复制文件路径失败:', error);
    showNotification('复制文件路径失败', 'error');
  }
}

// 监听格式模式变化事件
window.addEventListener('format-mode-changed', (event) => {
  renderClipboardItems();
});

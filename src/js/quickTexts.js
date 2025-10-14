import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentSettings } from '../settings/js/settingsManager.js';
import {
  quickTexts,
  setQuickTexts,
  isDragging,
  currentQuickTextsFilter,
  isOneTimePaste,
  editingQuickTextId,
  setEditingQuickTextId,
  quickTextsSearch,
  quickTextsList,
  quickTextModal,
  modalTitle,
  quickTextTitleInput,
  quickTextContentInput,
  quickTextGroupSelect,
  pasteWithFormat
} from './config.js';
import { showNotification } from './notificationManager.js';
import { showConfirmModal, showAlertModal } from './ui.js';
import { getCurrentGroupId, updateGroupSelects, getGroups } from './groups.js';
import { escapeHtml, formatTimestamp } from './utils/formatters.js';
import { highlightMultipleSearchTerms, highlightMultipleSearchTermsWithPosition, highlightMultipleSearchTermsInHTML, getCurrentSearchTerms } from './utils/highlight.js';
import { processHTMLImages } from './utils/htmlProcessor.js';
import { matchesFilter, matchesSearch } from './utils/typeFilter.js';
import { VirtualList } from './virtualList.js';
import { showContextMenu } from './contextMenu.js';
import { detectColor, generateColorPreviewHTML } from './utils/colorUtils.js';


// 虚拟列表实例
let quickTextsVirtualList = null;

// 生成常用文本项目HTML字符串
function generateQuickTextItemHTML(text, index) {
  // 直接使用后端返回的content_type字段
  const contentType = text.content_type || 'text';

  let contentHTML = '';

  // 生成内容HTML
  if (contentType === 'image') {
    contentHTML = generateQuickTextImageHTML(text);
  } else if (contentType === 'file') {
    contentHTML = generateQuickTextFilesHTML(text);
  } else {
    // 检查是否有HTML内容且开启格式显示
    if (text.html_content && pasteWithFormat) {
      // 如果有HTML内容且开启格式显示，处理HTML显示
      const searchTerms = getCurrentSearchTerms();
      const titleResult = highlightMultipleSearchTermsWithPosition(text.title, searchTerms);
      let displayHTML = text.html_content;
      
      // 对HTML内容应用搜索高亮
      if (searchTerms.length > 0) {
        displayHTML = highlightMultipleSearchTermsInHTML(displayHTML, searchTerms);
      }
      
      // 处理HTML内容中的图片，添加错误处理和安全属性
      displayHTML = processHTMLImages(displayHTML);
      
      contentHTML = `
        <div class="quick-text-title">${titleResult.html}</div>
        <div class="quick-text-content quick-text-html"><div>${displayHTML}</div></div>
      `;
    } else {
      // 纯文本内容，使用原有逻辑
      const searchTerms = getCurrentSearchTerms();
      const titleResult = highlightMultipleSearchTermsWithPosition(text.title, searchTerms);
      
      // 检测内容是否为颜色值
      const colorInfo = detectColor(text.content);
      let displayContent;
      let contentDataAttr = '';
      
      if (colorInfo) {
        // 是颜色值，生成颜色预览
        displayContent = generateColorPreviewHTML(colorInfo);
      } else {
        // 不是颜色值，正常处理高亮
        const contentResult = highlightMultipleSearchTermsWithPosition(text.content, searchTerms);
        displayContent = contentResult.html;
        
        // 如果有搜索关键字，添加滚动定位功能
        if (searchTerms.length > 0 && contentResult.firstKeywordPosition !== -1) {
          contentDataAttr = `data-first-keyword="${contentResult.firstKeywordPosition}"`;
        }
      }
      
      // 构建完整的 HTML
      const titleDataAttr = searchTerms.length > 0 && titleResult.firstKeywordPosition !== -1 
        ? `data-first-keyword="${titleResult.firstKeywordPosition}"` 
        : '';
      const titleClass = titleDataAttr ? 'quick-text-title searchable' : 'quick-text-title';
      const contentClass = contentDataAttr ? 'quick-text-content searchable' : 'quick-text-content';
      
      contentHTML = `
        <div class="${titleClass}" ${titleDataAttr}>${titleResult.html}</div>
        <div class="${contentClass}" ${contentDataAttr}><div>${displayContent}</div></div>
      `;
    }
  }

  // 生成日期时间HTML
  // 对于文件类型，时间戳会在文件HTML内部显示，所以这里不显示
  const timestampHTML = contentType === 'file' ? '' : `<div class="quick-text-timestamp">${formatTimestamp(text.created_at)}</div>`;

  // 在"全部"分组中显示分组标签
  const groupBadgeHTML = generateGroupBadgeHTML(text);

  return `
    <div class="quick-text-item" draggable="true" data-index="${index}">
      ${timestampHTML}
      ${groupBadgeHTML}
      ${contentHTML}
    </div>
  `;
}

// 生成分组标签HTML
function generateGroupBadgeHTML(text) {
  // 只在"全部"分组中显示分组标签
  const currentGroupId = getCurrentGroupId();
  if (currentGroupId !== '全部') {
    return '';
  }

  // 获取项目的分组信息
      const itemGroupName = text.group_name || '全部';
    if (itemGroupName === '全部') {
    return '';
  }

  try {
    const groups = getGroups();
    const group = groups.find(g => g.name === itemGroupName);

    if (group) {
      return `
        <div class="group-badge">
          <i class="${group.icon}"></i>
          <span>${escapeHtml(group.name)}</span>
        </div>
      `;
    }
  } catch (error) {
    console.warn('获取分组信息失败:', error);
  }

  return '';
}

// 生成常用文本图片HTML
function generateQuickTextImageHTML(text) {
  // 为图片元素生成唯一ID，用于后续异步加载
  const imgId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const placeholderSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg==';

  if (text.content.startsWith('image:')) {
    // 从content中提取image_id
    const imageId = text.content.substring(6);
    return `
      <img id="${imgId}" class="quick-text-image lazy image-loading" src="${placeholderSrc}" alt="常用图片" data-image-id="${imageId}" decoding="async">
    `;
  } else if (text.content.startsWith('data:image/')) {
    // 旧格式的完整图片数据
    return `
      <div class="quick-text-title">${escapeHtml(text.title)}</div>
      <img class="quick-text-image" src="${text.content}" alt="常用图片" decoding="async">
    `;
  } else {
    // 未知格式，显示占位符
    return `
      <div class="quick-text-title">${escapeHtml(text.title)}</div>
      <div class="quick-text-image" style="background-color: #e0e0e0; display: flex; align-items: center; justify-content: center; color: #666;">图片加载失败</div>
    `;
  }
}

// 生成文件图标HTML字符串（复用clipboard.js中的逻辑）
function generateFileIconHTML(file, size = 'medium') {
  const sizeMap = {
    small: '16px',
    medium: '20px',
    large: '24px'
  };

  const iconSize = sizeMap[size] || sizeMap.medium;
  const alt = file.file_type || '文件';

  // 默认占位图标
  const placeholderSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiBmaWxsPSIjQ0NDQ0NDIi8+Cjwvc3ZnPgo=';

  // 检查是否是图片文件且启用了预览
  const settings = getCurrentSettings();
  const isImageFile = ['PNG', 'JPG', 'JPEG', 'GIF', 'BMP', 'WEBP', 'ICO'].includes(file.file_type?.toUpperCase());
  
  if (isImageFile && settings.showImagePreview && file.path) {
    const iconSrc = convertFileSrc(file.path, 'asset');
    const iconStyle = 'object-fit: cover; border-radius: 2px;';
    return `<img class="file-icon lazy image-loading" src="${placeholderSrc}" data-src="${iconSrc}" alt="${escapeHtml(alt)}" style="width: ${iconSize}; height: ${iconSize}; ${iconStyle}" decoding="async">`;
  } else if (file.icon_data) {
    // 使用图标数据（base64）
    const iconStyle = 'object-fit: contain; border-radius: 0;';
    return `<img class="file-icon" src="${file.icon_data}" alt="${escapeHtml(alt)}" style="width: ${iconSize}; height: ${iconSize}; ${iconStyle}">`;
  } else {
    // 使用默认图标
    const iconStyle = 'object-fit: contain; border-radius: 0;';
    return `<img class="file-icon" src="${placeholderSrc}" alt="${escapeHtml(alt)}" style="width: ${iconSize}; height: ${iconSize}; ${iconStyle}">`;
  }
}

// 生成常用文本文件HTML
function generateQuickTextFilesHTML(text) {
  try {
    const filesJson = text.content.substring(6);
    const filesData = JSON.parse(filesJson);

    // 格式化时间
    const timeStr = formatTimestamp(text.created_at);

    let filesHTML = `<div class="quick-text-title">${escapeHtml(text.title)}</div>`;
    // 顶部显示：时间和文件数量
    filesHTML += `<div class="file-summary">${timeStr} • ${filesData.files.length} 个文件</div>`;
    filesHTML += '<div class="files-container">';
    filesHTML += '<div class="clipboard-files-inner">';

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

    filesHTML += '</div>';
    filesHTML += '</div>';
    return filesHTML;
  } catch (error) {
    return `
      <div class="quick-text-title">${escapeHtml(text.title)}</div>
      <div class="quick-text-content">文件数据解析错误</div>
    `;
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

// =================== 常用文本操作函数 ===================

// 刷新常用文本列表
export async function refreshQuickTexts() {
  let retries = 3;

  while (retries > 0) {
    try {
      const currentGroupId = getCurrentGroupId();
      let texts;

      if (currentGroupId === '全部') {
        texts = await invoke('get_quick_texts');
      } else {
        try {
          texts = await invoke('get_quick_texts_by_group', { groupName: currentGroupId });
        } catch (groupError) {
          console.warn('按分组获取常用文本失败，回退到获取全部:', groupError);
          texts = await invoke('get_quick_texts');
        }
      }

      setQuickTexts(texts);
      renderQuickTexts();
      return; // 成功获取，退出重试循环
    } catch (error) {
      console.error('获取常用文本失败:', error);
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 200)); // 等待200ms后重试
      }
    }
  }

  // 如果完全失败，设置空数组
  setQuickTexts([]);
  renderQuickTexts();
}

// 过滤常用文本
export function filterQuickTexts() {
  renderQuickTexts();
  
  // 导入并调用自动滚动功能
  import('./utils/highlight.js').then(module => {
    module.setupSearchResultScrolling();
  }).catch(() => {});
}

// 显示常用文本模态框（用于添加新文本）
export function showQuickTextModal(text = null) {
  setEditingQuickTextId(text ? text.id : null);

  // 更新分组选择下拉框
  updateGroupSelects();

  if (text) {
    modalTitle.textContent = '编辑常用文本';
    quickTextTitleInput.value = text.title;
    quickTextContentInput.value = text.content;
    quickTextGroupSelect.value = text.group_name || 'all';
  } else {
    modalTitle.textContent = '添加常用文本';
    quickTextTitleInput.value = '';
    quickTextContentInput.value = '';
    quickTextGroupSelect.value = getCurrentGroupId();
  }

  quickTextModal.classList.add('active');
  quickTextTitleInput.focus();
}

// 隐藏常用文本模态框
export function hideQuickTextModal() {
  quickTextModal.classList.remove('active');
  setEditingQuickTextId(null);
}

// 编辑常用文本
export async function editQuickText(text) {
  try {
    // 打开文本编辑窗口
    await invoke('open_text_editor_window');

    // 准备编辑数据
    const editorData = {
      type: 'quick-text',
      id: text.id,
      title: text.title,
      content: text.content,
      groupId: text.group_name || text.groupId || '',
      timestamp: text.timestamp
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

// 保存常用文本
export async function saveQuickText() {
  const title = quickTextTitleInput.value.trim();
  const content = quickTextContentInput.value.trim();
  const groupId = quickTextGroupSelect.value;

  if (!title || !content) {
    showAlertModal('提示', '请填写标题和内容');
    return;
  }

  try {
    // 直接传递分组名称
    const finalGroupName = groupId || '全部';

    if (editingQuickTextId) {
      // 更新
      await invoke('update_quick_text', {
        id: editingQuickTextId,
        title,
        content,
        groupName: finalGroupName
      });
    } else {
      // 添加
      await invoke('add_quick_text', {
        title,
        content,
        groupName: finalGroupName
      });
    }

    hideQuickTextModal();
    await refreshQuickTexts();

    // 显示成功提示
    const action = editingQuickTextId ? '更新' : '创建';
    showNotification(`${action}常用文本成功`, 'success');
  } catch (error) {
    console.error('保存常用文本失败:', error);
    // 如果后端还没有分组功能，回退到原来的方式
    try {
      if (editingQuickTextId) {
        await invoke('update_quick_text', {
          id: editingQuickTextId,
          title,
          content,
          groupName: null
        });
      } else {
        await invoke('add_quick_text', {
          title,
          content,
          groupName: null
        });
      }
      hideQuickTextModal();
      await refreshQuickTexts();

      // 显示成功提示
      const action = editingQuickTextId ? '更新' : '创建';
      showNotification(`${action}常用文本成功`, 'success');
    } catch (fallbackError) {
      console.error('保存常用文本失败（回退）:', fallbackError);
      showNotification('保存失败，请重试', 'error');
    }
  }
}

// 删除常用文本
export async function deleteQuickText(id) {
  showConfirmModal('确认删除', '确定要删除这个常用文本吗？', async () => {
    try {
      await invoke('delete_quick_text', { id });
      await refreshQuickTexts();
      showNotification('已删除常用文本', 'success');
    } catch (error) {
      console.error('删除常用文本失败:', error);
      showNotification('删除失败，请重试', 'error');
    }
  });
}

// 计算在目标分组内的正确位置
function calculateTargetPositionInGroup(filteredData, newIndex, targetGroupId) {
  // 找到目标分组在filteredData中的所有项目
  const targetGroupItems = [];
  let targetIndexInGroup = 0;

  for (let i = 0; i < filteredData.length; i++) {
    const item = filteredData[i];
    const itemGroupId = item.group_name || 'all';

    if (itemGroupId === targetGroupId) {
      targetGroupItems.push({ item, originalIndex: i });

      // 如果当前索引小于等于newIndex，说明目标位置在这个项目之后
      if (i <= newIndex) {
        targetIndexInGroup = targetGroupItems.length;
      }
    }
  }

  return Math.max(0, Math.min(targetIndexInGroup - 1, targetGroupItems.length - 1));
}

// 更新常用文本顺序
export async function updateQuickTextsOrder(oldIndex, newIndex) {
  try {
    const filteredData = getFilteredQuickTextsData();

    if (oldIndex >= filteredData.length || newIndex >= filteredData.length) {
      return;
    }

    const movedItem = filteredData[oldIndex];
    const targetItem = filteredData[newIndex];

    if (!movedItem || !movedItem.id) {
      return;
    }

    // 在"全部"分组中，检查是否跨分组拖拽
    const currentGroupId = getCurrentGroupId();
    if (currentGroupId === '全部') {
      const movedItemGroupId = movedItem.group_name || '全部';
      const targetItemGroupId = targetItem ? (targetItem.group_name || '全部') : movedItemGroupId;

      if (movedItemGroupId !== targetItemGroupId) {
        // 跨分组拖拽：将项目移动到目标分组并排序到正确位置
        try {
          // 计算在目标分组内的正确位置
          const targetPositionInGroup = calculateTargetPositionInGroup(filteredData, newIndex, targetItemGroupId);

          // 先移动到目标分组
          await invoke('move_quick_text_to_group', {
            id: movedItem.id,
            groupName: targetItemGroupId
          });

          // 在目标分组内排序到特定位置
          await invoke('move_quick_text_item', {
            itemId: movedItem.id,
            toIndex: targetPositionInGroup
          });

          // 显示成功提示
          const { getGroups } = await import('./groups.js');
          const groups = getGroups();
          const targetGroupName = groups.find(g => g.id === targetItemGroupId)?.name || '分组';
          const { showNotification } = await import('./notificationManager.js');
          showNotification(`已移动到 ${targetGroupName}`, 'success');

          await refreshQuickTexts();
          return;
        } catch (error) {
          console.error('跨分组移动失败:', error);
          const { showNotification } = await import('./notificationManager.js');
          showNotification('移动到分组失败，请重试', 'error');
          return;
        }
      }
    }

    // 同分组内的排序
    const movedItemGroupId = movedItem.group_name || '全部';
    let targetIndexInGroup = newIndex;

    if (currentGroupId === '全部') {
      targetIndexInGroup = calculateTargetPositionInGroup(filteredData, newIndex, movedItemGroupId);
    }

    await invoke('move_quick_text_item', {
      itemId: movedItem.id,
      toIndex: targetIndexInGroup
    });

    await refreshQuickTexts();

  } catch (error) {
    console.error('更新常用文本顺序失败:', error);
    await refreshQuickTexts();
  }
}

// 设置常用文本功能
export function setupQuickTexts() {
  // 添加按钮 - 仍然使用模态框
  document.getElementById('add-quick-text-btn').addEventListener('click', () => {
    showQuickTextModal();
  });

  // 模态框关闭按钮
  document.getElementById('modal-close-btn').addEventListener('click', hideQuickTextModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', hideQuickTextModal);

  // 保存按钮
  document.getElementById('modal-save-btn').addEventListener('click', saveQuickText);

  // 在模态框中按Enter键保存
  quickTextTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveQuickText();
    }
  });

  quickTextContentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      saveQuickText();
    }
  });

  // 点击遮罩关闭模态框
  quickTextModal.addEventListener('click', (e) => {
    if (e.target === quickTextModal) {
      hideQuickTextModal();
    }
  });
}

// 初始化常用文本虚拟列表
function initQuickTextsVirtualList() {
  if (quickTextsVirtualList) {
    quickTextsVirtualList.destroy();
  }

  quickTextsVirtualList = new VirtualList({
    scrollId: 'quick-texts-list',
    contentId: 'quick-texts-content',
    data: getFilteredQuickTextsData(),
    renderItem: generateQuickTextItemHTML,
    onSort: updateQuickTextsOrder,
    onItemClick: handleQuickTextItemClick,
    onItemContextMenu: handleQuickTextItemContextMenu,
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
  if (!window.quickTextsModule) {
    window.quickTextsModule = {};
  }
  window.quickTextsModule.quickTextsVirtualList = quickTextsVirtualList;
}

// 获取过滤后的常用文本数据
function getFilteredQuickTextsData() {
  const searchTerm = quickTextsSearch.value.toLowerCase();
  const filterType = currentQuickTextsFilter;
  const currentGroupId = getCurrentGroupId();

  let filteredTexts = quickTexts.filter(text => {
    const contentType = text.content_type || 'text';

    // 类型筛选
    if (!matchesFilter(contentType, filterType, text)) {
      return false;
    }

    // 搜索筛选
    return matchesSearch(text, searchTerm, contentType);
  });

  // 如果是"全部"分组，按分组顺序重新排列数据
  if (currentGroupId === '全部') {
    filteredTexts = sortTextsByGroupOrder(filteredTexts);
  }

  return filteredTexts;
}

// 按分组顺序排列文本数据
function sortTextsByGroupOrder(texts) {
  try {
    // 获取分组顺序
    const groupsOrder = getGroups();

    // 按group_name分组
    const textsByGroup = {};
    texts.forEach(text => {
      const groupId = text.group_name || 'all';
      if (!textsByGroup[groupId]) {
        textsByGroup[groupId] = [];
      }
      textsByGroup[groupId].push(text);
    });

    // 按分组顺序合并
    const sortedTexts = [];
    groupsOrder.forEach(group => {
      if (textsByGroup[group.id]) {
        // 每个分组内的数据已经是按顺序的（从数据库获取时）
        sortedTexts.push(...textsByGroup[group.id]);
      }
    });

    // 添加任何不在分组列表中的文本（防止遗漏）
    Object.keys(textsByGroup).forEach(groupId => {
      if (!groupsOrder.find(g => g.id === groupId)) {
        sortedTexts.push(...textsByGroup[groupId]);
      }
    });

    return sortedTexts;
  } catch (error) {
    console.warn('按分组顺序排列失败，使用原始顺序:', error);
    return texts;
  }
}


// 检查文件是否存在并更新UI
async function checkFilesExistence() {
  const fileItems = document.querySelectorAll('#quick-texts-list .file-item[data-path]');
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

export function renderQuickTexts() {
  if (!quickTextsVirtualList) {
    initQuickTextsVirtualList();
  } else {
    const filteredData = getFilteredQuickTextsData();
    quickTextsVirtualList.updateData(filteredData);
  }

  // 异步检查文件是否存在
  setTimeout(() => {
    checkFilesExistence();
  }, 0);

  // 通知导航模块列表已更新
  import('./navigation.js').then(module => {
    module.onListUpdate();
  }).catch(() => { });
}

// 处理常用文本项目点击事件
function handleQuickTextItemClick(index, event) {
  if (isDragging) return;

  // 获取过滤后的数据，因为虚拟列表使用的是过滤后的数据
  const filteredData = getFilteredQuickTextsData();
  const text = filteredData[index];
  if (!text) return;

  // 处理主要的点击事件（粘贴）
  const quickTextItem = event.target.closest('.quick-text-item');
  handleQuickTextItemPaste(text, quickTextItem);
}

// 处理常用文本项目右键菜单
function handleQuickTextItemContextMenu(index, event) {
  event.preventDefault();

  // 获取过滤后的数据，因为虚拟列表使用的是过滤后的数据
  const filteredData = getFilteredQuickTextsData();
  const text = filteredData[index];
  if (text) {
    showQuickTextContextMenu(event, text);
  }
}



// 处理常用文本项目粘贴
async function handleQuickTextItemPaste(text, element = null) {
  try {
    if (element) element.classList.add('paste-loading');
    showNotification('正在粘贴...', 'info');

    // 调用后端统一粘贴接口
    await invoke('paste_content', {
      params: { quick_text_id: text.id }
    });

    // 一次性粘贴：删除该项
    if (isOneTimePaste) {
      setTimeout(async () => {
        await invoke('delete_quick_text', { id: text.id });
        await refreshQuickTexts();
      }, 100);
    }

    if (element) element.classList.remove('paste-loading');
    showNotification('粘贴成功', 'success', 1500);
  } catch (error) {
    console.error('粘贴常用文本失败:', error);
    if (element) element.classList.remove('paste-loading');
    showNotification('粘贴失败', 'error', 2000);
  }
}



// 显示常用文本右键菜单
function showQuickTextContextMenu(event, text) {
  // 直接使用后端返回的content_type字段
  const contentType = text.content_type || 'text';
  let menuItems = [];

  if (contentType === 'image') {
    // 图片类型菜单
    menuItems = [
      {
        icon: 'ti-pin',
        text: '钉到屏幕',
        onClick: async () => {
          await pinImageToScreen(text);
        }
      },
      {
        icon: 'ti-download',
        text: '另存为图片',
        onClick: () => {
          saveImageAs(text);
        }
      },
      {
        icon: 'ti-trash',
        text: '删除',
        style: { color: '#ff4d4f' },
        onClick: () => {
          deleteQuickText(text.id);
        }
      }
    ];
  } else if (contentType === 'file') {
    // 文件类型菜单
    menuItems = [
      {
        icon: 'ti-external-link',
        text: '使用默认程序打开',
        onClick: () => {
          openFileWithDefaultProgram(text);
        }
      },
      {
        icon: 'ti-folder-open',
        text: '打开文件位置',
        onClick: () => {
          openFileLocation(text);
        }
      },
      {
        icon: 'ti-copy',
        text: '复制文件路径',
        onClick: () => {
          copyFilePaths(text);
        }
      },
      {
        icon: 'ti-trash',
        text: '删除',
        style: { color: '#ff4d4f' },
        onClick: () => {
          deleteQuickText(text.id);
        }
      }
    ];
  } else {
    // 文本、链接和富文本类型菜单
    menuItems = [
      {
        icon: 'ti-edit',
        text: contentType === 'rich_text' ? '编辑纯文本' : '编辑',
        onClick: () => {
          editQuickText(text);
        }
      },
      {
        icon: 'ti-trash',
        text: '删除',
        style: { color: '#ff4d4f' },
        onClick: () => {
          deleteQuickText(text.id);
        }
      }
    ];
  }

  showContextMenu(event, {
    content: text.content,
    html_content: text.html_content,
    content_type: contentType,
    items: menuItems
  });
}



// 钉图片到屏幕
async function pinImageToScreen(text) {
  try {
    // 获取图片文件路径
    const filePath = await window.__TAURI__.core.invoke('get_image_file_path', { 
      content: text.content 
    });
    
    if (!filePath) {
      showNotification('获取图片路径失败', 'error');
      return;
    }
    
    // 创建贴图窗口
    await window.__TAURI__.core.invoke('pin_image_from_file', { 
      filePath 
    });
    
    showNotification('已钉到屏幕', 'success', 2000);
  } catch (error) {
    console.error('钉图到屏幕失败:', error);
    showNotification('钉图失败: ' + error, 'error');
  }
}

// 另存为图片
async function saveImageAs(text) {
  try {
    if (!text.content.startsWith('data:image/') && !text.content.startsWith('image:')) {
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
      content: text.content,
      filePath: filePath
    });

    showNotification('图片已保存', 'success');
  } catch (error) {
    console.error('保存图片失败:', error);
    showNotification('保存图片失败', 'error');
  }
}
// 使用默认程序打开文件
async function openFileWithDefaultProgram(text) {
  try {
    const filesJson = text.content.substring(6); // 去掉 "files:" 前缀
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
// 打开文件位置
async function openFileLocation(text) {
  try {
    const filesJson = text.content.substring(6); // 去掉 "files:" 前缀
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

// 复制文件路径
async function copyFilePaths(text) {
  try {
    const filesJson = text.content.substring(6); // 去掉 "files:" 前缀
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
  renderQuickTexts();
});

// 加载图片（用于虚拟列表的图片懒加载）
export async function loadImageById(imgElement, imageId) {
  try {
    const filePath = await invoke('get_image_file_path', { content: `image:${imageId}` });
    const assetUrl = convertFileSrc(filePath, 'asset');
    imgElement.src = assetUrl;
  } catch (error) {
    console.error('加载图片失败:', error);
    imgElement.alt = '图片加载失败';
    imgElement.style.backgroundColor = '#ffebee';
    imgElement.style.color = '#c62828';
    imgElement.textContent = '图片加载失败';
  }
}

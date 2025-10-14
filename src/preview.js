
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createFileIconElement } from './js/fileIconUtils.js';
import { initDisableBrowserShortcuts } from './js/utils/disableBrowserShortcuts.js';

// =================== 启动横幅 ===================
function printPreviewBanner() {
  console.log('');
  console.log('███╗   ███╗ ██████╗ ███████╗██╗  ██╗███████╗███╗   ██╗ ██████╗ ');
  console.log('████╗ ████║██╔═══██╗██╔════╝██║  ██║██╔════╝████╗  ██║██╔════╝ ');
  console.log('██╔████╔██║██║   ██║███████╗███████║█████╗  ██╔██╗ ██║██║  ███╗');
  console.log('██║╚██╔╝██║██║   ██║╚════██║██╔══██║██╔══╝  ██║╚██╗██║██║   ██║');
  console.log('██║ ╚═╝ ██║╚██████╔╝███████║██║  ██║███████╗██║ ╚████║╚██████╔╝');
  console.log('╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝ ╚═════╝ ');
  console.log('');
  console.log('Preview Window - 预览窗口');
  console.log('Author: MoSheng | QuickClipboard v1.0.0');
  console.log('Preview window initializing...');
  console.log('');
}
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});
// 全局状态
let clipboardHistory = [];
let currentIndex = 0;
let previewList = null;
let previewSettings = {
  itemsCount: 5,
  autoPaste: true,
  scrollSound: true,
  scrollSoundPath: 'sounds/roll.mp3'
};
// 当前数据源状态
let currentDataSource = {
  tab: 'clipboard',
  groupId: 'clipboard'
};

// 设置取消按钮
function setupCancelButton() {
  const cancelBtn = document.getElementById('preview-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();

      console.log('用户点击取消按钮');

      try {
        // 调用后端取消预览命令
        await invoke('cancel_preview');
      } catch (error) {
        console.error('取消预览失败:', error);
      }
    });
  }
}

// 加载预览设置
async function loadPreviewSettings() {
  try {
    const settings = await invoke('get_settings');
    previewSettings = {
      itemsCount: settings.previewItemsCount || 5,
      autoPaste: settings.previewAutoPaste !== false,
      scrollSound: settings.previewScrollSound !== false,
      scrollSoundPath: settings.previewScrollSoundPath || 'sounds/roll.mp3'
    };
    // console.log('预览设置已加载:', previewSettings);
  } catch (error) {
    console.error('加载预览设置失败:', error);
    // 使用默认设置
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 输出启动横幅
  printPreviewBanner();

  // 禁用浏览器默认快捷键
  initDisableBrowserShortcuts();

  // console.log('预览窗口开始初始化');
  previewList = document.getElementById('preview-list');

  if (!previewList) {
    console.error('预览列表元素未找到');
    return;
  }

  // console.log('预览列表元素找到:', previewList);

  // 设置取消按钮事件
  setupCancelButton();

  // 加载预览设置
  await loadPreviewSettings();

  // 监听后端事件
  await setupEventListeners();

  // 初始化数据 - 根据主窗口当前状态
  await initializeDataSource();

  // console.log('预览窗口初始化完成');
});

// 设置事件监听器
async function setupEventListeners() {
  // 监听剪贴板历史更新
  await listen('clipboard-history-updated', async () => {
    // 只有当前数据源是剪贴板历史时才刷新
    if (currentDataSource.tab === 'clipboard') {
      await refreshClipboardHistory();
    }
  });

  // 监听设置变更
  await listen('settings-changed', async () => {
    // console.log('检测到设置变更，重新加载预览设置');
    await loadPreviewSettings();
    // 重新渲染以应用新设置
    renderPreviewItems();
  });

  // 监听滚动事件
  await listen('preview-scroll', (event) => {
    const { direction, newIndex } = event.payload;
    // console.log('收到滚动事件:', direction, 'newIndex:', newIndex);

    if (typeof newIndex === 'number') {
      const oldIndex = currentIndex;
      currentIndex = newIndex;
      renderPreviewItems(); // 重新渲染预览项

      // 播放滚动音效（只有当索引真正改变时）
      if (oldIndex !== currentIndex && previewSettings.scrollSound) {
        // console.log('播放滚动音效 - 索引从', oldIndex, '变为', currentIndex);
        playScrollSound();
      }
    } else {
      handleScroll(direction);
    }
  });

  // 监听索引更新事件
  await listen('preview-index-changed', (event) => {
    const newIndex = event.payload.index;
    updateActiveIndex(newIndex);
  });

  // 监听数据源切换事件
  await listen('preview-source-changed', async (event) => {
    const { tab, groupId } = event.payload;

    // 重置索引
    currentIndex = 0;

    // 根据数据源刷新数据
    await refreshDataSource(tab, groupId);
  });
}

// 初始化数据源 - 根据主窗口当前状态
async function initializeDataSource() {
  try {
    // 获取主窗口当前状态
    const currentState = await invoke('get_main_window_state');

    if (currentState && currentState.tab && currentState.groupId) {
      // 根据主窗口状态初始化
      await refreshDataSource(currentState.tab, currentState.groupId);
    } else {
      // 默认显示剪贴板历史
      currentDataSource = { tab: 'clipboard', groupId: 'clipboard' };
      await refreshClipboardHistory();
    }
  } catch (error) {
    await refreshClipboardHistory();
  }
}

// 刷新剪贴板历史
async function refreshClipboardHistory() {
  try {
    // console.log('开始获取剪贴板历史');
    const history = await invoke('get_clipboard_history');
    // console.log('获取到剪贴板历史:', history);
    clipboardHistory = history || [];
    currentIndex = 0;
    // console.log('准备渲染预览列表，项目数量:', clipboardHistory.length);
    renderPreviewList();
  } catch (error) {
    console.error('获取剪贴板历史失败:', error);
    showEmptyState();
  }
}

// 根据数据源刷新数据
async function refreshDataSource(tab, groupId) {
  try {
    // 更新当前数据源状态
    currentDataSource = { tab, groupId };

    let statusText = '';

    if (tab === 'clipboard') {
      // 剪贴板历史
      const history = await invoke('get_clipboard_history');
      clipboardHistory = history || [];
      statusText = '剪贴板历史';
    } else if (tab === 'quick-texts') {
      // 常用文本
      if (groupId === 'all' || groupId === 'clipboard' || groupId === '全部') {
        // 获取所有常用文本
        const quickTexts = await invoke('get_quick_texts');
        clipboardHistory = quickTexts || [];
        statusText = '常用文本 - 全部';
      } else {
        // 获取指定分组的常用文本
        try {
          const quickTexts = await invoke('get_quick_texts_by_group', { groupName: groupId });
          clipboardHistory = quickTexts || [];

          // 获取分组名称
          try {
            const groups = await invoke('get_groups');
            const group = groups.find(g => g.id === groupId);
            statusText = group ? `常用文本 - ${group.name}` : `常用文本 - ${groupId}`;
          } catch (error) {
            statusText = `常用文本 - ${groupId}`;
          }
        } catch (error) {
          const quickTexts = await invoke('get_quick_texts');
          clipboardHistory = quickTexts || [];
          statusText = '常用文本 - 全部';
        }
      }
    }

    // 更新状态指示器
    updateStatusIndicator(statusText);

    // 重置索引
    currentIndex = 0;

    // 重新渲染
    renderPreviewList();
  } catch (error) {
    console.error('刷新预览数据源失败:', error);
    showEmptyState();
  }
}

// 更新状态指示器
function updateStatusIndicator(text) {
  const statusElement = document.getElementById('preview-status');
  if (statusElement) {
    statusElement.textContent = text;
  }
}

// 渲染预览列表
function renderPreviewList() {
  // console.log('开始渲染预览列表');
  if (!previewList) {
    console.error('预览列表元素不存在');
    return;
  }

  previewList.innerHTML = '';

  if (clipboardHistory.length === 0) {
    // console.log('剪贴板历史为空，显示空状态');
    showEmptyState();
    return;
  }

  // 渲染预览项目
  renderPreviewItems();
  // console.log('预览列表渲染完成');
}

// 渲染预览项目（支持动态数量）
function renderPreviewItems() {
  if (!previewList) return;

  previewList.innerHTML = '';

  if (clipboardHistory.length === 0) {
    showEmptyState();
    return;
  }

  const itemsCount = previewSettings.itemsCount;
  const halfCount = Math.floor(itemsCount / 2);

  // 计算显示范围
  let startIndex = Math.max(0, currentIndex - halfCount);
  let endIndex = Math.min(clipboardHistory.length - 1, startIndex + itemsCount - 1);

  // 如果末尾不够，调整开始位置
  if (endIndex - startIndex + 1 < itemsCount) {
    startIndex = Math.max(0, endIndex - itemsCount + 1);
  }

  // 渲染项目
  for (let i = startIndex; i <= endIndex; i++) {
    let itemClass = 'preview-item';

    if (i === currentIndex) {
      itemClass += ' current active';
    } else if (i < currentIndex) {
      itemClass += ' prev';
    } else {
      itemClass += ' next';
    }

    const item = createPreviewItem(clipboardHistory[i], i, itemClass.includes('current') ? 'current' : (itemClass.includes('prev') ? 'prev' : 'next'));
    previewList.appendChild(item);
  }

  // 如果项目不足，添加占位符
  const renderedCount = endIndex - startIndex + 1;
  for (let i = renderedCount; i < itemsCount; i++) {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-item placeholder';
    previewList.appendChild(placeholder);
  }
}

// 创建预览项
function createPreviewItem(item, index, position = 'current') {
  const previewItem = document.createElement('div');
  previewItem.className = `preview-item ${position}`;
  if (position === 'current') {
    previewItem.classList.add('active');
  }
  previewItem.dataset.index = index;

  // 所有项目都使用 content
  const itemText = item.content || '';
  const isQuickText = !!item.title; // 判断是否为常用文本
  // 直接使用后端返回的content_type字段
  const contentType = item.content_type || 'text';

  // 添加序号指示器
  const indexIndicator = document.createElement('div');
  indexIndicator.className = 'item-index-indicator';
  indexIndicator.textContent = (index + 1).toString();

  // 添加内容类型指示器
  const typeIndicator = document.createElement('div');
  typeIndicator.className = 'content-type-indicator';

  if (contentType === 'image') {
    typeIndicator.textContent = '图片';

    // 创建图片预览
    const imgElement = document.createElement('img');
    imgElement.className = 'preview-image';

    if (item.image_id) {
      loadImageById(imgElement, item.image_id);
    } else if (itemText.startsWith('image:')) {
      const imageId = itemText.substring(6);
      loadImageById(imgElement, imageId);
    } else if (itemText.startsWith('data:image/')) {
      imgElement.src = itemText;
    }

    const textElement = document.createElement('div');
    textElement.className = 'preview-image-text';
    textElement.textContent = '图片内容';

    previewItem.appendChild(imgElement);
    previewItem.appendChild(textElement);
  } else if (contentType === 'file') {
    // 解析文件数据
    try {
      const filesJson = itemText.substring(6); // 去掉 "files:" 前缀
      const filesData = JSON.parse(filesJson);

      if (filesData.files && filesData.files.length > 0) {
        const firstFile = filesData.files[0];
        const fileName = firstFile.name || firstFile.path.split(/[/\\]/).pop() || '未知文件';
        const totalFiles = filesData.files.length;

        // 设置类型指示器，包含文件数量信息
        if (totalFiles > 1) {
          typeIndicator.textContent = `文件 (${totalFiles})`;
        } else {
          typeIndicator.textContent = '文件';
        }

        // 创建文件显示容器
        const fileContainer = document.createElement('div');
        fileContainer.className = 'preview-file-container';

        // 文件图标 - 使用工具函数
        const fileIcon = createFileIconElement(firstFile, 'medium');
        fileIcon.className = 'preview-file-icon';

        const fileInfo = document.createElement('div');
        fileInfo.className = 'preview-file-info';

        const fileNameElement = document.createElement('div');
        fileNameElement.className = 'preview-file-name';
        fileNameElement.textContent = fileName;

        fileInfo.appendChild(fileNameElement);

        fileContainer.appendChild(fileIcon);
        fileContainer.appendChild(fileInfo);
        previewItem.appendChild(fileContainer);
      } else {
        // 解析失败时的回退显示
        const textElement = document.createElement('div');
        textElement.className = 'preview-text';
        textElement.textContent = '文件数据';
        previewItem.appendChild(textElement);
      }
    } catch (e) {
      // 解析失败时的回退显示
      const textElement = document.createElement('div');
      textElement.className = 'preview-text';
      textElement.textContent = '文件数据';
      previewItem.appendChild(textElement);
    }
  } else if (contentType === 'link') {
    typeIndicator.textContent = '链接';

    const textElement = document.createElement('div');
    textElement.className = 'preview-text preview-link';
    textElement.textContent = itemText;

    previewItem.appendChild(textElement);
  } else {
    typeIndicator.textContent = isQuickText ? '常用' : '文本';

    // 统一显示内容，不显示标题
    const textElement = document.createElement('div');
    textElement.className = 'preview-text';
    textElement.textContent = itemText;
    previewItem.appendChild(textElement);
  }

  previewItem.appendChild(typeIndicator);
  previewItem.appendChild(indexIndicator);

  return previewItem;
}


// 根据图片ID加载图片
async function loadImageById(imgElement, imageId) {
  try {
    const filePath = await invoke('get_image_file_path', { content: `image:${imageId}` });
    const assetUrl = convertFileSrc(filePath, 'asset');
    imgElement.src = assetUrl;
  } catch (error) {
    console.error('加载图片失败:', error);
    imgElement.alt = '图片加载失败';
    imgElement.style.backgroundColor = '#333';
  }
}

// 处理滚动
function handleScroll(direction) {
  // 如果历史为空，不处理滚动
  if (clipboardHistory.length === 0) {
    return;
  }

  const maxIndex = Math.min(clipboardHistory.length - 1, previewSettings.itemsCount - 1);
  const oldIndex = currentIndex;

  if (direction === 'up') {
    if (currentIndex <= 0) {
      // 到达顶部，循环到底部
      currentIndex = maxIndex;
    } else {
      currentIndex = currentIndex - 1;
    }
  } else if (direction === 'down') {
    if (currentIndex >= maxIndex) {
      // 到达底部，循环到顶部
      currentIndex = 0;
    } else {
      currentIndex = currentIndex + 1;
    }
  }

  // 播放滚动音效（只有当索引真正改变时）
  if (oldIndex !== currentIndex && previewSettings.scrollSound) {
    playScrollSound();
  }

  updateActiveIndex(currentIndex);

  // 通知后端当前索引
  invoke('set_preview_index', { index: currentIndex }).catch(console.error);
}

// 播放滚动音效
async function playScrollSound() {
  try {
    await invoke('play_scroll_sound');
  } catch (error) {
    console.error('播放滚动音效失败:', error);
  }
}

// 更新活动索引
function updateActiveIndex(index) {
  currentIndex = index;
  renderPreviewItems(); // 重新渲染预览项，当前项始终激活
}

// 显示空状态
function showEmptyState() {
  if (!previewList) return;

  previewList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <div>剪贴板历史为空</div>
    </div>
  `;
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', async () => {
  // 禁用浏览器默认快捷键
  initDisableBrowserShortcuts();

  // 初始化主题管理器
  const { initThemeManager } = await import('./js/themeManager.js');
  initThemeManager();

  await loadPreviewSettings();
  await setupEventListeners();
  await initializeDataSource();
});


import '@tabler/icons-webfont/dist/tabler-icons.min.css';

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Window } from '@tauri-apps/api/window';
import { showNotification } from './js/notificationManager.js';
import { initDisableBrowserShortcuts } from './js/utils/disableBrowserShortcuts.js';
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});
// 当前窗口实例
const currentWindow = new Window('text-editor');

// 全局状态
let originalData = null;
let hasUnsavedChanges = false;

// DOM 元素
let editorTitle;
let titleGroup;
let titleInput;
let groupSelector;
let groupSelect;
let editorTextarea;
let charCount;
let lineCount;
let wordWrapBtn;
let resetBtn;
let cancelBtn;
let saveBtn;
let loadingOverlay;
let statusText;

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
  console.log('文本编辑器初始化...');

  // 禁用浏览器默认快捷键
  initDisableBrowserShortcuts();

  // 初始化DOM引用
  initDOMReferences();

  // 应用主题
  await applyTheme();

  // 设置主题变化监听
  await setupThemeListener();

  // 设置事件监听器
  setupEventListeners();

  // 监听来自主窗口的数据
  await setupDataListener();

  // 设置窗口控制
  setupWindowControls();

  // 设置默认自动换行
  setDefaultWordWrap();

  // 自动获得焦点
  await setAutoFocus();

  console.log('文本编辑器初始化完成');
});

// 应用主题
async function applyTheme() {
  try {
    // 获取主题设置
    const settings = await invoke('get_settings');
    const theme = settings.theme || 'light';

    // 应用主题到文档
    document.documentElement.setAttribute('data-theme', theme);

    console.log('已应用主题:', theme);
  } catch (error) {
    console.error('应用主题失败:', error);
    // 默认使用浅色主题
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

// 监听主题变化
async function setupThemeListener() {
  try {
    const { listen } = await import('@tauri-apps/api/event');

    // 监听主题变化事件
    await listen('theme-changed', async (event) => {
      const newTheme = event.payload;
      console.log('收到主题变化事件:', newTheme);

      // 应用新主题
      document.documentElement.setAttribute('data-theme', newTheme);
    });

    console.log('主题变化监听器已设置');
  } catch (error) {
    console.error('设置主题监听器失败:', error);
  }
}

// 设置默认自动换行
function setDefaultWordWrap() {
  if (editorTextarea && wordWrapBtn) {
    // 默认启用自动换行
    editorTextarea.classList.add('word-wrap');
    wordWrapBtn.classList.add('active');
    console.log('已启用默认自动换行');
  }
}

// 设置自动获得焦点
async function setAutoFocus() {
  try {
    // 首先设置窗口焦点
    await currentWindow.setFocus();
    console.log('窗口已获得焦点');

    if (editorTextarea) {
      // 使用 setTimeout 确保在DOM完全渲染后获得焦点
      setTimeout(() => {
        editorTextarea.focus();

        // 将光标移动到文本末尾
        const textLength = editorTextarea.value.length;
        editorTextarea.setSelectionRange(textLength, textLength);

        console.log('编辑器文本框已自动获得焦点');
      }, 100);
    }
  } catch (error) {
    console.error('设置焦点失败:', error);

    // 如果窗口焦点设置失败，仍然尝试设置文本框焦点
    if (editorTextarea) {
      setTimeout(() => {
        editorTextarea.focus();
        const textLength = editorTextarea.value.length;
        editorTextarea.setSelectionRange(textLength, textLength);
        console.log('编辑器文本框已获得焦点（窗口焦点设置失败）');
      }, 100);
    }
  }
}

// 初始化DOM元素引用
function initDOMReferences() {
  editorTitle = document.getElementById('editor-title');
  titleGroup = document.getElementById('title-group');
  titleInput = document.getElementById('title-input');
  groupSelector = document.getElementById('group-selector');
  groupSelect = document.getElementById('group-select');
  editorTextarea = document.getElementById('editor-textarea');
  charCount = document.getElementById('char-count');
  lineCount = document.getElementById('line-count');
  wordWrapBtn = document.getElementById('word-wrap-btn');
  resetBtn = document.getElementById('reset-btn');
  cancelBtn = document.getElementById('cancel-btn');
  saveBtn = document.getElementById('save-btn');
  loadingOverlay = document.getElementById('loading-overlay');
  statusText = document.getElementById('status-text');
}

// 设置事件监听器
function setupEventListeners() {
  // 文本区域事件
  editorTextarea.addEventListener('input', handleTextChange);
  editorTextarea.addEventListener('keydown', handleKeyDown);

  // 标题输入框事件
  if (titleInput) {
    titleInput.addEventListener('input', handleTitleChange);
  }

  // 分组选择事件
  if (groupSelect) {
    groupSelect.addEventListener('change', handleGroupChange);
  }

  // 工具栏按钮
  wordWrapBtn.addEventListener('click', toggleWordWrap);
  resetBtn.addEventListener('click', resetToOriginal);

  // 操作按钮
  cancelBtn.addEventListener('click', handleCancel);
  saveBtn.addEventListener('click', handleSave);

  // 防止意外关闭
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// 监听来自主窗口的数据
async function setupDataListener() {
  try {
    await listen('editor-data', (event) => {
      console.log('收到编辑数据:', event.payload);
      loadEditorData(event.payload);
    });
    console.log('数据监听器设置完成');
  } catch (error) {
    console.error('设置数据监听器失败:', error);
  }
}

// 设置窗口控制
function setupWindowControls() {
  // 最小化按钮
  const minimizeBtn = document.getElementById('minimize-btn');
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', async () => {
      try {
        await currentWindow.minimize();
      } catch (error) {
        console.error('最小化窗口失败:', error);
      }
    });
  }

  // 最大化按钮
  const maximizeBtn = document.getElementById('maximize-btn');
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', async () => {
      try {
        await currentWindow.toggleMaximize();

        // 更新按钮图标
        const icon = maximizeBtn.querySelector('i');
        const isMaximized = await currentWindow.isMaximized();

        if (isMaximized) {
          icon.className = 'ti ti-copy'; // 恢复图标
          maximizeBtn.title = '恢复';
        } else {
          icon.className = 'ti ti-square'; // 最大化图标
          maximizeBtn.title = '最大化';
        }
      } catch (error) {
        console.error('切换最大化状态失败:', error);
      }
    });
  }

  // 关闭按钮
  const closeBtn = document.getElementById('close-editor');
  if (closeBtn) {
    closeBtn.addEventListener('click', handleCancel);
  }
}

// 加载编辑器数据
async function loadEditorData(data) {
  originalData = data;

  // 判断编辑类型
  const isQuickText = data.type === 'quick-text';

  // 设置标题
  if (isQuickText) {
    editorTitle.textContent = '编辑常用文本';
    // 显示标题和分组选择器
    titleGroup.style.display = 'flex';
    groupSelector.style.display = 'flex';

    // 设置标题
    titleInput.value = data.title || '';

    // 加载分组列表
    await loadGroups();

    // 设置当前分组
    if (data.groupId) {
      groupSelect.value = data.groupId;
    }
  } else {
    editorTitle.textContent = `编辑剪贴板项目 #${(data.index || 0) + 1}`;
    // 隐藏标题和分组选择器
    titleGroup.style.display = 'none';
    groupSelector.style.display = 'none';
  }

  // 设置编辑器内容
  editorTextarea.value = data.content || '';

  // 更新统计信息
  updateStats();

  // 重置未保存状态
  hasUnsavedChanges = false;
  updateSaveButton();
  updateStatus('就绪');

  // 聚焦到编辑器
  editorTextarea.focus();

  console.log('编辑器数据加载完成', { type: isQuickText ? 'quick-text' : 'clipboard', data });
}

// 处理文本变化
function handleTextChange() {
  updateStats();

  // 检查是否有未保存的更改
  const currentContent = editorTextarea.value;
  const originalContentText = originalData ? originalData.content : '';
  const currentTitle = titleInput ? titleInput.value : '';
  const originalTitle = originalData ? originalData.title || '' : '';

  hasUnsavedChanges = currentContent !== originalContentText || currentTitle !== originalTitle;

  updateSaveButton();
  updateStatus(hasUnsavedChanges ? '已修改' : '就绪');
}

// 处理标题变化
function handleTitleChange() {
  handleTextChange(); // 复用文本变化逻辑
}

// 处理分组变化
function handleGroupChange() {
  hasUnsavedChanges = true;
  updateSaveButton();
  updateStatus('已修改');
}

// 处理键盘事件
function handleKeyDown(e) {
  // Ctrl+S 保存
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    handleSave();
  }

  // Ctrl+Z 撤销（浏览器默认行为）
  // Ctrl+Y 重做（浏览器默认行为）

  // Escape 取消
  if (e.key === 'Escape') {
    handleCancel();
  }
}

// 更新统计信息
function updateStats() {
  const text = editorTextarea.value;
  const charLength = text.length;
  const lineLength = text.split('\n').length;

  charCount.textContent = `${charLength} 字符`;
  lineCount.textContent = `${lineLength} 行`;
}

// 切换自动换行
function toggleWordWrap() {
  const isWrapped = editorTextarea.classList.toggle('word-wrap');
  wordWrapBtn.classList.toggle('active', isWrapped);
  wordWrapBtn.title = isWrapped ? '取消自动换行' : '启用自动换行';
}

// 加载分组列表
async function loadGroups() {
  try {
    const groups = await invoke('get_groups');

    // 清空现有选项
    groupSelect.innerHTML = '<option value="">选择分组</option>';

    // 添加分组选项
    groups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.name;
      option.textContent = group.name;
      groupSelect.appendChild(option);
    });

  } catch (error) {
    console.error('加载分组失败:', error);
  }
}

// 更新状态文本
function updateStatus(text) {
  if (statusText) {
    statusText.textContent = text;
  }
}

// 重置为原始内容
function resetToOriginal() {
  if (originalData) {
    editorTextarea.value = originalData.content || '';
    if (titleInput && originalData.title) {
      titleInput.value = originalData.title;
    }
    if (groupSelect && originalData.groupId) {
      groupSelect.value = originalData.groupId;
    }
    updateStats();
    hasUnsavedChanges = false;
    updateSaveButton();
    updateStatus('已重置');
    showNotification('已重置为原始内容', 'info');
  }
}

// 更新保存按钮状态
function updateSaveButton() {
  saveBtn.disabled = !hasUnsavedChanges;
}

// 处理取消
async function handleCancel() {
  if (hasUnsavedChanges) {
    const shouldClose = confirm('有未保存的更改，确定要关闭吗？');
    if (!shouldClose) {
      return;
    }
  }

  try {
    await currentWindow.close();
  } catch (error) {
    console.error('关闭窗口失败:', error);
  }
}

// 处理保存
async function handleSave() {
  if (!originalData) {
    showNotification('没有可保存的数据', 'error');
    return;
  }

  const newContent = editorTextarea.value;
  const isQuickText = originalData.type === 'quick-text';

  // 定义变量用于后续使用
  let finalGroupId = '';

  // 显示加载状态
  showLoading(true);
  updateStatus('保存中...');

  try {
    if (isQuickText) {
      // 保存常用文本
      const newTitle = titleInput.value.trim();
      const newGroupId = groupSelect.value;

      if (!newTitle) {
        showNotification('请输入标题', 'error');
        return;
      }

      // 确保分组名称不为空，如果为空则使用原来的分组或默认值
      finalGroupId = newGroupId || originalData.groupId || '全部';

      console.log('保存常用文本:', {
        id: originalData.id,
        title: newTitle,
        originalGroupId: originalData.groupId,
        newGroupId: newGroupId,
        finalGroupId: finalGroupId
      });

      await invoke('update_quick_text', {
        id: originalData.id,
        title: newTitle,
        content: newContent,
        groupName: finalGroupId
      });

      // 通知主窗口刷新常用文本
      await invoke('emit_quick_texts_updated');

    } else {
      // 保存剪贴板内容
      await invoke('update_clipboard_item', {
        id: originalData.id,
        content: newContent
      });

      // 通知主窗口刷新数据
      await invoke('emit_clipboard_updated');
    }

    showNotification('保存成功', 'success');
    updateStatus('保存成功');

    // 更新原始数据
    originalData.content = newContent;
    if (isQuickText) {
      originalData.title = titleInput.value.trim();
      originalData.groupId = finalGroupId;
    }

    hasUnsavedChanges = false;
    updateSaveButton();

    // 延迟关闭窗口
    setTimeout(async () => {
      try {
        await currentWindow.close();
      } catch (error) {
        console.error('关闭窗口失败:', error);
      }
    }, 1000);

  } catch (error) {
    console.error('保存失败:', error);
    showNotification(`保存失败: ${error}`, 'error');
    updateStatus('保存失败');
  } finally {
    showLoading(false);
  }
}

// 显示/隐藏加载状态
function showLoading(show) {
  loadingOverlay.style.display = show ? 'flex' : 'none';
  saveBtn.disabled = show;
  cancelBtn.disabled = show;
}



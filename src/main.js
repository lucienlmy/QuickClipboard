// 主入口文件 - 协调各个模块

// =================== 启动横幅 ===================
function printStartupBanner() {
  console.log('');
  console.log('███╗   ███╗ ██████╗ ███████╗██╗  ██╗███████╗███╗   ██╗ ██████╗ ');
  console.log('████╗ ████║██╔═══██╗██╔════╝██║  ██║██╔════╝████╗  ██║██╔════╝ ');
  console.log('██╔████╔██║██║   ██║███████╗███████║█████╗  ██╔██╗ ██║██║  ███╗');
  console.log('██║╚██╔╝██║██║   ██║╚════██║██╔══██║██╔══╝  ██║╚██╗██║██║   ██║');
  console.log('██║ ╚═╝ ██║╚██████╔╝███████║██║  ██║███████╗██║ ╚████║╚██████╔╝');
  console.log('╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝ ╚═════╝ ');
  console.log('');
  console.log('QuickClipboard v1.0.0 - 快速剪贴板管理工具');
  console.log('Author: MoSheng | Frontend: JavaScript + Vite');
  console.log('Main window initializing...');
  console.log('');
}

import { initThemeManager } from './js/themeManager.js';
import './js/fileIconUtils.js';
import './js/utils/htmlProcessor.js';
import { initNavigation, initShortcutsHelpPanel } from './js/navigation.js';
import { invoke } from '@tauri-apps/api/core';
import {
  initDOMReferences,
  setCurrentFilter,
  setCurrentQuickTextsFilter,
  setIsOneTimePaste,
  setQuickTextsCustomFilter,
  setContentCustomFilter,
  searchInput,
  contentFilter,
  contentFilterContainer,
  quickTextsSearch,
  quickTextsFilter,
  quickTextsFilterContainer,
  oneTimePasteButton,
  isOneTimePaste
} from './js/config.js';
import { getCurrentWindow } from '@tauri-apps/api/window';

// 筛选tabs容器
let filterTabsContainer;
let filterTabsIndicator;
let filterTabsResizeTimer;
// 自定义菜单
import { CustomSelect } from './js/customSelect.js';
let quickTextsCustomFilter;
let contentCustomFilter;

import {
  initAiTranslation
} from './js/aiTranslation.js';

import {
  refreshClipboardHistory,
  filterClipboardItems,
  renderClipboardItems
} from './js/clipboard.js';

import {
  setupVirtualScrollScrolling
} from './js/utils/highlight.js';

import {
  refreshQuickTexts,
  filterQuickTexts,
  setupQuickTexts,
  renderQuickTexts
} from './js/quickTexts.js';



import {
  setupTabSwitching,
  setupConfirmModal,
  setupAlertModal
} from './js/ui.js';

import {
  setupClipboardEventListener,
  setupTrayEventListeners,
  setupContextMenuDisable,
  setupCustomWindowDrag
} from './js/events.js';


import { initInputFocusManagement } from './js/focus.js';
import { setupWindowControls } from './js/window.js';
import { initGroups } from './js/groups.js';
import { initScreenshot } from './js/screenshot.js';
import { initToolsPanel, updateFormatButtonStatus } from './js/toolsPanel.js';
import { initTitlebarDrag } from './js/titlebarDrag.js';

import { initExternalScrollbars } from './js/scrollbar.js';
import { initSidebarHover } from './js/sidebarHover.js';
import {
  initializeSettingsManager,
  initializeTheme,
  setupThemeListener,
  updateShortcutDisplay
} from './js/settingsManager.js';
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});
// 等待后端初始化完成
async function waitForBackendInitialization() {
  let attempts = 0;
  const maxAttempts = 30; // 最多等待3秒

  while (attempts < maxAttempts) {
    try {
      const isInitialized = await invoke('is_backend_initialized');
      if (isInitialized) {
        return;
      }
    } catch (error) {
      // 静默处理错误
    }

    // 等待时间50ms
    await new Promise(resolve => setTimeout(resolve, 50));
    attempts++;
  }
}

// 更新一次性粘贴按钮状态
function updateOneTimePasteButtonState() {
  if (oneTimePasteButton) {
    if (isOneTimePaste) {
      oneTimePasteButton.classList.add('active');
    } else {
      oneTimePasteButton.classList.remove('active');
    }
  }
}

// 初始化应用
async function initApp() {

  // 设置自定义窗口拖拽
  setupCustomWindowDrag();

  // 设置窗口动画监听器
  setupWindowAnimationListeners();

  // 等待后端初始化完成，然后获取数据
  await waitForBackendInitialization();

  // 输出启动横幅
  printStartupBanner();

  // 初始化DOM元素引用
  initDOMReferences();

  // 初始化设置管理器
  await initializeSettingsManager();

  // 更新快捷键显示
  updateShortcutDisplay();

  // 初始化主题管理器（必须等待完成）
  await initThemeManager();

  // 初始化主题（同步主题管理器的状态）
  initializeTheme();

  // 设置主题监听器
  setupThemeListener();

  // 初始化分组功能（必须在常用文本之前）
  await initGroups();

  // 初始化侧边栏悬停延迟功能
  initSidebarHover();

  // 预先初始化虚拟列表，让用户立即看到界面结构
  renderClipboardItems();
  renderQuickTexts();

  // 初始化外置滚动条（不占内容空间）
  initExternalScrollbars();

  // 并行获取数据，提高加载速度
  const dataPromise = Promise.all([
    refreshClipboardHistory(),
    refreshQuickTexts()
  ]);

  // 数据获取完成后自动更新显示（refreshClipboardHistory和refreshQuickTexts内部会调用render函数）
  await dataPromise;
  // 数据渲染后刷新外置滚动条
  if (window.refreshExternalScrollbars) window.refreshExternalScrollbars();

  // 设置搜索功能
  searchInput.addEventListener('input', filterClipboardItems);
  quickTextsSearch.addEventListener('input', filterQuickTexts);

  // 初始化默认筛选状态
  if (!localStorage.getItem('clipboard-current-filter')) {
    localStorage.setItem('clipboard-current-filter', 'all');
  }
  if (!localStorage.getItem('quicktexts-current-filter')) {
    localStorage.setItem('quicktexts-current-filter', 'all');
  }

  // 初始化筛选标签
  setupExternalFilterTabs();
  // 确保创建筛选指示器并定位
  ensureFilterTabsIndicator();
  requestAnimationFrame(moveFilterTabsIndicator);

  // 自定义下拉菜单
  const rowHeightOptions = [
    { value: 'row-height-large', text: '大' },
    { value: 'row-height-medium', text: '中' },
    { value: 'row-height-small', text: '小' }
  ];
  
  // 文件样式选项
  const fileStyleOptions = [
    { value: 'file-style-detailed', text: '详细信息' },
    { value: 'file-style-icons-only', text: '仅图标' }
  ];
  
  if (contentFilterContainer) {
    contentCustomFilter = new CustomSelect(contentFilterContainer, {
      isMenuType: true,
      enableHover: true,
      options: [
        { value: 'row-height', text: '行高', children: rowHeightOptions },
        { value: 'file-style', text: '文件样式', children: fileStyleOptions }
      ],
      placeholder: '行高'
    });
    setContentCustomFilter(contentCustomFilter);
  }
  if (quickTextsFilterContainer) {
    quickTextsCustomFilter = new CustomSelect(quickTextsFilterContainer, {
      isMenuType: true,
      enableHover: true,
      options: [
        { value: 'row-height', text: '行高', children: rowHeightOptions },
        { value: 'file-style', text: '文件样式', children: fileStyleOptions }
      ],
      placeholder: '行高'
    });
    setQuickTextsCustomFilter(quickTextsCustomFilter);
  }

  // 延迟触发筛选状态同步，确保初始高亮正确显示
  setTimeout(() => {
    // 获取当前筛选状态并触发更新
    const clipboardFilter = localStorage.getItem('clipboard-current-filter') || 'all';
    const quickTextsFilter = localStorage.getItem('quicktexts-current-filter') || 'all';

    // 同步到外置筛选按钮高亮
    updateFilterTabsActiveState(getActiveTabName(), getActiveTabName() === 'clipboard' ? clipboardFilter : quickTextsFilter);
  }, 200);

  // 设置一次性粘贴按钮
  if (oneTimePasteButton) {
    oneTimePasteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const newState = !isOneTimePaste;
      setIsOneTimePaste(newState);
      updateOneTimePasteButtonState();
    });
    // 初始化按钮状态
    updateOneTimePasteButtonState();
  }

  // 初始化AI翻译功能
  await initAiTranslation();

  // 设置文件图标刷新事件监听器
  setupFileIconRefreshListener();

  // 设置虚拟滚动监听，处理动态加载内容的自动滚动
  setupVirtualScrollScrolling();

  // 设置标签页切换
  setupTabSwitching();

  // 设置常用文本功能
  setupQuickTexts();

  // 监听窗口尺寸变化，平滑更新筛选指示器位置
  window.addEventListener('resize', () => {
    clearTimeout(filterTabsResizeTimer);
    filterTabsResizeTimer = setTimeout(() => requestAnimationFrame(moveFilterTabsIndicator), 120);
  });

  // 绑定标签切换时刷新筛选tab高亮
  window.addEventListener('tab-switched', (e) => {
    try {
      const tabName = e?.detail?.tabName || getActiveTabName();
      const filterValue = tabName === 'clipboard'
        ? (localStorage.getItem('clipboard-current-filter') || 'all')
        : (localStorage.getItem('quicktexts-current-filter') || 'all');
      updateFilterTabsActiveState(tabName, filterValue);
      requestAnimationFrame(moveFilterTabsIndicator);
    } catch (_) { }
  });

  // 设置UI模态框
  setupConfirmModal();
  setupAlertModal();



  // 设置窗口控制按钮
  setupWindowControls();

  // 监听剪贴板变化事件
  setupClipboardEventListener();

  // 监听托盘事件
  setupTrayEventListeners();

  // 设置键盘快捷键
  // setupKeyboardShortcuts();



  // 初始化输入框焦点管理
  initInputFocusManagement();

  // 初始化导航系统
  await initNavigation();

  // 初始化快捷键帮助面板
  initShortcutsHelpPanel();

  // 初始化截屏功能
  initScreenshot();

  // 初始化工具面板
  initToolsPanel();

  // 初始化标题栏拖拽功能
  initTitlebarDrag();

  // 设置右键菜单禁用
  setupContextMenuDisable();

  // 监听常用文本刷新事件
  window.addEventListener('refreshQuickTexts', refreshQuickTexts);

  // 监听分组变化事件
  window.addEventListener('groupChanged', refreshQuickTexts);

  // 设置窗口可见性监听器
  setupWindowVisibilityListener();

  // 设置窗口大小和位置监听器
  setupWindowSizeAndPositionListeners();

}

// 设置窗口可见性监听器
function setupWindowVisibilityListener() {
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', () => {
    updateShortcutDisplay();
    if (!document.hidden) {
      // 页面变为可见时，更新快捷键显示
      updateShortcutDisplay();
    }
  });

  // 监听窗口焦点事件
  window.addEventListener('focus', () => {
    // 窗口获得焦点时，更新快捷键显示
    updateShortcutDisplay();
  });
}

// 设置窗口动画监听器
async function setupWindowAnimationListeners() {
  try {
    // console.log('开始设置窗口动画监听器...');
    const { listen } = await import('@tauri-apps/api/event');

    // 监听窗口显示动画事件
    await listen('window-show-animation', () => {
      // console.log('收到窗口显示动画事件');
      playWindowShowAnimation();
    });

    // 监听窗口隐藏动画事件
    await listen('window-hide-animation', () => {
      // console.log('收到窗口隐藏动画事件');
      playWindowHideAnimation();
    });

    // console.log('窗口动画监听器设置完成');
    
    // 前端动画初始化完成后，恢复贴边隐藏状态
    await restoreEdgeSnapOnStartup();
  } catch (error) {
    console.error('设置窗口动画监听器失败:', error);
  }
}

// 恢复贴边隐藏状态
async function restoreEdgeSnapOnStartup() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('restore_edge_snap_on_startup');
  } catch (error) {
    console.error('恢复贴边隐藏状态失败:', error);
  }
}

// 播放窗口显示动画
async function playWindowShowAnimation() {
  const container = document.querySelector('body');
  if (!container) return;

  // 重置动画状态
  container.classList.remove('window-hide-animation', 'window-show-animation');

  // 强制重绘
  container.offsetHeight;

  // 添加显示动画类
  container.classList.add('window-show-animation');
}

// 播放窗口隐藏动画
async function playWindowHideAnimation() {
  const container = document.querySelector('body');
  if (!container) return;

  // 重置动画状态
  container.classList.remove('window-hide-animation', 'window-show-animation');

  // 强制重绘
  container.offsetHeight;

  // 添加隐藏动画类
  container.classList.add('window-hide-animation');
}

// 设置文件图标刷新事件监听器
async function setupFileIconRefreshListener() {
  const { listen } = await import('@tauri-apps/api/event');

  // 监听文件图标刷新完成事件
  await listen('file-icons-refreshed', async (event) => {
    console.log(`文件图标刷新完成，更新了 ${event.payload} 个项目，正在重新加载数据...`);

    // 重新加载剪贴板历史和常用文本
    await refreshClipboardHistory();
    await refreshQuickTexts();

    console.log('数据重新加载完成');
  });
}

// 设置窗口大小和位置监听器
function setupWindowSizeAndPositionListeners() {
  let resizeTimeout;
  let moveTimeout;

  // 监听窗口大小变化
  window.addEventListener('resize', async () => {
    // 使用防抖，避免频繁调用
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(async () => {
      try {
        // 获取当前设置
        const settings = await invoke('get_settings');
        if (settings.rememberWindowSize) {
          // 获取当前窗口大小
          const size = await getCurrentWindow().outerSize();
          // 保存窗口大小
          await invoke('save_window_size', {
            width: size.width,
            height: size.height
          });
          console.log('窗口大小已保存:', size.width, 'x', size.height);
        }
      } catch (error) {
        console.error('保存窗口大小失败:', error);
      }
    }, 500); // 500ms防抖
  });

  // 监听窗口位置变化（仅在记住位置模式下）
  let lastPosition = null;

  // 定期检查窗口位置变化
  setInterval(async () => {
    try {
      const settings = await invoke('get_settings');
      if (settings.windowPositionMode === 'remember') {
        const position = await getCurrentWindow().outerPosition();
        // 检查位置是否发生变化
        if (lastPosition &&
          (lastPosition.x !== position.x || lastPosition.y !== position.y)) {
          // 使用防抖
          clearTimeout(moveTimeout);
          moveTimeout = setTimeout(async () => {
            try {
              console.log(position.x, position.y)
              await invoke('save_window_position', {
                x: position.x,
                y: position.y
              });
              console.log('窗口位置已保存:', position.x, ',', position.y);
            } catch (error) {
              console.error('保存窗口位置失败:', error);
            }
          }, 500);
        }

        lastPosition = position;
      }
    } catch (error) {
      // 静默处理错误，避免控制台噪音
    }
  }, 1000); // 每秒检查一次位置变化
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
  // 初始化应用
  initApp();
});

// 获取当前激活标签名
function getActiveTabName() {
  const activeBtn = document.querySelector('.tab-button.active');
  return activeBtn ? activeBtn.dataset.tab : 'clipboard';
}

// 初始化并绑定外置筛选标签
function setupExternalFilterTabs() {
  filterTabsContainer = document.getElementById('filter-tabs');
  if (!filterTabsContainer) return;

  const buttons = Array.from(filterTabsContainer.querySelectorAll('.filter-tab'));
  const applyActive = (tabName, value) => updateFilterTabsActiveState(tabName, value);

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.getAttribute('data-filter');
      const tabName = getActiveTabName();

      if (tabName === 'clipboard') {
        setCurrentFilter(value);
        localStorage.setItem('clipboard-current-filter', value);
        filterClipboardItems();
        window.dispatchEvent(new CustomEvent('filter-changed', { detail: { type: 'clipboard', value } }));
      } else {
        setCurrentQuickTextsFilter(value);
        localStorage.setItem('quicktexts-current-filter', value);
        filterQuickTexts();
        window.dispatchEvent(new CustomEvent('filter-changed', { detail: { type: 'quicktexts', value } }));
      }

      applyActive(tabName, value);
    });
  });

  // 初始高亮
  const initTab = getActiveTabName();
  const initValue = initTab === 'clipboard'
    ? (localStorage.getItem('clipboard-current-filter') || 'all')
    : (localStorage.getItem('quicktexts-current-filter') || 'all');
  applyActive(initTab, initValue);
  // 初始化指示器位置
  requestAnimationFrame(moveFilterTabsIndicator);
}

// 更新外置筛选按钮的高亮状态
function updateFilterTabsActiveState(tabName, value) {
  if (!filterTabsContainer) return;
  const buttons = Array.from(filterTabsContainer.querySelectorAll('.filter-tab'));
  buttons.forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === value));

  // 移动筛选滑动指示器
  moveFilterTabsIndicator();
}

// 创建筛选tabs滑动指示器
function ensureFilterTabsIndicator() {
  if (!filterTabsContainer) return null;
  if (!filterTabsIndicator) {
    filterTabsIndicator = document.createElement('div');
    filterTabsIndicator.className = 'filter-tabs-indicator';
    filterTabsContainer.appendChild(filterTabsIndicator);
  }
  return filterTabsIndicator;
}

// 将指示器移动到当前激活的筛选按钮
function moveFilterTabsIndicator() {
  if (!filterTabsContainer) return;
  const indicator = ensureFilterTabsIndicator();
  const active = filterTabsContainer.querySelector('.filter-tab.active') || filterTabsContainer.querySelector('.filter-tab');
  if (!indicator || !active) return;
  const left = active.offsetLeft;
  const width = active.offsetWidth;
  const height = active.offsetHeight;
  indicator.style.left = left + 'px';
  indicator.style.width = width + 'px';
  indicator.style.height = height + 'px';
  indicator.style.opacity = '1';
}


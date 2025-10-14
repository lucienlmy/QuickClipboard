// 主入口文件 - 协调各个模块

import '@tabler/icons-webfont/dist/tabler-icons.min.css';

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
import { initShortcutDisplay } from './js/shortcutDisplay.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
  isOneTimePaste
} from './js/config.js';
import { getCurrentWindow } from '@tauri-apps/api/window';

let cachedSettings = null;
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
import { initGroups } from './js/groups.js';
import { initToolsPanel, updateFormatButtonStatus } from './js/toolsPanel.js';
import { initTitlebarDrag } from './js/titlebarDrag.js';
import { initToolManager } from './js/toolManager.js';
import { initMusicPlayer } from './musicPlayer/index.js';
import { autoUpdater } from './js/autoUpdater.js';

import { initExternalScrollbars } from './js/scrollbar.js';
import { initSidebarHover } from './js/sidebarHover.js';
import {
  initializeSettingsManager,
  initializeTheme,
  setupThemeListener,
  updateShortcutDisplay
} from './settings/js/settingsManager.js';
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});
// 等待后端初始化完成
async function waitForBackendInitialization() {
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      const isInitialized = await invoke('is_backend_initialized');
      if (isInitialized) {
        return;
      }
    } catch (error) {
    }

    await new Promise(resolve => setTimeout(resolve, 50));
    attempts++;
  }
}


// 初始化应用
async function initApp() {

  // 设置自定义窗口拖拽
  setupCustomWindowDrag();

  // 设置窗口动画监听器
  const { setupWindowAnimationListeners, setupAnimationFallback } = await import('./js/windowAnimation.js');
  setupWindowAnimationListeners();
  setupAnimationFallback();

  // 等待后端初始化完成，然后获取数据
  await waitForBackendInitialization();

  // 输出启动横幅
  printStartupBanner();

  // 初始化DOM元素引用
  initDOMReferences();

  // 初始化设置管理器
  await initializeSettingsManager();

  // 初始化设置缓存
  try {
    cachedSettings = await invoke('get_settings');
  } catch (error) {
    console.error('初始化设置缓存失败:', error);
  }

  // 监听设置变化事件，更新缓存
  await listen('settings-changed', (event) => {
    cachedSettings = event.payload;
  });

  // 初始化快捷键显示
  await initShortcutDisplay();

  // 更新快捷键显示
  updateShortcutDisplay();

  // 初始化主题管理器（必须等待完成）
  await initThemeManager();

  // 初始化主题
  await initializeTheme();

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

  // 数据获取完成后自动更新显示
  await dataPromise;

  // 从localStorage恢复筛选状态到config.js
  const savedClipboardFilter = localStorage.getItem('clipboard-current-filter') || 'all';
  setCurrentFilter(savedClipboardFilter);
  const savedQuickTextsFilter = localStorage.getItem('quicktexts-current-filter') || 'all';
  setCurrentQuickTextsFilter(savedQuickTextsFilter);

  // 根据持久化的筛选状态，在初始加载时就过滤列表
  filterClipboardItems();
  filterQuickTexts();

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


  // 初始化统一工具管理器
  initToolManager();

  // 初始化工具面板
  initToolsPanel();
  
  // 初始化音频播放器
  initMusicPlayer();

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

  // 启动时自动检查更新
  autoUpdater.autoCheckOnStartup();

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

  // 监听窗口大小变化
  window.addEventListener('resize', async () => {
    // 使用防抖，避免频繁调用
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(async () => {
      try {
        // 使用缓存的设置
        if (cachedSettings && cachedSettings.rememberWindowSize) {
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



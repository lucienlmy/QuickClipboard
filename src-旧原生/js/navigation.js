import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { togglePin } from './window.js';

// 导航状态
let currentSelectedIndex = -1;
let navigationMode = false;
let currentTabItems = [];
let isKeyboardNavigation = false; // 标记是否正在使用键盘导航
let keyboardNavigationTimeout = null; // 键盘导航超时定时器
let isScrolling = false; // 标记是否正在滚动
let scrollTimeout = null; // 滚动超时定时器

// 节流相关变量
let lastNavigationTime = 0;
let navigationThrottleDelay = 16;
let pendingNavigationUpdate = null;
let isUpdating = false;
let clickSyncSetup = false;
let preserveNavigationOnUpdate = false;

// 鼠标悬停优化变量
let hoverDebounceTimeout = null;
let lastHoverIndex = -1;
let cachedTabItems = null;
let cacheInvalidationTimeout = null;

// 分组侧边栏状态
let isGroupSidebarVisible = false;
let ctrlPressed = false;

// 快捷键帮助面板状态
let footer = null;
let shortcutsHelpContent = null;
let shortcutsHelpClose = null;
let isFirstLaunch = false;

// 初始化导航系统
export async function initNavigation() {
  try {

    // 监听导航动作事件
    await listen('navigation-action', (event) => {
      handleNavigationAction(event.payload);
    });

    // 设置点击同步
    setupClickSync();

    // 设置搜索框键盘事件监听
    setupSearchBoxKeyboardEvents();
  } catch (error) {
    console.error('初始化导航系统失败:', error);
  }
}

// 处理导航动作事件
  function handleNavigationAction(actionEvent) {
    const action = actionEvent.action;
    
  switch (action) {
    case 'navigate-up':
      handleThrottledNavigation('up');
      break;
    case 'navigate-down':
      handleThrottledNavigation('down');
      break;
    case 'tab-left':
      handleTabSwitch('left');
      break;
    case 'tab-right':
      handleTabSwitch('right');
      break;
    case 'focus-search':
      focusSearchBox();
      break;
    case 'hide-window':
      hideWindow();
      break;
    case 'execute-item':
      executeCurrentItem();
      break;
    case 'previous-group':
      switchToPreviousGroup();
      showGroupSidebarTemporarily();
      break;
    case 'next-group':
      switchToNextGroup();
      showGroupSidebarTemporarily();
      break;
    case 'toggle-pin':
      togglePin();
      break;
  }
}


// 节流处理导航按键
function handleThrottledNavigation(key) {
  const now = Date.now();

  // 如果距离上次导航时间太短，则延迟执行
  if (now - lastNavigationTime < navigationThrottleDelay) {
    // 取消之前的延迟执行
    if (pendingNavigationUpdate) {
      clearTimeout(pendingNavigationUpdate);
    }

    // 设置延迟执行
    pendingNavigationUpdate = setTimeout(() => {
      executeNavigation(key);
      pendingNavigationUpdate = null;
    }, navigationThrottleDelay - (now - lastNavigationTime));
  } else {
    // 立即执行
    executeNavigation(key);
  }
}

// 执行导航操作
function executeNavigation(key) {
  lastNavigationTime = Date.now();

  switch (key) {
    case 'up':
    case 'ArrowUp':
      navigateUp();
      break;
    case 'down':
    case 'ArrowDown':
      navigateDown();
      break;
  }
}


// 临时显示分组侧边栏1秒
let groupSidebarTimer = null;

function showGroupSidebarTemporarily() {
  const sidebar = document.getElementById('groups-sidebar');
  if (!sidebar) return;

  // 如果侧边栏已经固定，不需要临时显示
  if (sidebar.classList.contains('pinned')) return;

  // 显示侧边栏
  sidebar.classList.add('show');
  isGroupSidebarVisible = true;

  // 清除之前的定时器
  if (groupSidebarTimer) {
    clearTimeout(groupSidebarTimer);
  }

  // 设置0.5秒后自动隐藏
  groupSidebarTimer = setTimeout(() => {
    if (sidebar && !sidebar.classList.contains('pinned')) {
      sidebar.classList.remove('show');
      isGroupSidebarVisible = false;
    }
    groupSidebarTimer = null;
  }, 500);
}

// 切换到上一个分组
function switchToPreviousGroup() {
  // 确保在常用文本标签页
  const activeTab = document.querySelector('.tab-button.active');
  if (!activeTab || activeTab.dataset.tab !== 'quick-texts') {
    // 切换到常用文本标签页
    const quickTextsTab = document.querySelector('[data-tab="quick-texts"]');
    if (quickTextsTab) {
      quickTextsTab.click();
    }
  }

  // 获取分组列表
  const groupItems = document.querySelectorAll('.group-item');
  if (groupItems.length === 0) return;

  // 找到当前激活的分组
  let currentGroupIndex = -1;
  groupItems.forEach((item, index) => {
    if (item.classList.contains('active')) {
      currentGroupIndex = index;
    }
  });

  // 切换到上一个分组
  let previousGroupIndex;
  if (currentGroupIndex <= 0) {
    previousGroupIndex = groupItems.length - 1; // 循环到最后一个
  } else {
    previousGroupIndex = currentGroupIndex - 1;
  }

  // 点击目标分组
  if (groupItems[previousGroupIndex]) {
    groupItems[previousGroupIndex].click();
  }
}

// 切换到下一个分组
function switchToNextGroup() {
  // 确保在常用文本标签页
  const activeTab = document.querySelector('.tab-button.active');
  if (!activeTab || activeTab.dataset.tab !== 'quick-texts') {
    // 切换到常用文本标签页
    const quickTextsTab = document.querySelector('[data-tab="quick-texts"]');
    if (quickTextsTab) {
      quickTextsTab.click();
    }
  }

  // 获取分组列表
  const groupItems = document.querySelectorAll('.group-item');
  if (groupItems.length === 0) return;

  // 找到当前激活的分组
  let currentGroupIndex = -1;
  groupItems.forEach((item, index) => {
    if (item.classList.contains('active')) {
      currentGroupIndex = index;
    }
  });

  // 切换到下一个分组
  let nextGroupIndex;
  if (currentGroupIndex >= groupItems.length - 1) {
    nextGroupIndex = 0; // 循环到第一个
  } else {
    nextGroupIndex = currentGroupIndex + 1;
  }

  // 点击目标分组
  if (groupItems[nextGroupIndex]) {
    groupItems[nextGroupIndex].click();
  }
}



// 处理标签页切换
function handleTabSwitch(key) {
  const tabs = document.querySelectorAll('.tab-button');
  if (tabs.length === 0) return;

  // 找到当前激活的标签页
  let currentTabIndex = -1;
  tabs.forEach((tab, index) => {
    if (tab.classList.contains('active')) {
      currentTabIndex = index;
    }
  });

  if (currentTabIndex === -1) return;

  let nextTabIndex;
  if (key === 'left' || key === 'ArrowLeft') {
    // 向左切换，循环到最后一个
    nextTabIndex = currentTabIndex === 0 ? tabs.length - 1 : currentTabIndex - 1;
  } else if (key === 'right' || key === 'ArrowRight') {
    // 向右切换，循环到第一个
    nextTabIndex = currentTabIndex === tabs.length - 1 ? 0 : currentTabIndex + 1;
  }

  // 点击目标标签页来切换
  if (nextTabIndex !== undefined && tabs[nextTabIndex]) {
    tabs[nextTabIndex].click();
    // 重置导航状态，因为切换了标签页
    resetNavigation();
  }
}

// 获取当前标签页的项目列表（DOM元素）
function getCurrentTabItems() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return [];

  if (activeTab.id === 'clipboard-tab') {
    return Array.from(activeTab.querySelectorAll('.clipboard-item'));
  } else if (activeTab.id === 'quick-texts-tab') {
    return Array.from(activeTab.querySelectorAll('.quick-text-item'));
  }

  return [];
}

// 获取当前标签页的项目列表（带缓存优化）
function getCurrentTabItemsOptimized() {
  // 如果缓存有效，直接返回缓存
  if (cachedTabItems && cachedTabItems.length > 0) {
    return cachedTabItems;
  }
  
  // 否则重新查询并缓存
  cachedTabItems = getCurrentTabItems();
  
  // 设置缓存失效定时器（100ms后清除缓存，确保DOM更新后能获取到最新元素）
  if (cacheInvalidationTimeout) {
    clearTimeout(cacheInvalidationTimeout);
  }
  cacheInvalidationTimeout = setTimeout(() => {
    cachedTabItems = null;
    cacheInvalidationTimeout = null;
  }, 100);
  
  return cachedTabItems;
}

// 获取当前标签页的数据长度
function getCurrentTabDataLength() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return 0;

  if (activeTab.id === 'clipboard-tab') {
    // 获取剪贴板虚拟列表实例
    const clipboardModule = window.clipboardModule;
    if (clipboardModule && clipboardModule.clipboardVirtualList) {
      return clipboardModule.clipboardVirtualList.getDataLength();
    }
  } else if (activeTab.id === 'quick-texts-tab') {
    // 获取常用文本虚拟列表实例
    const quickTextsModule = window.quickTextsModule;
    if (quickTextsModule && quickTextsModule.quickTextsVirtualList) {
      return quickTextsModule.quickTextsVirtualList.getDataLength();
    }
  }

  return 0;
}

// 获取当前标签页的虚拟列表实例
function getCurrentVirtualList() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return null;

  if (activeTab.id === 'clipboard-tab') {
    const clipboardModule = window.clipboardModule;
    return clipboardModule && clipboardModule.clipboardVirtualList ? clipboardModule.clipboardVirtualList : null;
  } else if (activeTab.id === 'quick-texts-tab') {
    const quickTextsModule = window.quickTextsModule;
    return quickTextsModule && quickTextsModule.quickTextsVirtualList ? quickTextsModule.quickTextsVirtualList : null;
  }

  return null;
}

// 向上导航
function navigateUp() {
  const dataLength = getCurrentTabDataLength();
  if (dataLength === 0) return;

  // 设置键盘导航标记
  setKeyboardNavigationMode();

  const oldIndex = currentSelectedIndex;

  if (currentSelectedIndex === -1) {
    currentSelectedIndex = dataLength - 1;
  } else if (currentSelectedIndex <= 0) {
    currentSelectedIndex = dataLength - 1;
  } else {
    currentSelectedIndex--;
  }

  if (oldIndex !== currentSelectedIndex) {
    updateSelection();
    navigationMode = true;
  }
}

// 向下导航
function navigateDown() {
  const dataLength = getCurrentTabDataLength();
  if (dataLength === 0) return;

  // 设置键盘导航标记
  setKeyboardNavigationMode();

  const oldIndex = currentSelectedIndex;

  if (currentSelectedIndex === -1) {
    currentSelectedIndex = 0;
  } else if (currentSelectedIndex >= dataLength - 1) {
    currentSelectedIndex = 0;
  } else {
    currentSelectedIndex++;
  }

  if (oldIndex !== currentSelectedIndex) {
    updateSelection();
    navigationMode = true;
  }
}

// 更新选择状态
function updateSelection() {
  if (isUpdating) return;
  isUpdating = true;

  const virtualList = getCurrentVirtualList();
  const dataLength = getCurrentTabDataLength();

  // 确保索引在有效范围内
  if (currentSelectedIndex < 0 || currentSelectedIndex >= dataLength) {
    isUpdating = false;
    return;
  }

  requestAnimationFrame(() => {
    // 使用缓存的DOM查询结果
    const items = getCurrentTabItemsOptimized();
    let targetElementExists = false;
    let targetElement = null;

    // 优化：只遍历一次，同时检查存在性和获取元素
    for (const item of items) {
      const dataIndex = parseInt(item.getAttribute('data-index'));
      if (dataIndex === currentSelectedIndex) {
        targetElementExists = true;
        targetElement = item;
        break;
      }
    }

    // 只有当目标元素不存在时才滚动
    let didScroll = false;
    if (!targetElementExists && virtualList) {
      didScroll = virtualList.scrollToIndex(currentSelectedIndex);
    }

    // 定义更新选择状态的函数
    const updateSelectionState = () => {
      const items = getCurrentTabItemsOptimized();
      let selectedItem = null;

      // 批量处理DOM更新，减少重排重绘
      const toAdd = [];
      const toRemove = [];

      // 优化：预先分类需要添加和移除类的元素
      for (const item of items) {
        const dataIndex = parseInt(item.getAttribute('data-index'));
        const hasSelected = item.classList.contains('keyboard-selected');
        
        if (dataIndex === currentSelectedIndex) {
          if (!hasSelected) {
            toAdd.push(item);
          }
          selectedItem = item;
        } else if (hasSelected) {
          toRemove.push(item);
        }
      }

      // 批量移除类
      toRemove.forEach(item => item.classList.remove('keyboard-selected'));
      // 批量添加类
      toAdd.forEach(item => item.classList.add('keyboard-selected'));

      // 如果找到了选中的元素但不在视口内，进行微调滚动
      if (selectedItem && !isElementInViewport(selectedItem)) {
        selectedItem.scrollIntoView({
          behavior: 'instant',
          block: 'nearest',
          inline: 'nearest'
        });
      }

      isUpdating = false;
    };

    // 根据目标元素是否存在决定处理方式
    if (targetElementExists) {
      // 目标元素已存在，立即更新选择状态
      updateSelectionState();
    } else if (didScroll) {
      // 发生了滚动，给虚拟列表时间渲染
      setTimeout(() => updateSelectionState(), 16);
    } else {
      // 没有滚动但目标元素不存在，可能需要等待渲染
      setTimeout(() => updateSelectionState(), 8);
    }
  });
}

// 检查元素是否在视口内
function isElementInViewport(element) {
  const rect = element.getBoundingClientRect();
  const container = element.closest('.clipboard-list, .quick-texts-list');

  if (!container) return false;

  const containerRect = container.getBoundingClientRect();
  const buffer = 20; // 20像素的缓冲区域

  return (
    rect.top >= (containerRect.top - buffer) &&
    rect.bottom <= (containerRect.bottom + buffer)
  );
}

// 执行当前选中项
async function executeCurrentItem() {
  const dataLength = getCurrentTabDataLength();
  if (currentSelectedIndex < 0 || currentSelectedIndex >= dataLength) return;

  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;

  try {
    // 设置标志以保持导航状态
    preserveNavigationOnUpdate = true;

    if (activeTab.id === 'clipboard-tab') {
      // 对于剪贴板，调用虚拟列表的点击处理函数
      const clipboardModule = window.clipboardModule;
      if (clipboardModule && clipboardModule.clipboardVirtualList && clipboardModule.clipboardVirtualList.onItemClick) {
        // 创建一个模拟的事件对象
        const mockEvent = {
          target: { closest: () => null },
          stopPropagation: () => { },
          preventDefault: () => { }
        };
        clipboardModule.clipboardVirtualList.onItemClick(currentSelectedIndex, mockEvent);
      }
    } else if (activeTab.id === 'quick-texts-tab') {
      // 对于常用文本，调用虚拟列表的点击处理函数
      const quickTextsModule = window.quickTextsModule;
      if (quickTextsModule && quickTextsModule.quickTextsVirtualList && quickTextsModule.quickTextsVirtualList.onItemClick) {
        // 创建一个模拟的事件对象
        const mockEvent = {
          target: { closest: () => null },
          stopPropagation: () => { },
          preventDefault: () => { }
        };
        quickTextsModule.quickTextsVirtualList.onItemClick(currentSelectedIndex, mockEvent);
      }
    }
  } catch (error) {
    console.error('执行选中项失败:', error);
    // 如果出错，重置标志
    preserveNavigationOnUpdate = false;
  }
}

// 聚焦搜索框
export async function focusSearchBox() {
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;

  let searchInput = null;

  if (activeTab.id === 'clipboard-tab') {
    searchInput = document.querySelector('#search-input');
  } else if (activeTab.id === 'quick-texts-tab') {
    searchInput = document.querySelector('#quick-texts-search');
  }

  if (searchInput) {
    // 先确保窗口获得焦点，现在后端会正确处理焦点记录
    await invoke('focus_clipboard_window');

    // 然后聚焦输入框
    searchInput.focus();

    // 选中搜索框中的所有文本，方便用户直接输入搜索内容
    searchInput.select();
  }
}

// 隐藏窗口
async function hideWindow() {
  try {
    await invoke('toggle_window_visibility');
    resetNavigation();
  } catch (error) {
    console.error('隐藏窗口失败:', error);
  }
}

// 清除DOM缓存
function clearDOMCache() {
  cachedTabItems = null;
  lastHoverIndex = -1;
  
  if (cacheInvalidationTimeout) {
    clearTimeout(cacheInvalidationTimeout);
    cacheInvalidationTimeout = null;
  }
  
  if (hoverDebounceTimeout) {
    clearTimeout(hoverDebounceTimeout);
    hoverDebounceTimeout = null;
  }
}

// 重置导航状态
export function resetNavigation() {
  currentSelectedIndex = -1;
  navigationMode = false;
  
  // 清除DOM缓存和相关定时器
  clearDOMCache();

  const items = getCurrentTabItems();
  items.forEach(item => {
    item.classList.remove('keyboard-selected');
  });
}

// 当标签页切换时重置导航
export function onTabSwitch() {
  resetNavigation();
}

// 当列表内容更新时重置导航
export function onListUpdate() {
  // 列表更新时清除DOM缓存，确保获取最新的DOM元素
  clearDOMCache();
  
  // 如果设置了保持导航状态，跳过重置逻辑
  if (preserveNavigationOnUpdate) {
    preserveNavigationOnUpdate = false;
    if (navigationMode && currentSelectedIndex >= 0) {
      updateSelection();
    }
    return;
  }

  const dataLength = getCurrentTabDataLength();
  if (currentSelectedIndex >= dataLength) {
    currentSelectedIndex = Math.max(-1, dataLength - 1);
  }

  if (navigationMode && dataLength > 0 && currentSelectedIndex >= 0) {
    updateSelection();
  }
}

// 检查是否处于导航模式
export function isNavigationMode() {
  return navigationMode;
}

// 获取当前选中索引
export function getCurrentSelectedIndex() {
  return currentSelectedIndex;
}

// 设置键盘导航模式
function setKeyboardNavigationMode() {
  isKeyboardNavigation = true;
  
  // 清除之前的超时
  if (keyboardNavigationTimeout) {
    clearTimeout(keyboardNavigationTimeout);
  }
  
  // 2秒后清除键盘导航标记，允许鼠标悬停生效
  keyboardNavigationTimeout = setTimeout(() => {
    isKeyboardNavigation = false;
  }, 2000);
}

// 设置滚动状态（用于避免滚动时的抖动）
export function setScrollingState(scrolling) {
  isScrolling = scrolling;
  
  if (scrolling) {
    // 开始滚动时清除之前的超时
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
  } else {
    // 滚动结束后稍作延迟再允许鼠标悬停更新，确保滚动完全停止
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
    }, 50);
  }
}

// 设置当前选中索引（用于鼠标悬停同步）
export function setCurrentSelectedIndex(index) {
  if (typeof index !== 'number' || index < -1) return;
  
  // 如果正在键盘导航，忽略鼠标悬停
  if (isKeyboardNavigation) {
    return;
  }
  
  // 如果索引没有变化，直接返回避免不必要的处理
  if (index === lastHoverIndex) {
    return;
  }
  
  lastHoverIndex = index;
  
  // 清除之前的防抖定时器
  if (hoverDebounceTimeout) {
    clearTimeout(hoverDebounceTimeout);
  }
  
  // 使用防抖来减少频繁的更新操作
  hoverDebounceTimeout = setTimeout(() => {
    const oldIndex = currentSelectedIndex;
    currentSelectedIndex = index;
    
    // 如果索引发生变化，更新选择状态
    if (oldIndex !== currentSelectedIndex && currentSelectedIndex >= 0) {
      navigationMode = true;
      
      // 如果正在滚动，只更新索引，不触发视觉更新（避免滚动抖动）
      if (isScrolling) {
        return;
      }
      
      updateSelection();
    }
    
    hoverDebounceTimeout = null;
  }, 10); // 10ms的防抖延迟，既能避免频繁调用又不影响用户体验
}

// 同步点击的项目到导航状态
export function syncClickedItem(clickedElement) {
  // 从data-index属性获取真实的数据索引
  const dataIndex = parseInt(clickedElement.getAttribute('data-index'));

  if (!isNaN(dataIndex) && dataIndex >= 0) {
    // 清除键盘导航标记，因为用户使用了鼠标
    isKeyboardNavigation = false;
    if (keyboardNavigationTimeout) {
      clearTimeout(keyboardNavigationTimeout);
      keyboardNavigationTimeout = null;
    }
    
    resetNavigation();
    currentSelectedIndex = dataIndex;
    navigationMode = true;
    updateSelection();
  }
}

// 监听点击事件来同步导航状态
export function setupClickSync() {
  if (clickSyncSetup) return;

  const clipboardList = document.querySelector('.clipboard-list');
  const quickTextsList = document.querySelector('.quick-texts-list');

  if (clipboardList) {
    clipboardList.addEventListener('click', (event) => {
      const clipboardItem = event.target.closest('.clipboard-item');
      if (clipboardItem) {
        syncClickedItem(clipboardItem);
      }
    });
  }

  if (quickTextsList) {
    quickTextsList.addEventListener('click', (event) => {
      const quickTextItem = event.target.closest('.quick-text-item');
      if (quickTextItem) {
        syncClickedItem(quickTextItem);
      }
    });
  }

  clickSyncSetup = true;
}

// 设置搜索框键盘事件监听
function setupSearchBoxKeyboardEvents() {
  const searchInputs = [
    document.querySelector('#search-input'),
    document.querySelector('#quick-texts-search')
  ];

  searchInputs.forEach(searchInput => {
    if (searchInput) {
      searchInput.addEventListener('keydown', (event) => {
        // 监听方向键，让搜索框失去焦点以便进入导航模式
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter') {
          event.preventDefault(); // 阻止默认的光标移动行为
          searchInput.blur(); // 让搜索框失去焦点

          // 稍微延迟一下，确保焦点已经失去，然后触发导航
          setTimeout(() => {
            if (event.key === 'ArrowUp') {
              navigateUp();
            } else if (event.key === 'ArrowDown') {
              navigateDown();
            }
          }, 10);
        }

        // ESC键也让搜索框失去焦点
        else if (event.key === 'Escape') {
          event.preventDefault();
          searchInput.blur();
        }
      });
    }
  });
}

// 初始化快捷键帮助面板
export function initShortcutsHelpPanel() {
  footer = document.getElementById('footer');
  shortcutsHelpContent = document.getElementById('shortcuts-help-content');
  shortcutsHelpClose = document.getElementById('shortcuts-help-close');

  if (!footer || !shortcutsHelpContent || !shortcutsHelpClose) {
    return;
  }

  // 检查是否是首次启动
  checkFirstLaunch();

  // 事件处理：点击显示/关闭快捷键帮助
  const helpIcon = footer.querySelector('.shortcuts-help-icon');
  if (helpIcon) {
    helpIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleShortcutsHelp();
    });
  }

  // 点击关闭按钮
  shortcutsHelpClose.addEventListener('click', (e) => {
    console.log('用户点击关闭按钮');
    e.stopPropagation();
    hideShortcutsHelp();
  });

  // 点击帮助内容外部区域关闭帮助
  document.addEventListener('click', (e) => {
    if (shortcutsHelpContent.classList.contains('visible') &&
      !shortcutsHelpContent.contains(e.target) &&
      !(helpIcon && helpIcon.contains(e.target))) {
      hideShortcutsHelp();
    }
  });

  // 首次启动时自动显示
  if (isFirstLaunch) {
    setTimeout(() => {
      showShortcutsHelpFirstTime();
    }, 1000); // 延迟1秒显示，让用户先看到主界面
  }
}

// 检查是否是首次启动
function checkFirstLaunch() {
  const hasShownHelp = localStorage.getItem('shortcuts-help-shown');
  if (!hasShownHelp) {
    isFirstLaunch = true;
    localStorage.setItem('shortcuts-help-shown', 'true');
  }
}

// 首次显示快捷键帮助
function showShortcutsHelpFirstTime() {
  if (!shortcutsHelpContent) return;

  // 添加首次显示的特殊样式
  shortcutsHelpContent.classList.add('first-show');
  showShortcutsHelp();

  // 3秒后自动隐藏
  setTimeout(() => {
    hideShortcutsHelp();
  }, 3000);
}

// 切换快捷键帮助面板显示状态
function toggleShortcutsHelp() {
  if (!shortcutsHelpContent) return;

  if (shortcutsHelpContent.classList.contains('visible')) {
    hideShortcutsHelp();
  } else {
    showShortcutsHelp();
  }
}

// 显示快捷键帮助面板
function showShortcutsHelp() {
  if (!shortcutsHelpContent) return;

  shortcutsHelpContent.classList.remove('hidden');
  shortcutsHelpContent.classList.add('visible');
}

// 隐藏快捷键帮助面板
export function hideShortcutsHelp() {
  if (!shortcutsHelpContent) return;

  console.log('隐藏快捷键帮助面板');
  shortcutsHelpContent.classList.remove('first-show');
  shortcutsHelpContent.classList.add('hidden');
  shortcutsHelpContent.classList.remove('visible');

  // 清除内联样式
  shortcutsHelpContent.style.opacity = '';
  shortcutsHelpContent.style.visibility = '';
  shortcutsHelpContent.style.transform = '';
}
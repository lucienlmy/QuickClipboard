// 侧边栏悬停延迟控制
let sidebarHoverTimer = null;
let sidebarHideTimer = null;
let currentHoverDelay = 500; // 默认0.5秒延迟，将从设置中读取
const HIDE_DELAY = 0; //秒延迟隐藏

// DOM元素
let sidebarTrigger;
let groupsSidebar;
let isSidebarVisible = false;

// 初始化侧边栏悬停功能
export function initSidebarHover() {
  sidebarTrigger = document.getElementById('sidebar-trigger');
  groupsSidebar = document.getElementById('groups-sidebar');

  if (!sidebarTrigger || !groupsSidebar) {
    console.error('侧边栏触发区域或侧边栏元素未找到');
    return;
  }

  // 从设置中读取悬停延迟
  loadSidebarHoverDelay();

  // 监听设置变更事件
  setupSettingsListener();

  // 为触发区域添加鼠标进入事件
  sidebarTrigger.addEventListener('mouseenter', handleMouseEnter);

  // 为侧边栏添加鼠标进入事件
  groupsSidebar.addEventListener('mouseenter', handleMouseEnter);

  // 为触发区域添加鼠标离开事件
  sidebarTrigger.addEventListener('mouseleave', handleMouseLeave);

  // 为侧边栏添加鼠标离开事件
  groupsSidebar.addEventListener('mouseleave', handleMouseLeave);

  // 处理右键点击事件
  sidebarTrigger.addEventListener('contextmenu', handleContextMenu);
}

// 处理鼠标进入事件
function handleMouseEnter() {
  // 如果侧边栏已被固定，不执行任何操作
  if (groupsSidebar.classList.contains('pinned')) {
    return;
  }

  // 清除之前的定时器（如果有）
  if (sidebarHoverTimer) {
    clearTimeout(sidebarHoverTimer);
    sidebarHoverTimer = null;
  }

  // 清除隐藏定时器（如果有）
  if (sidebarHideTimer) {
    clearTimeout(sidebarHideTimer);
    sidebarHideTimer = null;
  }

  // 如果侧边栏已经可见，不需要再次显示
  if (isSidebarVisible) {
    return;
  }

  // 设置定时器，延迟显示侧边栏
  sidebarHoverTimer = setTimeout(() => {
    showSidebar();
    isSidebarVisible = true;
  }, currentHoverDelay);
}

// 处理鼠标离开事件
function handleMouseLeave() {
  // 如果侧边栏已被固定，不执行任何操作
  if (groupsSidebar.classList.contains('pinned')) {
    return;
  }

  // 清除定时器，防止侧边栏显示
  if (sidebarHoverTimer) {
    clearTimeout(sidebarHoverTimer);
    sidebarHoverTimer = null;
  }

  // 如果侧边栏不可见，不需要隐藏
  if (!isSidebarVisible) {
    return;
  }

  // 清除之前的隐藏定时器（如果有）
  if (sidebarHideTimer) {
    clearTimeout(sidebarHideTimer);
    sidebarHideTimer = null;
  }

  // 设置延迟隐藏定时器，给用户时间移动鼠标到侧边栏
  sidebarHideTimer = setTimeout(() => {
    hideSidebar();
    isSidebarVisible = false;
  }, HIDE_DELAY);
}

// 显示侧边栏
function showSidebar() {
  groupsSidebar.style.zIndex = 'var(--z-tooltip)';
  groupsSidebar.style.transform = 'translateX(0)';
}

// 隐藏侧边栏
function hideSidebar() {
  groupsSidebar.style.zIndex = '';
  groupsSidebar.style.transform = '';
  groupsSidebar.style.right = '';
  isSidebarVisible = false;
}

// 处理右键菜单事件
function handleContextMenu(e) {
  sidebarTrigger.style.pointerEvents = 'none';
  
  // 在当前鼠标位置获取下层元素
  const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
  
  // 重新启用触发区域的指针事件
  setTimeout(() => {
    sidebarTrigger.style.pointerEvents = 'auto';
  }, 0);
  
  // 如果下层有元素，触发它的右键菜单事件
  if (elementBelow) {
    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      clientX: e.clientX,
      clientY: e.clientY
    });
    elementBelow.dispatchEvent(contextMenuEvent);
  }
  
  // 阻止默认行为和事件冒泡
  e.preventDefault();
  e.stopPropagation();
}

// 从设置中读取侧边栏悬停延迟
async function loadSidebarHoverDelay() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const settings = await invoke('get_settings');
    const delay = settings.sidebarHoverDelay !== undefined ? settings.sidebarHoverDelay : 0.5;
    currentHoverDelay = Math.max(0, delay) * 1000; // 转换为毫秒，确保不为负数
    console.log('侧边栏悬停延迟已设置为:', currentHoverDelay, 'ms');
  } catch (error) {
    console.error('读取侧边栏悬停延迟设置失败:', error);
    currentHoverDelay = 500; // 使用默认值
  }
}

// 设置监听器，监听设置变更事件
async function setupSettingsListener() {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    
    // 监听侧边栏悬停延迟变更事件
    await listen('sidebar-hover-delay-changed', (event) => {
      const { delay } = event.payload;
      currentHoverDelay = Math.max(0, delay) * 1000; // 转换为毫秒
      console.log('侧边栏悬停延迟已更新为:', currentHoverDelay, 'ms');
    });
    
    // 监听设置变更事件（通用）
    await listen('settings-changed', () => {
      loadSidebarHoverDelay();
    });
  } catch (error) {
    console.error('设置侧边栏设置监听器失败:', error);
  }
}

// 更新侧边栏悬停延迟
export function updateSidebarHoverDelay(delay) {
  currentHoverDelay = Math.max(0, delay) * 1000; // 转换为毫秒，确保不为负数
}

// 在侧边栏固定状态改变时更新悬停行为
export function updateSidebarHoverBehavior() {
  // 如果侧边栏被固定，确保它保持显示状态
  if (groupsSidebar && groupsSidebar.classList.contains('pinned')) {
    showSidebar();
    isSidebarVisible = true;
  } else {
    // 如果侧边栏不再固定，隐藏它
    hideSidebar();
  }
}
import {
  currentTab,
  setCurrentTab,
  alertModal,
  alertTitle,
  alertMessage,
  confirmModal,
  confirmTitle,
  confirmMessage,
  confirmCallback,
  setConfirmCallback
} from './config.js';
import { showNotification } from './notificationManager.js';

// 导出统一的通知函数
export { showNotification };

// 设置标签页切换
export function setupTabSwitching() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  // 创建并缓存滑动指示器
  let tabIndicatorResizeTimer = null;
  function ensureTabSwitchIndicator() {
    const group = document.querySelector('.tab-switch-group');
    if (!group) return null;
    let indicator = group.querySelector('.tab-switch-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'tab-switch-indicator';
      group.appendChild(indicator);
    }
    return indicator;
  }

  function moveTabSwitchIndicatorToActive() {
    const activeButton = document.querySelector('.tab-button.active');
    const group = document.querySelector('.tab-switch-group');
    const indicator = ensureTabSwitchIndicator();
    if (!activeButton || !group || !indicator) return;
    const left = activeButton.offsetLeft;
    const width = activeButton.offsetWidth;
    indicator.style.left = left + 'px';
    indicator.style.width = width + 'px';
    indicator.style.opacity = '1';
  }

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      // 更新按钮状态
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // 更新内容显示
      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(`${tabName}-tab`).classList.add('active');

      setCurrentTab(tabName);

      // 发送标签页切换事件给虚拟列表
      window.dispatchEvent(new CustomEvent('tab-switched', {
        detail: { tabName: tabName }
      }));

      import('./navigation.js').then(module => {
        module.onTabSwitch();
      }).catch(console.error);

      notifyPreviewWindowTabChange(tabName);

      // 移动指示器到当前激活按钮
      moveTabSwitchIndicatorToActive();
    });
  });

  // 初始位置
  requestAnimationFrame(moveTabSwitchIndicatorToActive);

  // 窗口尺寸变化时重算位置（防抖）
  window.addEventListener('resize', () => {
    clearTimeout(tabIndicatorResizeTimer);
    tabIndicatorResizeTimer = setTimeout(moveTabSwitchIndicatorToActive, 120);
  });

  // 监听标题栏位置变化事件，更新指示器
  window.addEventListener('update-tab-indicator', moveTabSwitchIndicatorToActive);
}

// 通知预览窗口标签切换
async function notifyPreviewWindowTabChange(tabName) {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const groupId = await getCurrentGroupId(); // 获取当前选中的分组ID

    await invoke('notify_preview_tab_change', {
      tab: tabName,
      groupName: groupId
    });
  } catch (error) {
    // 预览窗口可能未打开，忽略错误
    console.debug('通知预览窗口标签切换失败:', error);
  }
}

// 获取当前选中的分组ID
async function getCurrentGroupId() {
  // 如果在常用文本标签页，获取当前选中的分组
  if (currentTab === 'quick-texts') {
    const { getCurrentGroupId } = await import('./groups.js');
    return getCurrentGroupId();
  }
  return 'clipboard'; // 剪贴板历史
}

// 显示确认对话框
export function showConfirmModal(title, message, callback) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  setConfirmCallback(callback);
  confirmModal.classList.add('active');
}

// 隐藏确认对话框
export function hideConfirmModal() {
  confirmModal.classList.remove('active');
  setConfirmCallback(null);
}

// 显示提示框
export function showAlertModal(title, message) {
  alertTitle.textContent = title;
  alertMessage.textContent = message;
  alertModal.classList.add('active');
}

// 隐藏提示框
export function hideAlertModal() {
  alertModal.classList.remove('active');
}

// 设置确认对话框事件监听器
export function setupConfirmModal() {
  document.getElementById('confirm-cancel-btn').addEventListener('click', hideConfirmModal);
  const confirmOkBtn = document.getElementById('confirm-ok-btn');
  confirmOkBtn.addEventListener('click', () => {
    if (confirmCallback) {
      confirmCallback();
    }
    hideConfirmModal();
  });

  // 点击遮罩关闭确认对话框
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      hideConfirmModal();
    }
  });
}

// 设置提示框事件监听器
export function setupAlertModal() {
  document.getElementById('alert-ok-btn').addEventListener('click', hideAlertModal);

  // 点击遮罩关闭提示框
  alertModal.addEventListener('click', (e) => {
    if (e.target === alertModal) {
      hideAlertModal();
    }
  });
}

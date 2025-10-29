/**
 * 统一通知管理器
 * 提供两种通知：普通通知和翻译通知
 */

// 通知配置
const NOTIFICATION_CONFIG = {
  // 不同窗口的默认位置配置
  positions: {
    main: { bottom: '20px', right: '20px' },      // 主窗口：底部右侧
    settings: { top: '80px', right: '20px' },     // 设置窗口：顶部右侧  
    textEditor: { top: '60px', right: '20px' },   // 文本编辑器：顶部右侧
    preview: { bottom: '20px', right: '20px' }    // 预览窗口：底部右侧
  },
  
  // 通知类型配置
  types: {
    success: {
      icon: 'ti ti-check',
      background: 'linear-gradient(135deg, #28a745, #20c997)',
      border: '1px solid rgba(40, 167, 69, 0.3)',
      color: 'white'
    },
    error: {
      icon: 'ti ti-alert-circle', 
      background: 'linear-gradient(135deg, #dc3545, #e74c3c)',
      border: '1px solid rgba(220, 53, 69, 0.3)',
      color: 'white'
    },
    warning: {
      icon: 'ti ti-alert-triangle',
      background: 'linear-gradient(135deg, #ffc107, #ffb300)', 
      border: '1px solid rgba(255, 193, 7, 0.3)',
      color: '#212529'
    },
    info: {
      icon: 'ti ti-info-circle',
      background: 'linear-gradient(135deg, #4a89dc, #007bff)',
      border: '1px solid rgba(74, 137, 220, 0.3)', 
      color: 'white'
    }
  },

  // 默认配置
  defaults: {
    duration: 3000,
    maxWidth: '300px',
    zIndex: 999999999999999
  }
};

/**
 * 检测当前窗口类型
 */
function detectWindowType() {
  const url = window.location.href;
  const pathname = window.location.pathname;
  
  if (pathname.includes('settings')) {
    return 'settings';
  } else if (pathname.includes('textEditor.html')) {
    return 'textEditor';
  } else if (pathname.includes('preview.html')) {
    return 'preview';
  } else {
    return 'main';
  }
}

/**
 * 显示普通通知
 */
export function showNotification(message, type = 'info', duration = null) {
  // 使用默认时长或传入的时长
  const finalDuration = duration !== null ? duration : NOTIFICATION_CONFIG.defaults.duration;
  
  // 移除已存在的普通通知，避免堆叠
  const existingNotifications = document.querySelectorAll('.unified-notification');
  existingNotifications.forEach(n => {
    if (n.parentNode) {
      n.parentNode.removeChild(n);
    }
  });

  // 获取当前窗口类型和对应配置
  const windowType = detectWindowType();
  const position = NOTIFICATION_CONFIG.positions[windowType];
  const typeConfig = NOTIFICATION_CONFIG.types[type] || NOTIFICATION_CONFIG.types.info;

  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `unified-notification ${type}`;

  // 创建图标
  const icon = document.createElement('i');
  icon.className = typeConfig.icon;

  // 创建消息文本
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;

  // 组装通知内容
  notification.appendChild(icon);
  notification.appendChild(messageSpan);

  // 构建位置样式
  const positionStyle = Object.entries(position)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');

  // 应用样式
  notification.style.cssText = `
    position: fixed;
    ${positionStyle};
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: ${NOTIFICATION_CONFIG.defaults.zIndex};
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    max-width: ${NOTIFICATION_CONFIG.defaults.maxWidth};
    word-wrap: break-word;
    background: ${typeConfig.background};
    border: ${typeConfig.border};
    color: ${typeConfig.color};
  `;

  // 添加到页面
  document.body.appendChild(notification);

  // 显示动画
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 10);

  // 自动隐藏
  if (finalDuration > 0) {
    setTimeout(() => {
      hideNotification(notification);
    }, finalDuration);
  }

  // 点击关闭
  notification.addEventListener('click', () => {
    hideNotification(notification);
  });

  return notification;
}

/**
 * 显示翻译通知
 */
export function showTranslationNotification(message, type = 'info', duration = 0, onCancel = null) {
  // 移除已存在的翻译通知
  const existingTranslationNotifications = document.querySelectorAll('.translation-notification');
  existingTranslationNotifications.forEach(n => {
    if (n.parentNode) {
      n.parentNode.removeChild(n);
    }
  });

  // 获取当前窗口类型和对应配置
  const windowType = detectWindowType();
  const position = NOTIFICATION_CONFIG.positions[windowType];
  const typeConfig = NOTIFICATION_CONFIG.types[type] || NOTIFICATION_CONFIG.types.info;

  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `translation-notification ${type}`;

  // 创建图标
  const icon = document.createElement('i');
  icon.className = type === 'info' ? 'ti ti-language' : typeConfig.icon;

  // 创建消息文本
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;

  // 创建取消按钮（仅在加载状态显示）
  const cancelBtn = document.createElement('button');
  cancelBtn.innerHTML = '<i class="ti ti-x"></i>';
  cancelBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    padding: 4px 6px;
    margin-left: 8px;
    font-size: 12px;
    transition: background 0.2s;
  `;
  
  // 取消按钮悬停效果
  cancelBtn.addEventListener('mouseenter', () => {
    cancelBtn.style.background = 'rgba(255, 255, 255, 0.3)';
  });
  cancelBtn.addEventListener('mouseleave', () => {
    cancelBtn.style.background = 'rgba(255, 255, 255, 0.2)';
  });
  
  // 取消按钮点击事件
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onCancel) {
      onCancel();
    }
    hideNotification(notification);
  });

  // 组装通知内容
  notification.appendChild(icon);
  notification.appendChild(messageSpan);
  if (type === 'info' && onCancel) {
    notification.appendChild(cancelBtn);
  }

  // 构建位置样式
  const positionStyle = Object.entries(position)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');

  // 应用样式
  notification.style.cssText = `
    position: fixed;
    ${positionStyle};
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: ${NOTIFICATION_CONFIG.defaults.zIndex + 1};
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(10px);
    max-width: ${NOTIFICATION_CONFIG.defaults.maxWidth};
    word-wrap: break-word;
    background: ${typeConfig.background};
    border: ${typeConfig.border};
    color: ${typeConfig.color};
  `;

  // 添加到页面
  document.body.appendChild(notification);

  // 显示动画
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 10);

  // 自动隐藏
  if (duration > 0) {
    setTimeout(() => {
      hideNotification(notification);
    }, duration);
  }

  return notification;
}

/**
 * 隐藏通知
 */
function hideNotification(notification) {
  if (!notification || !notification.parentNode) {
    return;
  }

  notification.style.opacity = '0';
  notification.style.transform = 'translateX(100%)';
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

// 清理函数
export function clearAllNotifications() {
  const notifications = document.querySelectorAll('.unified-notification, .translation-notification');
  notifications.forEach(hideNotification);
}

// 窗口卸载时清理所有通知
window.addEventListener('beforeunload', clearAllNotifications);

// 导出默认的通知函数
export default showNotification;
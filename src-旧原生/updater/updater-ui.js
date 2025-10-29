/**
 * 显示更新徽章（在设置的关于页面）
 */
export function showUpdateBadge(updateInfo) {
  const aboutNav = document.querySelector('.settings-nav .nav-item[data-section="about"]');
  if (!aboutNav) return;

  if (getComputedStyle(aboutNav).position === 'static') {
    aboutNav.style.position = 'relative';
  }

  let badge = aboutNav.querySelector('.update-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'update-badge';
    badge.textContent = '有更新';
    aboutNav.appendChild(badge);
  }
}

/**
 * 隐藏更新徽章
 */
export function hideUpdateBadge() {
  const aboutNav = document.querySelector('.settings-nav .nav-item[data-section="about"]');
  const badge = aboutNav?.querySelector('.update-badge');
  if (badge) badge.remove();
}


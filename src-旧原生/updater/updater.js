import '@tabler/icons-webfont/dist/tabler-icons.min.css';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { openUrl } from '@tauri-apps/plugin-opener';
import { formatReleaseNotes, getCurrentPlatform } from './updater-utils.js';
import { REPO_URL } from './updater-api.js';

const currentWindow = getCurrentWindow();

let updateInfo = null;
let isDownloading = false;

window.addEventListener('DOMContentLoaded', async () => {
  await initTheme();

  try {
    updateInfo = await invoke('updater_get_update_info');
    
    if (updateInfo) {
      displayUpdateInfo(updateInfo);
      
      // 如果是强制更新，自动开始下载
      if (updateInfo.forceUpdate === true) {
        handleForceUpdate();
      }
    } else {
      showError('未找到更新信息');
    }
  } catch (error) {
    console.error('Failed to get update info:', error);
    showError('获取更新信息失败');
  }

  document.getElementById('close-updater')?.addEventListener('click', closeWindow);
  document.getElementById('later-btn')?.addEventListener('click', closeWindow);
  document.getElementById('update-btn')?.addEventListener('click', startUpdate);
  document.getElementById('manual-download-btn')?.addEventListener('click', openManualDownload);
});

/**
 * 显示更新信息
 */
function displayUpdateInfo(info) {

  document.getElementById('new-version').textContent = `v${info.version}`;
  document.getElementById('current-version').textContent = `v${info.currentVersion}`;

  const dateElement = document.getElementById('update-date');
  if (dateElement && info.date) {
    const date = new Date(info.date).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    dateElement.innerHTML = `<i class="ti ti-calendar"></i><span>${date}</span>`;
  }

  const notesElement = document.getElementById('release-notes');
  if (notesElement) {
    notesElement.innerHTML = formatReleaseNotes(info.body || '暂无更新说明');
  }
}

/**
 * 显示错误信息
 */
function showError(message) {
  const notesElement = document.getElementById('release-notes');
  if (notesElement) {
    notesElement.innerHTML = `
      <div class="loading-placeholder">
        <i class="ti ti-alert-circle" style="color: var(--error-color);"></i>
        <p style="color: var(--error-color);">${message}</p>
      </div>
    `;
  }
}

/**
 * 处理强制更新
 */
function handleForceUpdate() {
  const closeBtn = document.getElementById('close-updater');
  const laterBtn = document.getElementById('later-btn');
  const updateBtn = document.getElementById('update-btn');

  [closeBtn, laterBtn].forEach(btn => {
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    }
  });

  if (updateBtn) {
    updateBtn.innerHTML = '<i class="ti ti-loader-2 spin"></i>正在准备更新...';
    updateBtn.disabled = true;
  }

  setTimeout(() => startUpdate(), 1000);
}

/**
 * 设置按钮状态
 */
function setButtonsDisabled(disabled) {
  const buttons = [
    document.getElementById('update-btn'),
    document.getElementById('later-btn'),
    document.getElementById('manual-download-btn'),
    document.getElementById('close-updater')
  ];
  
  buttons.forEach(btn => {
    if (btn) btn.disabled = disabled;
  });
}

/**
 * 开始更新
 */
async function startUpdate() {
  if (isDownloading) return;
  
  isDownloading = true;

  const progressSection = document.getElementById('progress-section');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  setButtonsDisabled(true);

  if (progressSection) progressSection.style.display = 'block';
  if (progressText) progressText.innerHTML = '<i class="ti ti-loader-2 spin"></i><span>正在连接更新服务器...</span>';

  try {
    const update = await check();

    if (!update || !update.available) {
      throw new Error('无法连接到更新服务器或未找到更新');
    }

    let contentLength = 0;
    let downloadedLength = 0;
    let lastUpdateTime = Date.now();
    let lastDownloadedLength = 0;

    await update.downloadAndInstall((event) => {
      const now = Date.now();

      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength || 0;
          const sizeMB = (contentLength / 1024 / 1024).toFixed(2);
          progressText.innerHTML = `<i class="ti ti-loader-2 spin"></i><span>开始下载... (${sizeMB} MB)</span>`;
          progressFill.style.width = '0%';
          lastUpdateTime = now;
          lastDownloadedLength = 0;
          break;

        case 'Progress':
          downloadedLength += event.data.chunkLength || 0;

          if (contentLength > 0 && (now - lastUpdateTime > 100 || downloadedLength === contentLength)) {
            const percent = Math.round((downloadedLength / contentLength) * 100);
            const downloadedMB = (downloadedLength / 1024 / 1024).toFixed(2);
            const totalMB = (contentLength / 1024 / 1024).toFixed(2);

            const timeDiff = (now - lastUpdateTime) / 1000;
            const dataDiff = downloadedLength - lastDownloadedLength;
            const speedKB = (dataDiff / 1024 / timeDiff).toFixed(0);

            progressFill.style.width = `${percent}%`;
            progressText.innerHTML = `<i class="ti ti-download"></i><span>下载中 (${downloadedMB}/${totalMB} MB · ${percent}% · ${speedKB} KB/s)</span>`;

            lastUpdateTime = now;
            lastDownloadedLength = downloadedLength;
          }
          break;

        case 'Finished':
          progressFill.style.width = '100%';
          progressText.innerHTML = '<i class="ti ti-check"></i><span>下载完成，正在安装...</span>';
          break;
      }
    });

    progressText.innerHTML = '<i class="ti ti-refresh spin"></i><span>安装完成！正在重启应用...</span>';
    progressText.style.color = 'var(--success-color)';

    setTimeout(async () => {
      await relaunch();
    }, 1000);

  } catch (error) {
    console.error('Update failed:', error);

    setButtonsDisabled(false);
    isDownloading = false;

    progressText.innerHTML = `<i class="ti ti-alert-circle"></i><span style="color: var(--error-color);">更新失败: ${error.message || '未知错误'}</span>`;
    progressText.style.color = 'var(--error-color)';
  }
}

/**
 * 打开手动下载链接
 */
async function openManualDownload() {
  if (!updateInfo) return;

  try {
    let downloadUrl = null;

    if (updateInfo.platforms) {
      const platformKey = getCurrentPlatform();
      const platformData = updateInfo.platforms[platformKey];
      if (platformData?.url) {
        downloadUrl = platformData.url;
      }
    }

    if (!downloadUrl && updateInfo.htmlUrl) {
      downloadUrl = updateInfo.htmlUrl;
    }

    if (!downloadUrl) {
      const repoUrl = updateInfo.repoUrl || REPO_URL;
      downloadUrl = `${repoUrl}/releases/tag/v${updateInfo.version}`;
    }

    await openUrl(downloadUrl);
  } catch (error) {
    console.error('Failed to open URL:', error);
  }
}

/**
 * 关闭窗口
 */
async function closeWindow() {
  try {
    await currentWindow.close();
  } catch (error) {
    console.error('Failed to close window:', error);
  }
}

/**
 * 主题
 */
async function initTheme() {
  try {
    const { getEffectiveTheme } = await import('../js/themeManager.js');

    const effectiveTheme = getEffectiveTheme();
    applyThemeClass(effectiveTheme);

    await listen('theme-changed', (event) => {
      applyThemeClass(event.payload);
    });
  } catch (error) {
    console.error('Failed to initialize theme:', error);
    applyThemeClass(getSystemTheme());
  }
}

/**
 * 应用主题类
 */
function applyThemeClass(theme) {
  const body = document.body;

  body.classList.remove('theme-light', 'theme-dark', 'theme-transparent', 'theme-background');

  body.classList.add(`theme-${theme}`);
}

/**
 * 获取系统主题
 */
function getSystemTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}


/**
 * 更新检测服务
 */

import { invoke } from '@tauri-apps/api/core';
import { fetchLatestRelease, getCurrentVersion, checkPortableMode } from './updater-api.js';
import { compareVersions } from './updater-utils.js';
import { showNotification } from '../js/notificationManager.js';

class UpdateService {
  constructor() {
    this.checking = false;
    this.latestReleaseCache = null;
    this.onUpdateAvailable = null;
  }

  /**
   * 构建更新信息对象
   */
  _buildUpdateInfo(latestRelease, currentVersion) {
    return {
      available: true,
      version: latestRelease.version,
      currentVersion: currentVersion,
      date: latestRelease.date,
      body: latestRelease.body,
      name: latestRelease.name,
      htmlUrl: latestRelease.htmlUrl,
      platforms: latestRelease.platforms,
      forceUpdate: latestRelease.forceUpdate === true
    };
  }

  /**
   * 核心更新检查逻辑
   */
  async _checkForUpdate() {
    const isPortable = await checkPortableMode();
    if (isPortable) return null;

    const latestRelease = await fetchLatestRelease();
    this.latestReleaseCache = latestRelease;

    const currentVersion = await getCurrentVersion();
    const hasUpdate = compareVersions(latestRelease.version, currentVersion) > 0;

    if (hasUpdate) {
      return this._buildUpdateInfo(latestRelease, currentVersion);
    }

    return null;
  }

  /**
   * 检查更新（用于设置界面）
   */
  async checkForUpdates(silent = false, triggerButton = null) {

    if (this.checking) return null;

    this.checking = true;

    let originalHTML = '';
    if (triggerButton) {
      originalHTML = triggerButton.innerHTML;
      triggerButton.disabled = true;
      triggerButton.style.opacity = '0.6';
      triggerButton.style.cursor = 'not-allowed';
      triggerButton.innerHTML = '<i class="ti ti-loader-2" style="animation: spin 1s linear infinite; margin-right: 6px;"></i>检查中...';
    }

    try {
      const updateInfo = await this._checkForUpdate();

      if (updateInfo) {
        if (!silent) {
          await this.showUpdateWindow(updateInfo);
        }
        return updateInfo;
      } else {
        if (!silent) {
          showNotification('当前使用的已是最新版本', 'success');
        }
        return null;
      }
    } catch (error) {
      console.error('Check for updates failed:', error);
      if (!silent) {
        showNotification('无法检查更新，请稍后重试', 'error');
      }
      return null;
    } finally {
      this.checking = false;

      if (triggerButton) {
        triggerButton.disabled = false;
        triggerButton.style.opacity = '';
        triggerButton.style.cursor = '';
        triggerButton.innerHTML = originalHTML;
      }
    }
  }

  /**
   * 自动检查更新（通用接口）
   */
  async autoCheckUpdate(options = {}) {
    const { onUpdateAvailable = null, silent = true } = options;

    try {
      const updateInfo = await this._checkForUpdate();

      if (updateInfo) {
        if (updateInfo.forceUpdate) {
          await this.showUpdateWindow(updateInfo);
        } else {
          if (onUpdateAvailable) {
            onUpdateAvailable(updateInfo);
          } else if (!silent) {
            showNotification(`发现新版本 v${updateInfo.version}`, 'info');
          }
        }

        return updateInfo;
      }

      return null;
    } catch (error) {
      console.error('Auto check update failed:', error);
      return null;
    }
  }

  /**
   * 进入设置时检查更新
   */
  async checkOnSettingsOpen(onUpdateAvailable = null) {
    return this.autoCheckUpdate({ onUpdateAvailable, silent: true });
  }

  /**
   * 应用启动时检查更新
   */
  async checkOnStartup() {
    return this.autoCheckUpdate({ silent: true });
  }

  /**
   * 显示更新窗口
   */
  async showUpdateWindow(updateInfo) {
    try {
      await invoke('show_updater_window', { updateInfo });
    } catch (error) {
      console.error('Failed to show updater window:', error);
      showNotification('无法打开更新窗口', 'error');
    }
  }
}

// 创建并导出单例
const updateService = new UpdateService();
export default updateService;
export { updateService };


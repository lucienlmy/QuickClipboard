/**
 * 自动更新管理器
 */

import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke } from '@tauri-apps/api/core';
import { showNotification } from './notificationManager.js';

class AutoUpdater {
  constructor() {
    this.isChecking = false;
    this.isDownloading = false;
    this.updateAvailable = false;
    this.currentUpdate = null;
    this.isPortableMode = false;
    this.portableModeChecked = false;
  }

  /**
   * 检查是否为便携版模式
   */
  async checkPortableMode() {
    if (!this.portableModeChecked) {
      try {
        this.isPortableMode = await invoke('is_portable_mode');
        this.portableModeChecked = true;
      } catch (error) {
        console.error('[AutoUpdater] 检查便携版模式失败:', error);
        this.isPortableMode = false;
        this.portableModeChecked = true;
      }
    }
    return this.isPortableMode;
  }

  /**
   * 检查更新
   */
  async checkForUpdates(silent = false) {
    // 便携版模式下禁用自动更新
    const isPortable = await this.checkPortableMode();
    if (isPortable) {
      if (!silent) {
        showNotification('便携版模式下已禁用自动更新功能', 'info');
      }
      return null;
    }

    if (this.isChecking) {
    //   console.log('[AutoUpdater] 正在检查更新中...');
      return null;
    }

    this.isChecking = true;

    try {
    //   console.log('[AutoUpdater] 开始检查更新...');
      
      // 使用 Tauri Updater 插件检查更新
      const update = await check();

      if (update) {
        // console.log(`[AutoUpdater] 发现新版本: ${update.version}`);
        // console.log(`[AutoUpdater] 当前版本: ${update.currentVersion}`);
        // console.log(`[AutoUpdater] 更新日期: ${update.date}`);
        
        this.updateAvailable = true;
        this.currentUpdate = update;

        // 触发自定义事件
        window.dispatchEvent(new CustomEvent('tauri-update-available', {
          detail: { 
            version: update.version,
            currentVersion: update.currentVersion,
            date: update.date,
            body: update.body
          }
        }));

        if (!silent) {
          // 显示更新提示对话框
          this.showUpdateDialog(update);
        }

        return update;
      } else {
        // console.log('[AutoUpdater] 当前已是最新版本');
        this.updateAvailable = false;
        this.currentUpdate = null;

        if (!silent) {
          showNotification('当前使用的已是最新版本', 'success');
        }

        return null;
      }
    } catch (error) {
      console.error('[AutoUpdater] 检查更新失败:', error);
      
      if (!silent) {
        showNotification(
          error.message || '无法检查更新，请稍后重试', 
          'error'
        );
      }

      return null;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * 显示更新对话框
   */
  showUpdateDialog(update) {
    // 移除已存在的对话框
    const existingOverlay = document.querySelector('.auto-update-dialog-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'auto-update-dialog-overlay';
    overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'background: rgba(0, 0, 0, 0.5)',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'z-index: 10001',
      'backdrop-filter: blur(4px)'
    ].join(';');

    const dialog = document.createElement('div');
    dialog.className = 'auto-update-dialog';
    dialog.style.cssText = [
      'width: 500px',
      'max-width: 90vw',
      'max-height: 80vh',
      'background: var(--bg-secondary, #1f2533)',
      'color: var(--text-primary, #fff)',
      'border-radius: 12px',
      'box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4)',
      'overflow: hidden',
      'display: flex',
      'flex-direction: column'
    ].join(';');

    // 标题栏
    const header = document.createElement('div');
    header.style.cssText = [
      'padding: 20px',
      'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'display: flex',
      'align-items: center',
      'gap: 12px'
    ].join(';');

    const icon = document.createElement('div');
    icon.innerHTML = '🎉';
    icon.style.fontSize = '24px';

    const titleBox = document.createElement('div');
    titleBox.style.flex = '1';

    const title = document.createElement('h3');
    title.textContent = '发现新版本！';
    title.style.cssText = 'margin: 0; font-size: 18px; font-weight: 600;';

    const versionInfo = document.createElement('div');
    versionInfo.textContent = `${update.currentVersion} → ${update.version}`;
    versionInfo.style.cssText = 'font-size: 12px; opacity: 0.9; margin-top: 4px;';

    titleBox.appendChild(title);
    titleBox.appendChild(versionInfo);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = [
      'background: transparent',
      'border: none',
      'color: rgba(255, 255, 255, 0.8)',
      'font-size: 28px',
      'cursor: pointer',
      'width: 32px',
      'height: 32px',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'border-radius: 6px',
      'transition: all 0.2s'
    ].join(';');
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'transparent';
    });
    closeBtn.addEventListener('click', () => overlay.remove());

    header.appendChild(icon);
    header.appendChild(titleBox);
    header.appendChild(closeBtn);

    // 更新说明内容
    const body = document.createElement('div');
    body.style.cssText = [
      'padding: 20px',
      'overflow: auto',
      'flex: 1',
      'background: var(--bg-primary, #1b2130)'
    ].join(';');

    const updateDate = document.createElement('div');
    updateDate.textContent = `发布日期: ${update.date || '未知'}`;
    updateDate.style.cssText = [
      'font-size: 12px',
      'color: var(--text-secondary, #aaa)',
      'margin-bottom: 12px'
    ].join(';');

    const notesTitle = document.createElement('h4');
    notesTitle.textContent = '更新内容：';
    notesTitle.style.cssText = 'margin: 0 0 8px 0; font-size: 14px;';

    const notes = document.createElement('div');
    notes.innerHTML = this.formatReleaseNotes(update.body || '暂无更新说明');
    notes.style.cssText = [
      'font-size: 13px',
      'line-height: 1.6',
      'color: var(--text-secondary, #e6e6e6)',
      'white-space: pre-wrap'
    ].join(';');

    body.appendChild(updateDate);
    body.appendChild(notesTitle);
    body.appendChild(notes);

    // 进度条
    const progressContainer = document.createElement('div');
    progressContainer.className = 'update-progress-container';
    progressContainer.style.cssText = [
      'padding: 0 20px 12px',
      'background: var(--bg-primary, #1b2130)',
      'display: none'
    ].join(';');

    const progressBar = document.createElement('div');
    progressBar.className = 'update-progress-bar';
    progressBar.style.cssText = [
      'width: 100%',
      'height: 6px',
      'background: rgba(255, 255, 255, 0.1)',
      'border-radius: 3px',
      'overflow: hidden',
      'position: relative'
    ].join(';');

    const progressFill = document.createElement('div');
    progressFill.className = 'update-progress-fill';
    progressFill.style.cssText = [
      'width: 0%',
      'height: 100%',
      'background: linear-gradient(90deg, #667eea, #764ba2)',
      'transition: width 0.3s ease'
    ].join(';');

    const progressText = document.createElement('div');
    progressText.className = 'update-progress-text';
    progressText.style.cssText = [
      'margin-top: 6px',
      'font-size: 12px',
      'color: var(--text-secondary, #aaa)',
      'text-align: center'
    ].join(';');
    progressText.textContent = '准备下载...';

    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressBar);
    progressContainer.appendChild(progressText);

    // 底部按钮
    const footer = document.createElement('div');
    footer.style.cssText = [
      'padding: 16px 20px',
      'background: var(--bg-secondary, #273042)',
      'display: flex',
      'gap: 10px',
      'justify-content: flex-end',
      'border-top: 1px solid rgba(255, 255, 255, 0.05)'
    ].join(';');

    const laterBtn = document.createElement('button');
    laterBtn.textContent = '稍后更新';
    laterBtn.style.cssText = [
      'background: var(--bg-tertiary, #565f7a)',
      'border: none',
      'color: #fff',
      'padding: 10px 20px',
      'border-radius: 8px',
      'cursor: pointer',
      'font-size: 14px',
      'transition: all 0.2s'
    ].join(';');
    laterBtn.addEventListener('mouseenter', () => {
      laterBtn.style.background = '#6a7390';
    });
    laterBtn.addEventListener('mouseleave', () => {
      laterBtn.style.background = '#565f7a';
    });
    laterBtn.addEventListener('click', () => overlay.remove());

    const updateBtn = document.createElement('button');
    updateBtn.textContent = '立即更新';
    updateBtn.className = 'update-install-btn';
    updateBtn.style.cssText = [
      'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'border: none',
      'color: #fff',
      'padding: 10px 24px',
      'border-radius: 8px',
      'cursor: pointer',
      'font-size: 14px',
      'font-weight: 500',
      'transition: all 0.2s',
      'box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3)'
    ].join(';');
    updateBtn.addEventListener('mouseenter', () => {
      updateBtn.style.transform = 'translateY(-2px)';
      updateBtn.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
    });
    updateBtn.addEventListener('mouseleave', () => {
      updateBtn.style.transform = 'translateY(0)';
      updateBtn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
    });
    updateBtn.addEventListener('click', () => {
      this.downloadAndInstall(update, {
        progressContainer,
        progressFill,
        progressText,
        updateBtn,
        laterBtn,
        closeBtn
      });
    });

    footer.appendChild(laterBtn);
    footer.appendChild(updateBtn);

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(progressContainer);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  /**
   * 格式化更新说明
   */
  formatReleaseNotes(body) {
    if (!body) return '暂无更新说明';

    return body
      .replace(/### (.*)/g, '<h5 style="margin: 12px 0 6px 0; font-size: 13px;">$1</h5>')
      .replace(/## (.*)/g, '<h4 style="margin: 16px 0 8px 0; font-size: 14px;">$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/- (.*)/g, '<li style="margin-left: 20px;">$1</li>')
      .replace(/`(.*?)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 12px;">$1</code>');
  }

  /**
   * 下载并安装更新
   */
  async downloadAndInstall(update, elements) {
    if (this.isDownloading) {
    //   console.log('[AutoUpdater] 正在下载中...');
      return;
    }

    this.isDownloading = true;
    const { progressContainer, progressFill, progressText, updateBtn, laterBtn, closeBtn } = elements;

    try {
      // 禁用按钮
      updateBtn.disabled = true;
      laterBtn.disabled = true;
      closeBtn.disabled = true;
      updateBtn.style.opacity = '0.5';
      updateBtn.style.cursor = 'not-allowed';
      laterBtn.style.opacity = '0.5';
      laterBtn.style.cursor = 'not-allowed';
      closeBtn.style.opacity = '0.5';
      closeBtn.style.cursor = 'not-allowed';

      // 显示进度条
      progressContainer.style.display = 'block';
      progressText.textContent = '正在下载更新...';

    //   console.log('[AutoUpdater] 开始下载并安装更新...');

      // 下载并安装更新
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            // console.log(`[AutoUpdater] 开始下载，总大小: ${event.data.contentLength || '未知'} bytes`);
            progressText.textContent = '开始下载...';
            break;
          case 'Progress':
            const percent = Math.round((event.data.chunkLength / event.data.contentLength) * 100);
            // console.log(`[AutoUpdater] 下载进度: ${percent}%`);
            progressFill.style.width = `${percent}%`;
            progressText.textContent = `下载中... ${percent}%`;
            break;
          case 'Finished':
            // console.log('[AutoUpdater] 下载完成');
            progressFill.style.width = '100%';
            progressText.textContent = '下载完成，准备安装...';
            break;
        }
      });

    //   console.log('[AutoUpdater] 更新安装完成，准备重启应用...');
      progressText.textContent = '安装完成！正在重启应用...';

      // 延迟 1 秒后重启应用
      setTimeout(async () => {
        try {
          await relaunch();
        } catch (error) {
          console.error('[AutoUpdater] 重启失败:', error);
          showNotification('请手动重启应用以完成更新', 'error');
        }
      }, 1000);

    } catch (error) {
      console.error('[AutoUpdater] 更新失败:', error);
      
      this.isDownloading = false;

      // 恢复按钮
      updateBtn.disabled = false;
      laterBtn.disabled = false;
      closeBtn.disabled = false;
      updateBtn.style.opacity = '1';
      updateBtn.style.cursor = 'pointer';
      laterBtn.style.opacity = '1';
      laterBtn.style.cursor = 'pointer';
      closeBtn.style.opacity = '1';
      closeBtn.style.cursor = 'pointer';

      progressText.textContent = '更新失败: ' + (error.message || '未知错误');
      progressText.style.color = '#ff6b6b';

      showNotification(
        error.message || '下载或安装更新失败，请稍后重试',
        'error'
      );
    }
  }

  /**
   * 自动检查更新
   */
  async autoCheckOnStartup() {
    // 便携版模式下不自动检查更新
    const isPortable = await this.checkPortableMode();
    if (isPortable) {
      return;
    }

    setTimeout(async () => {
    //   console.log('[AutoUpdater] 启动时自动检查更新...');
      await this.checkForUpdates(true);
    }, 3000);
  }
}

// 创建单例
const autoUpdater = new AutoUpdater();

// 导出
export { autoUpdater };
export default autoUpdater;


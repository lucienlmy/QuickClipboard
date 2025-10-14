/**
 * 数据管理模块
 */
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { showNotification } from '../../../js/notificationManager.js';
import { showLoading, hideLoading } from './loadingManager.js';

export class DataManager {
    /**
     * 初始化数据管理功能
     */
    init() {
        this.bindExport();
        this.bindImport();
        this.bindClearHistory();
        this.bindResetAll();
        this.bindResetSettings();
        this.bindStorageManagement();
        this.loadStorageInfo();
    }

    /**
     * 绑定导出数据
     */
    bindExport() {
        const button = document.getElementById('export-all-data');
        if (button) {
            button.addEventListener('click', () => this.handleExportData());
        }
    }

    /**
     * 绑定导入数据
     */
    bindImport() {
        const button = document.getElementById('import-data');
        if (button) {
            button.addEventListener('click', () => this.handleImportData());
        }
    }

    /**
     * 绑定清空历史
     */
    bindClearHistory() {
        const button = document.getElementById('clear-clipboard-history');
        if (button) {
            button.addEventListener('click', () => this.handleClearHistory());
        }
    }

    /**
     * 绑定重置所有数据
     */
    bindResetAll() {
        const button = document.getElementById('reset-all-data');
        if (button) {
            button.addEventListener('click', () => this.handleResetAll());
        }
    }

    /**
     * 绑定恢复默认配置
     */
    bindResetSettings() {
        const button = document.getElementById('reset-settings');
        if (button) {
            button.addEventListener('click', () => this.handleResetSettings());
        }
    }

    /**
     * 绑定存储位置管理
     */
    bindStorageManagement() {
        const openBtn = document.getElementById('open-storage-folder');
        const changeBtn = document.getElementById('change-storage-location');
        const resetBtn = document.getElementById('reset-storage-location');

        if (openBtn) {
            openBtn.addEventListener('click', () => this.handleOpenStorage());
        }
        if (changeBtn) {
            changeBtn.addEventListener('click', () => this.handleChangeStorage());
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.handleResetStorage());
        }
    }

    /**
     * 处理导出数据
     */
    async handleExportData() {
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const filePath = await save({
                title: '导出全部数据',
                defaultPath: `quickclipboard_backup_${new Date().toISOString().slice(0, 10)}.zip`,
                filters: [{ name: 'ZIP文件', extensions: ['zip'] }]
            });

            if (!filePath) return;

            showLoading('正在导出全部数据，请稍候...');
            await invoke('export_data', { exportPath: filePath, options: {} });
            hideLoading();
            showNotification('全部数据导出成功！', 'success');
        } catch (error) {
            hideLoading();
            console.error('导出数据失败:', error);
            showNotification(`导出数据失败: ${error}`, 'error');
        }
    }

    /**
     * 处理导入数据
     */
    async handleImportData() {
        try {
            const importModeRadios = document.querySelectorAll('input[name="import-mode"]');
            let importMode = 'replace';
            for (const radio of importModeRadios) {
                if (radio.checked) {
                    importMode = radio.value;
                    break;
                }
            }

            const { open } = await import('@tauri-apps/plugin-dialog');
            const filePath = await open({
                title: '选择要导入的数据文件',
                filters: [{ name: 'ZIP文件', extensions: ['zip'] }]
            });

            if (!filePath) return;

            const confirmed = await confirm(
                importMode === 'replace' 
                    ? '导入将完全替换所有内容（数据 + 设置），此操作不可撤销。是否继续？'
                    : '导入将合并数据内容，当前设置将保持不变。是否继续？',
                { title: '确认导入', kind: 'warning' }
            );

            if (!confirmed) return;

            showLoading('正在导入数据，请稍候...');
            await invoke('import_data', {
                importPath: filePath,
                options: { mode: importMode === 'replace' ? 'Replace' : 'Merge' }
            });

            await invoke('refresh_all_windows');
            hideLoading();
            showNotification('数据导入成功！', 'success');
        } catch (error) {
            hideLoading();
            console.error('导入数据失败:', error);
            showNotification(`导入数据失败: ${error}`, 'error');
        }
    }

    /**
     * 处理清空历史
     */
    async handleClearHistory() {
        const confirmed = await confirm(
            '确定要清空所有剪贴板历史吗？此操作不可撤销。',
            { title: '确认清空历史', kind: 'warning' }
        );

        if (!confirmed) return;

        try {
            showLoading('正在清空剪贴板历史...');
            await invoke('clear_clipboard_history_dm');
            await invoke('refresh_all_windows');
            hideLoading();
            showNotification('剪贴板历史已清空！', 'success');
        } catch (error) {
            hideLoading();
            console.error('清空剪贴板历史失败:', error);
            showNotification(`清空剪贴板历史失败: ${error}`, 'error');
        }
    }

    /**
     * 处理重置所有数据
     */
    async handleResetAll() {
        const firstConfirmed = await confirm(
            '确定要重置所有数据吗？这将删除所有剪贴板历史、常用文本、分组和设置。此操作不可撤销！',
            { title: '确认重置数据', kind: 'warning' }
        );

        if (!firstConfirmed) return;

        const finalConfirmed = await confirm(
            '最后确认：这将完全重置应用到初始状态，所有数据都将丢失。确定继续吗？',
            { title: '最终确认', kind: 'error' }
        );

        if (!finalConfirmed) return;

        try {
            showLoading('正在重置所有数据...');
            await invoke('reset_all_data');

            localStorage.clear();

            await invoke('refresh_all_windows');
            hideLoading();
            showNotification('所有数据已重置！', 'success');
        } catch (error) {
            hideLoading();
            console.error('重置所有数据失败:', error);
            showNotification(`重置所有数据失败: ${error}`, 'error');
        }
    }

    /**
     * 处理恢复默认配置
     */
    async handleResetSettings() {
        const confirmed = await confirm(
            '确定要恢复默认配置吗？这将重置所有设置项为默认值，但不会影响您的数据（剪贴板历史、常用文本等）。',
            { title: '确认恢复默认配置', kind: 'warning' }
        );

        if (!confirmed) return;

        try {
            showLoading('正在恢复默认配置...');
            await invoke('reset_settings_to_default');

            localStorage.clear();

            await invoke('refresh_all_windows');
            hideLoading();
            showNotification('配置已恢复为默认值！', 'success');
        } catch (error) {
            hideLoading();
            console.error('恢复默认配置失败:', error);
            showNotification(`恢复默认配置失败: ${error}`, 'error');
        }
    }

    /**
     * 处理打开存储文件夹
     */
    async handleOpenStorage() {
        try {
            await invoke('open_storage_folder');
        } catch (error) {
            console.error('打开存储文件夹失败:', error);
            showNotification(`打开存储文件夹失败: ${error}`, 'error');
        }
    }

    /**
     * 处理更改存储位置
     */
    async handleChangeStorage() {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selectedPath = await open({
                title: '选择新的数据存储位置',
                directory: true,
                multiple: false
            });

            if (!selectedPath) return;

            const confirmed = await confirm(
                '更改存储位置将迁移所有现有数据到新位置，此过程可能需要一些时间。确定继续吗？',
                { title: '确认更改存储位置', type: 'warning' }
            );

            if (!confirmed) return;

            showLoading('正在迁移数据到新位置，请稍候...');
            await invoke('set_custom_storage_location', { newPath: selectedPath });
            await this.loadStorageInfo();
            hideLoading();
            showNotification('存储位置更改成功！', 'success');
        } catch (error) {
            hideLoading();
            console.error('更改存储位置失败:', error);
            showNotification(`更改存储位置失败: ${error}`, 'error');
        }
    }

    /**
     * 处理重置存储位置
     */
    async handleResetStorage() {
        try {
            const confirmed = await confirm(
                '重置存储位置将把数据迁移回默认的AppData目录。确定继续吗？',
                { title: '确认重置存储位置', type: 'warning' }
            );

            if (!confirmed) return;

            showLoading('正在重置存储位置，请稍候...');
            await invoke('reset_to_default_storage_location');
            await this.loadStorageInfo();
            hideLoading();
            showNotification('存储位置已重置为默认位置！', 'success');
        } catch (error) {
            hideLoading();
            console.error('重置存储位置失败:', error);
            showNotification(`重置存储位置失败: ${error}`, 'error');
        }
    }

    /**
     * 加载存储信息
     */
    async loadStorageInfo() {
        try {
            const storageInfo = await invoke('get_storage_info');
            const currentPathElement = document.getElementById('current-storage-path');
            if (currentPathElement) {
                currentPathElement.textContent = storageInfo.current_path;
                currentPathElement.title = storageInfo.current_path;
            }

            // 检查是否为便携版模式
            if (storageInfo.is_portable) {
                this.disableStorageButtons();
                this.showPortableModeTip();
            }
        } catch (error) {
            console.error('获取存储信息失败:', error);
            const currentPathElement = document.getElementById('current-storage-path');
            if (currentPathElement) {
                currentPathElement.textContent = '获取存储位置失败';
            }
        }
    }

    /**
     * 禁用存储位置管理按钮
     */
    disableStorageButtons() {
        const changeBtn = document.getElementById('change-storage-location');
        const resetBtn = document.getElementById('reset-storage-location');
        
        if (changeBtn) {
            changeBtn.disabled = true;
            changeBtn.title = '便携版模式下无法更改存储位置';
            changeBtn.style.opacity = '0.5';
            changeBtn.style.cursor = 'not-allowed';
        }
        
        if (resetBtn) {
            resetBtn.disabled = true;
            resetBtn.title = '便携版模式下无法更改存储位置';
            resetBtn.style.opacity = '0.5';
            resetBtn.style.cursor = 'not-allowed';
        }
    }

    /**
     * 显示便携版模式提示
     */
    showPortableModeTip() {
        const currentPathElement = document.getElementById('current-storage-path');
        if (currentPathElement && currentPathElement.parentElement) {
            // 检查是否已经存在提示
            const existingTip = currentPathElement.parentElement.querySelector('.portable-mode-tip');
            if (!existingTip) {
                const tip = document.createElement('div');
                tip.className = 'portable-mode-tip';
                tip.style.cssText = 'margin-top: 8px; padding: 8px 12px; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px; font-size: 13px; color: #856404;';
                tip.innerHTML = '<strong>便携版模式</strong><br>当前运行在便携版模式下，所有数据存储在程序目录下的 data 文件夹中，无法更改存储位置。';
                currentPathElement.parentElement.appendChild(tip);
            }
        }
    }
}

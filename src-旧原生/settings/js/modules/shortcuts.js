/**
 * 快捷键设置模块
 */
import { invoke } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { showNotification } from '../../../js/notificationManager.js';

export class ShortcutManager {
    constructor(settings, saveCallback) {
        this.settings = settings;
        this.saveSettings = saveCallback;
        this.recordingInput = null;
    }

    /**
     * 绑定所有快捷键设置事件
     */
    bindEvents() {
        this.bindToggleShortcut();
        this.bindPreviewShortcut();
        this.bindScreenshotShortcut();
        this.bindClipboardShortcuts();
    }

    /**
     * 绑定主窗口切换快捷键
     */
    bindToggleShortcut() {
        const shortcutInput = document.getElementById('toggle-shortcut');
        const clearButton = document.querySelector('.sound-reset-btn');
        const presetButtons = document.querySelectorAll('.preset-btn');
        const restoreWinVBtn = document.getElementById('restore-win-v-btn');

        if (shortcutInput) {
            this._setupShortcutInput(shortcutInput, 'toggleShortcut', async (recording) => {
                try {
                    await invoke('set_shortcut_recording', { recording });
                } catch (err) {
                    console.error('设置快捷键录制状态失败:', err);
                }
            }, async (newShortcut, oldShortcut) => {
                // 快捷键更改后的回调
                const success = await this._handleShortcutChange(newShortcut, oldShortcut);
                if (!success) {
                    // 如果用户取消，恢复旧值
                    shortcutInput.value = oldShortcut;
                    this.settings.toggleShortcut = oldShortcut;
                }
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', async () => {
                const defaultShortcut = 'Alt+V';
                const oldShortcut = this.settings.toggleShortcut;
                shortcutInput.value = defaultShortcut;
                this.settings.toggleShortcut = defaultShortcut;
                const success = await this._handleShortcutChange(defaultShortcut, oldShortcut);
                if (success) {
                    this.saveSettings();
                } else {
                    shortcutInput.value = oldShortcut;
                    this.settings.toggleShortcut = oldShortcut;
                }
            });
        }

        presetButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const shortcut = button.getAttribute('data-shortcut');
                const oldShortcut = this.settings.toggleShortcut;
                shortcutInput.value = shortcut;
                this.settings.toggleShortcut = shortcut;
                const success = await this._handleShortcutChange(shortcut, oldShortcut);
                if (success) {
                    this.saveSettings();
                    this._flashButton(button);
                } else {
                    shortcutInput.value = oldShortcut;
                    this.settings.toggleShortcut = oldShortcut;
                }
            });
        });

        // 恢复系统Win+V按钮
        if (restoreWinVBtn) {
            restoreWinVBtn.addEventListener('click', async () => {
                await this._restoreSystemWinV();
            });
            
            // 初始化按钮状态
            this._updateRestoreWinVButton();
        }
    }

    /**
     * 处理快捷键更改
     */
    async _handleShortcutChange(newShortcut, oldShortcut) {
        try {
            // 检查是否是Win+V
            const isWinV = await invoke('is_shortcut_win_v', { shortcut: newShortcut });
            
            if (isWinV) {
                // 检查是否已经禁用
                const isDisabled = await invoke('is_win_v_hotkey_disabled');
                
                if (!isDisabled) {
                    const confirmed = await ask(
                        '要使用Win+V作为快捷键，需要禁用Windows系统的剪贴板历史快捷键。\n\n' +
                        '⚠️ 此操作将重启资源管理器(Explorer)，桌面会暂时刷新。\n\n' +
                        '是否继续？',
                        {
                            title: '需要禁用系统Win+V',
                            kind: 'warning',
                            okLabel: '确认',
                            cancelLabel: '取消'
                        }
                    );
                    
                    if (confirmed) {
                        try {
                            showNotification('正在禁用系统Win+V，Explorer将重启...', 'info');
                            
                            // 禁用并自动重启Explorer
                            await invoke('disable_win_v_hotkey_with_restart');
                            
                            showNotification('已成功禁用系统Win+V快捷键', 'success');
                            this._updateRestoreWinVButton();
                            this.saveSettings();
                            return true;
                        } catch (err) {
                            await message('禁用系统Win+V失败: ' + err, {
                                title: '错误',
                                kind: 'error'
                            });
                            return false;
                        }
                    } else {
                        return false; // 用户取消
                    }
                } else {
                    // 已经禁用过了，直接保存
                    this.saveSettings();
                    return true;
                }
            } else {
                // 不是Win+V，直接保存
                this.saveSettings();
                return true;
            }
        } catch (err) {
            console.error('处理快捷键更改失败:', err);
            return false;
        }
    }

    /**
     * 恢复系统Win+V
     */
    async _restoreSystemWinV() {
        try {
            const confirmed = await ask(
                '确定要恢复系统Win+V快捷键吗？\n\n' +
                '此操作将：\n' +
                '1. 更改您的快捷键为Alt+V\n' +
                '2. 恢复系统Win+V\n' +
                '3. 重启资源管理器(Explorer)\n\n' +
                '⚠️ 桌面会暂时刷新',
                {
                    title: '恢复系统Win+V',
                    kind: 'warning',
                    okLabel: '确认',
                    cancelLabel: '取消'
                }
            );
            
            if (confirmed) {
                try {
                    showNotification('正在恢复系统Win+V...', 'info');
                    
                    // 先将程序快捷键改为Alt+V
                    const shortcutInput = document.getElementById('toggle-shortcut');
                    if (shortcutInput) {
                        shortcutInput.value = 'Alt+V';
                        this.settings.toggleShortcut = 'Alt+V';
                        this.saveSettings();
                    }
                    
                    // 等待设置保存和热键注销
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // 恢复系统Win+V并重启Explorer
                    await invoke('enable_win_v_hotkey_with_restart');
                    
                    showNotification('已恢复系统Win+V快捷键，程序快捷键已改为Alt+V', 'success');
                    this._updateRestoreWinVButton();
                } catch (err) {
                    await message('恢复系统Win+V失败: ' + err, {
                        title: '错误',
                        kind: 'error'
                    });
                }
            }
        } catch (err) {
            console.error('恢复系统Win+V失败:', err);
        }
    }

    /**
     * 更新恢复按钮状态
     */
    async _updateRestoreWinVButton() {
        const restoreBtn = document.getElementById('restore-win-v-btn');
        if (!restoreBtn) return;
        
        try {
            const isDisabled = await invoke('is_win_v_hotkey_disabled');
            restoreBtn.disabled = !isDisabled;
            restoreBtn.title = isDisabled ? '点击恢复系统Win+V快捷键' : '系统Win+V未被禁用';
        } catch (err) {
            console.error('检查Win+V状态失败:', err);
        }
    }

    /**
     * 绑定预览窗口快捷键
     */
    bindPreviewShortcut() {
        const input = document.getElementById('preview-shortcut');
        const clearBtn = document.getElementById('clear-preview-shortcut');

        if (input) {
            this._setupShortcutInput(input, 'previewShortcut', async (recording) => {
                try {
                    await invoke('set_shortcut_recording', { recording });
                } catch (err) {
                    console.error('设置快捷键录制状态失败:', err);
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = 'Ctrl+`';
                this.settings.previewShortcut = 'Ctrl+`';
                this.saveSettings();
            });
        }
    }

    /**
     * 绑定截屏快捷键
     */
    bindScreenshotShortcut() {
        const input = document.getElementById('screenshot-shortcut');
        const clearBtn = document.getElementById('clear-screenshot-shortcut');

        if (input) {
            this._setupShortcutInput(input, 'screenshot_shortcut', async (recording) => {
                try {
                    await invoke('set_shortcut_recording', { recording });
                } catch (err) {
                    console.error('设置快捷键录制状态失败:', err);
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = 'Ctrl+Shift+A';
                this.settings.screenshot_shortcut = 'Ctrl+Shift+A';
                this.saveSettings();
            });
        }
    }

    /**
     * 绑定剪贴板窗口快捷键
     */
    bindClipboardShortcuts() {
        const configs = [
            { id: 'navigate-up-shortcut', key: 'navigateUpShortcut', default: 'ArrowUp' },
            { id: 'navigate-down-shortcut', key: 'navigateDownShortcut', default: 'ArrowDown' },
            { id: 'tab-left-shortcut', key: 'tabLeftShortcut', default: 'ArrowLeft' },
            { id: 'tab-right-shortcut', key: 'tabRightShortcut', default: 'ArrowRight' },
            { id: 'focus-search-shortcut', key: 'focusSearchShortcut', default: 'Tab' },
            { id: 'hide-window-shortcut', key: 'hideWindowShortcut', default: 'Escape' },
            { id: 'execute-item-shortcut', key: 'executeItemShortcut', default: 'Ctrl+Enter' },
            { id: 'previous-group-shortcut', key: 'previousGroupShortcut', default: 'Ctrl+ArrowUp' },
            { id: 'next-group-shortcut', key: 'nextGroupShortcut', default: 'Ctrl+ArrowDown' },
            { id: 'toggle-pin-shortcut', key: 'togglePinShortcut', default: 'Ctrl+P' }
        ];

        configs.forEach(config => {
            const input = document.getElementById(config.id);
            const clearBtn = input?.parentElement?.querySelector('.sound-reset-btn');

            if (input) {
                this._setupShortcutInput(input, config.key);
            }

            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    input.value = config.default;
                    this.settings[config.key] = config.default;
                    this.saveSettings();
                });
            }
        });
    }

    /**
     * 设置快捷键输入框
     */
    _setupShortcutInput(input, settingKey, onRecordingChange = null, onShortcutChange = null) {
        let isRecording = false;
        let oldValue = this.settings[settingKey];

        input.addEventListener('focus', async () => {
            if (!isRecording) {
                if (onRecordingChange) {
                    await onRecordingChange(true);
                }
                oldValue = this.settings[settingKey]; // 保存旧值
                startRecording();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (!isRecording) return;

            e.preventDefault();
            e.stopPropagation();

            const key = e.key;
            if (['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(key)) {
                return;
            }

            const modifiers = [];
            if (e.ctrlKey) modifiers.push('Ctrl');
            if (e.shiftKey) modifiers.push('Shift');
            if (e.altKey) modifiers.push('Alt');
            if (e.metaKey) modifiers.push('Win');

            const keyName = this._formatKeyName(key);
            const shortcut = [...modifiers, keyName].join('+');
            
            input.value = shortcut;
            this.settings[settingKey] = shortcut;

            stopRecording();
            
            // 触发快捷键更改回调
            if (onShortcutChange) {
                onShortcutChange(shortcut, oldValue);
            } else {
                this.saveSettings();
            }
        });

        input.addEventListener('blur', () => {
            if (isRecording) {
                stopRecording();
            }
        });

        const startRecording = () => {
            isRecording = true;
            input.classList.add('recording');
            input.placeholder = '请按下快捷键组合...';
            input.value = '';
            if (window.setShortcutRecording) {
                window.setShortcutRecording(true);
            }
        };

        const stopRecording = () => {
            isRecording = false;
            input.classList.remove('recording');
            input.placeholder = '点击设置快捷键';
            if (window.setShortcutRecording) {
                window.setShortcutRecording(false);
            }
            if (onRecordingChange) {
                onRecordingChange(false);
            }
        };
    }

    /**
     * 格式化按键名称
     */
    _formatKeyName(key) {
        const specialKeys = {
            'ArrowUp': 'ArrowUp',
            'ArrowDown': 'ArrowDown',
            'ArrowLeft': 'ArrowLeft',
            'ArrowRight': 'ArrowRight',
            'Escape': 'Escape',
            'Tab': 'Tab',
            'Enter': 'Enter'
        };
        return specialKeys[key] || key.toUpperCase();
    }

    /**
     * 按钮闪烁效果
     */
    _flashButton(button) {
        button.style.background = '#28a745';
        button.style.color = 'white';
        setTimeout(() => {
            button.style.background = '';
            button.style.color = '';
        }, 500);
    }
}

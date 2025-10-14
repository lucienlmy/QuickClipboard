/**
 * 快捷键设置模块
 */
import { invoke } from '@tauri-apps/api/core';
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

        if (shortcutInput) {
            this._setupShortcutInput(shortcutInput, 'toggleShortcut', async (recording) => {
                try {
                    await invoke('set_shortcut_recording', { recording });
                } catch (err) {
                    console.error('设置快捷键录制状态失败:', err);
                }
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                const defaultShortcut = 'Win+V';
                shortcutInput.value = defaultShortcut;
                this.settings.toggleShortcut = defaultShortcut;
                this.saveSettings();
            });
        }

        presetButtons.forEach(button => {
            button.addEventListener('click', () => {
                const shortcut = button.getAttribute('data-shortcut');
                shortcutInput.value = shortcut;
                this.settings.toggleShortcut = shortcut;
                this.saveSettings();
                this._flashButton(button);
            });
        });
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
    _setupShortcutInput(input, settingKey, onRecordingChange = null) {
        let isRecording = false;

        input.addEventListener('focus', async () => {
            if (!isRecording) {
                if (onRecordingChange) {
                    await onRecordingChange(true);
                }
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
            this.saveSettings();
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

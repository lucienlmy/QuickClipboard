/**
 * 音效设置模块
 */
import { invoke } from '@tauri-apps/api/core';
import { showNotification } from '../../../js/notificationManager.js';

export class SoundManager {
    constructor(settings, saveCallback) {
        this.settings = settings;
        this.saveSettings = saveCallback;
    }

    /**
     * 绑定音效设置事件
     */
    bindEvents() {
        this.bindVolumeSlider();
        this.bindResetButtons();
        this.bindBrowseButtons();
        this.bindTestButtons();
        this.bindClearCache();
    }

    /**
     * 绑定音量滑块
     */
    bindVolumeSlider() {
        const volumeSlider = document.getElementById('sound-volume');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const volume = parseInt(e.target.value);
                this.settings.soundVolume = volume;
                this.updateVolumeDisplay(volume);
                this.saveSettings();
            });
        }
    }

    /**
     * 绑定恢复默认音效按钮
     */
    bindResetButtons() {
        const resetButtons = [
            { id: 'reset-copy-sound', pathKey: 'copySoundPath', inputId: 'copy-sound-path', default: '', message: '已恢复默认复制音效' },
            { id: 'reset-paste-sound', pathKey: 'pasteSoundPath', inputId: 'paste-sound-path', default: '', message: '已恢复默认粘贴音效' },
            { id: 'reset-preview-scroll-sound', pathKey: 'previewScrollSoundPath', inputId: 'preview-scroll-sound-path', default: 'sounds/roll.mp3', message: '已恢复默认滚动音效' }
        ];

        resetButtons.forEach(({ id, pathKey, inputId, default: defaultValue, message }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => {
                    this.settings[pathKey] = defaultValue;
                    const input = document.getElementById(inputId);
                    if (input) input.value = defaultValue;
                    this.saveSettings();
                    showNotification(message, 'success');
                });
            }
        });
    }

    /**
     * 绑定浏览音效文件按钮
     */
    bindBrowseButtons() {
        const browseButtons = [
            { id: 'browse-copy-sound', type: 'copy' },
            { id: 'browse-paste-sound', type: 'paste' },
            { id: 'browse-preview-scroll-sound', type: 'preview-scroll' }
        ];

        browseButtons.forEach(({ id, type }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => this.browseSoundFile(type));
            }
        });
    }

    /**
     * 绑定测试音效按钮
     */
    bindTestButtons() {
        const testButtons = [
            { id: 'test-copy-sound', type: 'copy' },
            { id: 'test-paste-sound', type: 'paste' },
            { id: 'test-preview-scroll-sound', type: 'preview-scroll' }
        ];

        testButtons.forEach(({ id, type }) => {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => this.testSound(type));
            }
        });
    }

    /**
     * 绑定清理缓存按钮
     */
    bindClearCache() {
        const button = document.getElementById('clear-sound-cache');
        if (button) {
            button.addEventListener('click', async () => {
                if (button.disabled) return;

                try {
                    button.disabled = true;
                    button.innerHTML = '<i class="ti ti-loader"></i> 清理中...';
                    await invoke('clear_sound_cache');
                    showNotification('缓存清理成功', 'success');
                } catch (error) {
                    console.error('清理缓存失败:', error);
                    showNotification('缓存清理失败', 'error');
                } finally {
                    button.innerHTML = '<i class="ti ti-trash"></i> 清理缓存';
                    button.disabled = false;
                }
            });
        }
    }

    /**
     * 浏览音效文件
     */
    async browseSoundFile(type) {
        try {
            const result = await invoke('browse_sound_file');
            if (result) {
                const mapping = {
                    'copy': { pathKey: 'copySoundPath', inputId: 'copy-sound-path' },
                    'paste': { pathKey: 'pasteSoundPath', inputId: 'paste-sound-path' },
                    'preview-scroll': { pathKey: 'previewScrollSoundPath', inputId: 'preview-scroll-sound-path' }
                };

                const { pathKey, inputId } = mapping[type];
                this.settings[pathKey] = result;
                const input = document.getElementById(inputId);
                if (input) input.value = result;
                this.saveSettings();
            }
        } catch (error) {
            console.error('浏览音效文件失败:', error);
            showNotification('浏览文件失败', 'error');
        }
    }

    /**
     * 测试音效
     */
    async testSound(type) {
        const button = document.getElementById(`test-${type}-sound`);
        if (!button || button.classList.contains('playing')) return;

        const pathMapping = {
            'copy': 'copySoundPath',
            'paste': 'pasteSoundPath',
            'preview-scroll': 'previewScrollSoundPath'
        };

        try {
            button.classList.add('playing');
            button.disabled = true;

            invoke('test_sound', {
                soundPath: this.settings[pathMapping[type]] || '',
                volume: this.settings.soundVolume,
                soundType: type
            }).catch(error => {
                console.error('测试音效失败:', error);
                showNotification('音效测试失败', 'error');
            });

            setTimeout(() => {
                button.classList.remove('playing');
                button.disabled = false;
            }, 1500);
        } catch (error) {
            console.error('测试音效失败:', error);
            showNotification('音效测试失败', 'error');
            button.classList.remove('playing');
            button.disabled = false;
        }
    }

    /**
     * 更新音量显示
     */
    updateVolumeDisplay(volume) {
        const display = document.querySelector('#sound-volume').nextElementSibling;
        if (display) {
            display.textContent = `${volume}%`;
        }
    }
}

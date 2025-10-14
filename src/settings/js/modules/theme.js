/**
 * 主题设置模块
 */
import { invoke } from '@tauri-apps/api/core';
import { applyBackgroundImage } from '../../../js/backgroundManager.js';
import { setTheme } from '../../../js/themeManager.js';
import { showNotification } from '../../../js/notificationManager.js';
import { applyThemeWithTransition, getClickPosition } from '../../../js/themeTransition.js';

export class ThemeManager {
    constructor(settings, saveCallback) {
        this.settings = settings;
        this.saveSettings = saveCallback;
    }

    /**
     * 绑定主题设置事件
     */
    bindEvents() {
        this.bindThemeSelection();
        this.bindOpacitySlider();
        this.bindBackgroundImage();
    }

    /**
     * 绑定主题选择
     */
    bindThemeSelection() {
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', async (event) => {
                const theme = option.dataset.theme;
                
                // 立即更新设置并保存
                this.settings.theme = theme;
                this.saveSettings();
                
                const clickPos = getClickPosition(event);
                await applyThemeWithTransition(async () => {

                    this.setActiveTheme(theme, { withAnimation: false });
                    
                    // 切换背景图设置显隐
                    const bgSetting = document.getElementById('background-image-setting');
                    if (bgSetting) {
                        bgSetting.style.display = theme === 'background' ? '' : 'none';
                    }

                    await this.applyBackgroundToSettingsContainer();
                }, {
                    ...clickPos,
                    duration: 600,
                    easing: 'ease-in-out'
                });
            });
        });
    }

    /**
     * 绑定透明度滑块
     */
    bindOpacitySlider() {
        const opacitySlider = document.getElementById('opacity-slider');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                const opacity = parseFloat(e.target.value);
                this.settings.opacity = opacity;
                this.updateOpacityDisplay(opacity);
                this.saveSettings();
            });
        }
    }

    /**
     * 绑定背景图设置
     */
    bindBackgroundImage() {
        const browseBgBtn = document.getElementById('browse-background-image');
        if (browseBgBtn) {
            browseBgBtn.addEventListener('click', async () => {
                try {
                    const result = await invoke('browse_image_file');
                    if (result) {
                        this.settings.backgroundImagePath = result;
                        const bgPathInput = document.getElementById('background-image-path');
                        if (bgPathInput) bgPathInput.value = result;
                        await this.applyBackgroundToSettingsContainer();
                        this.saveSettings();
                    }
                } catch (error) {
                    console.error('浏览背景图片失败:', error);
                    showNotification('浏览图片失败', 'error');
                }
            });
        }
    }

    /**
     * 设置活动主题
     */
    setActiveTheme(theme, options = {}) {
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('active');
        });

        const themeOption = document.querySelector(`[data-theme="${theme}"]`);
        if (themeOption) {
            themeOption.classList.add('active');
        }

        setTheme(theme, options);
    }

    /**
     * 应用背景图到设置容器
     */
    async applyBackgroundToSettingsContainer() {
        await applyBackgroundImage({
            containerSelector: '.settings-container',
            theme: this.settings.theme,
            backgroundImagePath: this.settings.backgroundImagePath,
            windowName: '设置窗口'
        });
    }

    /**
     * 更新透明度显示
     */
    updateOpacityDisplay(opacity) {
        const percentage = Math.round(opacity * 100);
        const display = document.querySelector('.slider-value');
        if (display) {
            display.textContent = `${percentage}%`;
        }
    }
}

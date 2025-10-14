/**
 * AI设置模块
 */
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { showNotification } from '../../../js/notificationManager.js';
import { getCurrentAIConfig, saveAIConfig } from '../../../js/aiConfig.js';

export class AIManager {
    constructor(settings, saveCallback) {
        this.settings = settings;
        this.saveSettings = saveCallback;
    }

    /**
     * 绑定AI设置事件
     */
    bindEvents() {
        this.bindAIConfigInputs();
        this.bindRefreshModels();
        this.bindTestConfig();
        this.bindTranslationSettings();
        this.bindTranslationSwitch();
    }

    /**
     * 绑定AI配置输入
     */
    bindAIConfigInputs() {
        const inputs = ['ai-api-key', 'ai-model', 'ai-base-url'];
        inputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', async () => {
                    const configKey = id.replace('ai-', '').replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    const config = {};
                    config[configKey] = element.value;

                    await saveAIConfig(config);

                    const settingsKey = 'ai' + configKey.charAt(0).toUpperCase() + configKey.slice(1);
                    this.settings[settingsKey] = element.value;

                    showNotification('AI配置已保存', 'success');
                });
            }
        });

        // API密钥自动刷新模型列表
        const apiKeyInput = document.getElementById('ai-api-key');
        if (apiKeyInput) {
            let refreshTimeout = null;
            apiKeyInput.addEventListener('input', (e) => {
                const apiKey = e.target.value.trim();
                if (refreshTimeout) clearTimeout(refreshTimeout);

                if (apiKey && apiKey.length > 10) {
                    refreshTimeout = setTimeout(() => {
                        this.refreshModelsList(true);
                    }, 1500);
                }
            });
        }
    }

    /**
     * 绑定刷新模型列表
     */
    bindRefreshModels() {
        const refreshBtn = document.getElementById('refresh-ai-models');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshModelsList(false));
        }

        // 页面加载时自动刷新
        setTimeout(() => {
            const aiConfig = getCurrentAIConfig();
            if (aiConfig.apiKey && aiConfig.apiKey.trim() !== '') {
                this.refreshModelsList(true);
            }
        }, 1000);
    }

    /**
     * 刷新AI模型列表
     */
    async refreshModelsList(silent = false) {
        const refreshBtn = document.getElementById('refresh-ai-models');
        const modelSelect = document.getElementById('ai-model');

        if (!refreshBtn || !modelSelect) return;

        try {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i>';

            const aiConfig = getCurrentAIConfig();
            if (!aiConfig.apiKey || !aiConfig.baseUrl) {
                throw new Error('请先设置API密钥和API地址');
            }

            const { getAvailableAIModels, getModelDisplayName } = await import('../../../js/aiConfig.js');
            const models = await getAvailableAIModels();

            if (!models || models.length === 0) {
                throw new Error('未获取到可用模型列表');
            }

            const currentModel = aiConfig.model;
            modelSelect.innerHTML = '';

            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = getModelDisplayName(model);
                modelSelect.appendChild(option);
            });

            if (currentModel && !models.includes(currentModel)) {
                const option = document.createElement('option');
                option.value = currentModel;
                option.textContent = getModelDisplayName(currentModel) + ' (自定义)';
                modelSelect.insertBefore(option, modelSelect.firstChild);
            }

            if (currentModel) {
                modelSelect.value = currentModel;
            } else if (models.length > 0) {
                const recommendedModel = 'Qwen/Qwen2-7B-Instruct';
                const selectedModel = models.includes(recommendedModel) ? recommendedModel : models[0];
                modelSelect.value = selectedModel;
                await saveAIConfig({ model: selectedModel });
            }

            if (!silent) {
                showNotification(`成功加载 ${models.length} 个可用模型`, 'success');
            }
        } catch (error) {
            console.error('刷新AI模型列表失败:', error);
            if (!silent) {
                showNotification(error.message || '刷新模型列表失败', 'error');
            }
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="ti ti-refresh"></i>';
        }
    }

    /**
     * 绑定测试配置
     */
    bindTestConfig() {
        const testBtn = document.getElementById('test-ai-config');
        if (testBtn) {
            testBtn.addEventListener('click', async () => {
                try {
                    testBtn.disabled = true;
                    testBtn.innerHTML = '<i class="ti ti-loader"></i> 测试中...';

                    const { testAIConfig } = await import('../../../js/aiConfig.js');
                    const result = await testAIConfig();
                    
                    if (result) {
                        showNotification('AI配置测试成功', 'success');
                    } else {
                        throw new Error('AI配置测试失败');
                    }
                } catch (error) {
                    console.error('AI配置测试失败:', error);
                    showNotification(`AI配置测试失败: ${error.message}`, 'error');
                } finally {
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<i class="ti ti-test-pipe"></i> 测试配置';
                }
            });
        }
    }

    /**
     * 绑定AI翻译设置
     */
    bindTranslationSettings() {
        // AI输入速度
        const speedSlider = document.getElementById('ai-input-speed');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                const speed = parseInt(e.target.value);
                this.settings.aiInputSpeed = speed;
                this.updateInputSpeedDisplay(speed);
                this.saveSettings();
            });
        }

        // 侧边栏悬停延迟
        const hoverDelayInput = document.getElementById('sidebar-hover-delay');
        if (hoverDelayInput) {
            hoverDelayInput.addEventListener('change', async (e) => {
                let delay = parseFloat(e.target.value);
                delay = isNaN(delay) ? 0 : Math.max(0, Math.min(10, delay));
                e.target.value = delay;
                
                this.settings.sidebarHoverDelay = delay;
                this.saveSettings();
                
                try {
                    await emit('sidebar-hover-delay-changed', { delay });
                } catch (error) {
                    console.error('发送侧边栏悬停延迟更新事件失败:', error);
                }
            });
        }

        // 翻译测试
        const testTransBtn = document.getElementById('test-ai-translation');
        if (testTransBtn) {
            testTransBtn.addEventListener('click', async () => {
                try {
                    testTransBtn.disabled = true;
                    testTransBtn.innerHTML = '<i class="ti ti-loader"></i> 测试中...';

                    const isConfigValid = await invoke('check_ai_translation_config');
                    if (!isConfigValid) {
                        throw new Error('AI翻译配置无效，请检查AI配置和翻译设置');
                    }

                    const result = await invoke('test_ai_translation');
                    showNotification(`AI翻译测试成功: ${result}`, 'success');
                } catch (error) {
                    console.error('AI翻译测试失败:', error);
                    showNotification(`AI翻译测试失败: ${error}`, 'error');
                } finally {
                    testTransBtn.disabled = false;
                    testTransBtn.innerHTML = '<i class="ti ti-test-pipe"></i> 测试翻译';
                }
            });
        }
    }

    /**
     * 绑定AI翻译开关
     */
    bindTranslationSwitch() {
        const checkbox = document.getElementById('ai-translation-enabled');
        if (checkbox) {
            checkbox.addEventListener('change', async (e) => {
                try {
                    if (e.target.checked) {
                        const aiConfig = getCurrentAIConfig();
                        if (!aiConfig.apiKey || aiConfig.apiKey.trim() === '') {
                            e.target.checked = false;
                            showNotification('请先配置AI API密钥后再启用AI翻译功能', 'warning');
                            document.getElementById('ai-config-section')?.scrollIntoView({ behavior: 'smooth' });
                            return;
                        }

                        const isConfigValid = await invoke('check_ai_translation_config');
                        if (!isConfigValid) {
                            e.target.checked = false;
                            showNotification('AI配置无效，请检查AI配置后再启用AI翻译功能', 'warning');
                            document.getElementById('ai-config-section')?.scrollIntoView({ behavior: 'smooth' });
                            return;
                        }
                    }

                    this.settings.aiTranslationEnabled = e.target.checked;
                    this.saveSettings();
                    
                    await emit('ai-translation-state-changed', { enabled: e.target.checked });
                    
                    showNotification(
                        e.target.checked ? 'AI翻译功能已启用' : 'AI翻译功能已禁用',
                        e.target.checked ? 'success' : 'info'
                    );
                } catch (error) {
                    console.error('启用AI翻译失败:', error);
                    e.target.checked = !e.target.checked;
                    showNotification('启用AI翻译失败，请重试', 'error');
                }
            });
        }
    }

    /**
     * 更新AI输入速度显示
     */
    updateInputSpeedDisplay(speed) {
        const display = document.querySelector('#ai-input-speed').nextElementSibling;
        if (display) {
            display.textContent = `${speed} 字符/秒`;
        }
    }
}

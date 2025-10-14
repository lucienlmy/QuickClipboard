/**
 * AI配置管理模块
 */

import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

/**
 * AI配置对象
 */

/**
 * 默认AI配置
 */
const DEFAULT_AI_CONFIG = {
  enabled: false,
  apiKey: '',
  model: 'Qwen/Qwen2-7B-Instruct',
  baseUrl: 'https://api.siliconflow.cn/v1',
  timeoutSecs: 120,
  temperature: 0.3,
  maxTokens: 2048
};

/**
 * 当前AI配置
 */
let currentAIConfig = { ...DEFAULT_AI_CONFIG };

/**
 * AI配置变更监听器列表
 */
const configChangeListeners = [];

/**
 * 初始化AI配置管理器
 */
export async function initAIConfig(settings = null) {
  try {
    await loadAIConfig(settings);
    setupEventListeners();
  } catch (error) {
    console.error('AI配置管理器初始化失败:', error);
    throw error;
  }
}

/**
 * 加载AI配置
 */
export async function loadAIConfig(settings = null) {
  try {
    if (!settings) {
      settings = await invoke('get_settings');
    }

    currentAIConfig = {
      enabled: !!(settings.aiApiKey && settings.aiApiKey.trim() !== ''),
      apiKey: settings.aiApiKey || '',
      model: settings.aiModel || DEFAULT_AI_CONFIG.model,
      baseUrl: settings.aiBaseUrl || DEFAULT_AI_CONFIG.baseUrl,
      timeoutSecs: DEFAULT_AI_CONFIG.timeoutSecs,
      temperature: DEFAULT_AI_CONFIG.temperature,
      maxTokens: DEFAULT_AI_CONFIG.maxTokens
    };
    return { ...currentAIConfig };
  } catch (error) {
    console.error('加载AI配置失败:', error);
    currentAIConfig = { ...DEFAULT_AI_CONFIG };
    return { ...currentAIConfig };
  }
}

/**
 * 保存AI配置
 */
export async function saveAIConfig(config) {
  try {
    // 更新当前配置
    Object.assign(currentAIConfig, config);

    // 获取当前设置
    const settings = await invoke('get_settings');

    // 更新相关设置字段
    if (config.apiKey !== undefined) {
      settings.aiApiKey = config.apiKey;
      // 当API密钥变化时，自动更新enabled状态
      currentAIConfig.enabled = !!(config.apiKey && config.apiKey.trim() !== '');
    }
    if (config.model !== undefined) {
      settings.aiModel = config.model;
    }
    if (config.baseUrl !== undefined) {
      settings.aiBaseUrl = config.baseUrl;
    }

    // 保存设置
    await invoke('save_settings', { settings });

    // 通知配置变更
    notifyConfigChange(currentAIConfig);
  } catch (error) {
    console.error('保存AI配置失败:', error);
    throw error;
  }
}

/**
 * 获取当前AI配置
 */
export function getCurrentAIConfig() {
  return { ...currentAIConfig };
}

/**
 * 验证AI配置是否有效
 */
export function isAIConfigValid(config = currentAIConfig) {
  return !!(
    config.apiKey &&
    config.apiKey.trim() !== '' &&
    config.model &&
    config.model.trim() !== '' &&
    config.baseUrl &&
    config.baseUrl.trim() !== '' &&
    config.timeoutSecs > 0 &&
    config.temperature >= 0.0 &&
    config.temperature <= 2.0 &&
    config.maxTokens > 0
  );
}

/**
 * 获取可用的AI模型列表
 */
export async function getAvailableAIModels() {
  try {
    const models = await invoke('get_available_ai_models');
    return models || [];
  } catch (error) {
    console.error('获取AI模型列表失败:', error);
    throw error;
  }
}

/**
 * 测试AI配置
 */
export async function testAIConfig(config = null) {
  try {
    if (config) {
      // 临时保存配置进行测试
      await saveAIConfig(config);
    }

    const result = await invoke('test_ai_config');
    return result;
  } catch (error) {
    console.error('AI配置测试失败:', error);
    throw error;
  }
}

/**
 * 获取推荐的AI模型列表
 */
export function getRecommendedAIModels() {
  return [
    'Qwen/Qwen2-7B-Instruct',
    'deepseek-v3',
    'deepseek-chat',
    'deepseek-coder',
    'qwen-turbo',
    'qwen-plus',
    'qwen-max',
    'qwen2.5-72b-instruct',
    'qwen2.5-32b-instruct',
    'qwen2.5-14b-instruct',
    'qwen2.5-7b-instruct'
  ];
}

/**
 * 获取模型的友好显示名称
 */
export function getModelDisplayName(modelId) {
  const modelNames = {
    'Qwen/Qwen2-7B-Instruct': 'Qwen2-7B-Instruct（推荐）',
    'deepseek-v3': 'DeepSeek V3',
    'deepseek-chat': 'DeepSeek Chat',
    'deepseek-coder': 'DeepSeek Coder',
    'qwen-turbo': '通义千问 Turbo',
    'qwen-plus': '通义千问 Plus',
    'qwen-max': '通义千问 Max',
    'qwen2.5-72b-instruct': 'Qwen2.5-72B-Instruct',
    'qwen2.5-32b-instruct': 'Qwen2.5-32B-Instruct',
    'qwen2.5-14b-instruct': 'Qwen2.5-14B-Instruct',
    'qwen2.5-7b-instruct': 'Qwen2.5-7B-Instruct',
    'chatglm3-6b': 'ChatGLM3-6B',
    'yi-34b-chat': 'Yi-34B-Chat',
    'yi-6b-chat': 'Yi-6B-Chat',
    'baichuan2-13b-chat': 'Baichuan2-13B-Chat',
    'internlm2-chat-7b': 'InternLM2-Chat-7B',
    'internlm2-chat-20b': 'InternLM2-Chat-20B'
  };

  return modelNames[modelId] || modelId;
}

/**
 * 添加配置变更监听器
 */
export function addConfigChangeListener(listener) {
  if (typeof listener === 'function') {
    configChangeListeners.push(listener);
  }
}

/**
 * 移除配置变更监听器
 */
export function removeConfigChangeListener(listener) {
  const index = configChangeListeners.indexOf(listener);
  if (index > -1) {
    configChangeListeners.splice(index, 1);
  }
}

/**
 * 通知配置变更
 */
function notifyConfigChange(config) {
  configChangeListeners.forEach(listener => {
    try {
      listener(config);
    } catch (error) {
      console.error('配置变更监听器执行失败:', error);
    }
  });

  // 发送全局事件
  emit('ai-config-changed', config).catch(error => {
    console.error('发送AI配置变更事件失败:', error);
  });
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  // 监听设置变更事件
  listen('settings-changed', async (event) => {
    try {
      await loadAIConfig();
    } catch (error) {
      console.error('响应设置变更事件失败:', error);
    }
  });

  // 监听AI配置变更事件
  listen('ai-config-changed', (event) => {
    const config = event.payload;
    // 更新当前配置
    Object.assign(currentAIConfig, config);
  });
}

/**
 * 重置AI配置为默认值
 */
export async function resetAIConfig() {
  try {
    await saveAIConfig(DEFAULT_AI_CONFIG);
  } catch (error) {
    console.error('重置AI配置失败:', error);
    throw error;
  }
}

/**
 * 导出AI配置
 */
export function exportAIConfig() {
  return { ...currentAIConfig };
}

/**
 * 导入AI配置
 */
export async function importAIConfig(config) {
  try {
    if (!isAIConfigValid(config)) {
      throw new Error('导入的AI配置无效');
    }

    await saveAIConfig(config);
  } catch (error) {
    console.error('导入AI配置失败:', error);
    throw error;
  }
}

import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import {
  setIsAiTranslationEnabled,
  getIsAiTranslationEnabled
} from './config.js';
import { showNotification, showTranslationNotification } from './notificationManager.js';
import {
  initAIConfig,
  loadAIConfig,
  saveAIConfig,
  getCurrentAIConfig,
  isAIConfigValid,
  addConfigChangeListener
} from './aiConfig.js';

// AI翻译特定配置（非通用AI配置）
let aiTranslationConfig = {
  enabled: false, // 默认关闭，等待从后端加载真实设置
  targetLanguage: 'auto',
  translateOnCopy: false,
  translateOnPaste: false, // 默认关闭，等待从后端加载真实设置
  translationPrompt: '请将以下文本翻译成{target_language}，严格保持原文的所有格式、换行符、段落结构和空白字符，只返回翻译结果，不要添加任何解释或修改格式：',
  inputSpeed: 50
};

/**
 * 初始化AI翻译功能
 */
export async function initAiTranslation() {
  // 初始化AI配置管理器
  await initAIConfig();

  // 加载AI翻译设置
  await loadAiTranslationSettings();


  // 监听设置窗口的AI翻译状态变化
  await setupAiTranslationEventListeners();

  // 设置取消按钮事件
  setupCancelButton();

  // 监听AI配置变化
  addConfigChangeListener(onAIConfigChanged);
}

/**
 * AI配置变化监听器
 */
function onAIConfigChanged(aiConfig) {
  console.log('AI配置发生变化:', aiConfig);

  // AI配置变化不影响AI翻译开关状态
  // AI翻译开关状态只受AI翻译设置的影响
}

/**
 * 加载AI翻译设置
 */
async function loadAiTranslationSettings() {
  try {
    const settings = await invoke('get_settings');
    const aiConfig = await loadAIConfig();

    aiTranslationConfig = {
      enabled: settings.aiTranslationEnabled === true, // AI翻译总开关
      targetLanguage: settings.aiTargetLanguage || 'auto',
      translateOnCopy: settings.aiTranslateOnCopy === true, // 明确使用布尔值，避免默认值覆盖
      translateOnPaste: settings.aiTranslateOnPaste === true, // 明确使用布尔值，避免默认值覆盖
      translationPrompt: settings.aiTranslationPrompt || '请将以下文本翻译成{target_language}，严格保持原文的所有格式、换行符、段落结构和空白字符，只返回翻译结果，不要添加任何解释或修改格式：',
      inputSpeed: settings.aiInputSpeed || 50
    };

    // 更新UI状态
    setIsAiTranslationEnabled(settings.aiTranslationEnabled);
    // updateAiTranslationButtonState();
  } catch (error) {
    console.error('加载AI翻译设置失败:', error);
  }
}

/**
 * 更新所有AI翻译按钮状态
 */
export function updateAllAiTranslationButtons() {
  const enabled = getIsAiTranslationEnabled();
  
  // 更新工具管理器中的所有AI翻译按钮
  const toolButtons = document.querySelectorAll('[data-tool-id="ai-translation-button"]');
  toolButtons.forEach(element => {
    const button = element.classList.contains('unified-tool') ? element : element.querySelector('.unified-tool');
    if (button) {
      if (enabled) {
        button.classList.add('active');
        button.title = 'AI翻译 - 已开启';
      } else {
        button.classList.remove('active');
        button.title = 'AI翻译 - 已关闭';
      }
    }
  });
}

/**
 * AI翻译切换逻辑（导出供工具管理器使用）
 */
export async function toggleAiTranslation() {
  const currentEnabled = getIsAiTranslationEnabled();
  const newEnabled = !currentEnabled;
  console.log('AI翻译按钮点击，状态变化:', newEnabled);

  try {
    // 检查AI翻译配置是否有效
    const isConfigValid = await invoke('check_ai_translation_config');

    if (newEnabled && !isConfigValid) {
      // 配置无效，显示提示
      showAiTranslationConfigError();
      return false;
    }

    // 更新本地状态
    setIsAiTranslationEnabled(newEnabled);

    // 更新所有按钮状态（包括工具管理器中的按钮）
    updateAllAiTranslationButtons();

    // 保存AI翻译设置到后端
    await saveAiTranslationSetting('aiTranslationEnabled', newEnabled);

    // 发送状态变化事件给设置窗口
    await broadcastAiTranslationStateChange(newEnabled);

    return true;
  } catch (error) {
    console.error('切换AI翻译状态失败:', error);
    return false;
  }
}

/**
 * 设置AI翻译事件监听器
 */
async function setupAiTranslationEventListeners() {
  try {
    // 监听设置窗口的AI翻译状态变化
    await listen('ai-translation-state-changed', (event) => {
      const { enabled } = event.payload;
      console.log('收到AI翻译状态变化事件:', enabled);

      // 更新本地状态
      setIsAiTranslationEnabled(enabled);

      // 更新按钮UI
      updateAllAiTranslationButtons();
    });

    // 监听AI翻译设置更新
    await listen('ai-translation-settings-updated', (event) => {
      console.log('收到AI翻译设置更新事件:', event.payload);

      // 直接使用接收到的最新设置更新本地配置
      const newSettings = event.payload;
      if (newSettings) {
        aiTranslationConfig = {
          enabled: newSettings.aiTranslationEnabled === true, // AI翻译总开关
          targetLanguage: newSettings.aiTargetLanguage || aiTranslationConfig.targetLanguage,
          translateOnCopy: newSettings.aiTranslateOnCopy === true, // 明确使用布尔值
          translateOnPaste: newSettings.aiTranslateOnPaste === true, // 明确使用布尔值
          translationPrompt: newSettings.aiTranslationPrompt || aiTranslationConfig.translationPrompt,
          inputSpeed: newSettings.aiInputSpeed || aiTranslationConfig.inputSpeed
        };

        console.log('AI翻译配置已更新:', aiTranslationConfig);
        console.log('接收到的设置 - aiTranslateOnPaste:', newSettings.aiTranslateOnPaste, '类型:', typeof newSettings.aiTranslateOnPaste);
      } else {
        // 如果没有接收到具体设置，则重新加载
        loadAiTranslationSettings();
      }
    });

    // 监听后端发送的AI翻译取消事件
    await listen('ai-translation-cancelled', () => {
      console.log('收到后端AI翻译取消事件');
      hideTranslationIndicator();

      // 检查翻译功能是否启用
      if (aiTranslationConfig.enabled) {
        showTranslationNotification('翻译已取消', 'warning', 1500);
      }
    });

    // 监听后端发送的翻译开始事件
    await listen('translation-start', (event) => {
      const { message, source, textLength } = event.payload;
      console.log(`收到${source}翻译开始事件:`, message);

      // 检查翻译功能是否启用
      if (!aiTranslationConfig.enabled || !aiTranslationConfig.translateOnPaste) {
        console.log('翻译功能未启用，跳过显示开始通知');
        return;
      }

      showTranslationNotification(message, 'info', 1500);
      showTranslationStatus('starting');
    });

    // 监听后端发送的翻译状态事件
    await listen('translation-status', (event) => {
      const { status, message, source } = event.payload;
      console.log(`收到${source}翻译状态事件:`, message);

      // 检查翻译功能是否启用
      if (!aiTranslationConfig.enabled || !aiTranslationConfig.translateOnPaste) {
        console.log('翻译功能未启用，跳过显示状态通知');
        return;
      }

      showTranslationStatus(status, message);
    });

    // 监听后端发送的翻译成功事件
    await listen('translation-success', (event) => {
      const { message, source, originalLength } = event.payload;
      console.log(`收到${source}翻译成功事件:`, message);

      // 检查翻译功能是否启用
      if (!aiTranslationConfig.enabled || !aiTranslationConfig.translateOnPaste) {
        console.log('翻译功能未启用，跳过显示成功通知');
        return;
      }

      showTranslationNotification(message, 'success', 2000);
      showTranslationStatus('completed');
    });

    // 监听后端发送的翻译失败事件
    await listen('translation-error', (event) => {
      const { message, source, error } = event.payload;
      console.log(`收到${source}翻译失败事件:`, message);

      // 检查是否为"功能未启用"类型的错误，如果是则不显示通知
      const errorStr = error.toLowerCase();
      if (errorStr.includes('未启用') || errorStr.includes('disabled') || errorStr.includes('not enabled')) {
        console.log('翻译功能未启用，跳过显示错误通知');
        return;
      }

      // 只有真正的翻译错误才显示通知
      showTranslationNotification(`翻译失败: ${error}`, 'warning', 3000);
      showTranslationStatus('failed', error);
    });

    // 监听后端发送的显示翻译指示器事件
    await listen('show-translation-indicator', (event) => {
      const { text, source } = event.payload;
      console.log(`收到${source}显示翻译指示器事件:`, text);

      // 检查翻译功能是否启用
      if (!aiTranslationConfig.enabled || !aiTranslationConfig.translateOnPaste) {
        console.log('翻译功能未启用，跳过显示翻译指示器');
        return;
      }

      showTranslationIndicator(text);
    });

    // 监听后端发送的隐藏翻译指示器事件
    await listen('hide-translation-indicator', (event) => {
      const { source } = event.payload;
      console.log(`收到${source}隐藏翻译指示器事件`);

      // 无论如何都要隐藏指示器，确保界面清洁
      hideTranslationIndicator();
    });

  } catch (error) {
    console.error('设置AI翻译事件监听器失败:', error);
  }
}

/**
 * 保存AI翻译设置
 */
async function saveAiTranslationSetting(key, value) {
  try {
    const settings = await invoke('get_settings');
    settings[key] = value;
    await invoke('save_settings', { settings });
    console.log(`AI翻译设置已保存: ${key} = ${value}`);
  } catch (error) {
    console.error('保存AI翻译设置失败:', error);
    throw error;
  }
}

/**
 * 广播AI翻译状态变化
 */
async function broadcastAiTranslationStateChange(enabled) {
  try {
    // 发送事件给设置窗口
    await emit('ai-translation-state-changed', { enabled });
    console.log('广播AI翻译状态变化:', enabled);
  } catch (error) {
    console.error('广播AI翻译状态变化失败:', error);
  }
}

/**
 * 显示AI翻译配置错误提示
 */
function showAiTranslationConfigError() {
  console.warn('AI翻译配置无效，请先在设置中配置API密钥等信息');

  // 使用自定义翻译通知系统显示错误提示
  showTranslationNotification('请先配置API密钥和模型信息', 'error', 4000);
}

/**
 * 测试AI翻译功能
 */
export async function testAiTranslation() {
  try {
    console.log('开始测试AI翻译功能...');
    const result = await invoke('test_ai_translation');
    console.log('AI翻译测试成功:', result);
    return result;
  } catch (error) {
    console.error('AI翻译测试失败:', error);
    throw error;
  }
}

/**
 * 取消正在进行的翻译
 */
export async function cancelTranslation() {
  try {
    await invoke('cancel_translation');
    hideTranslationIndicator();

    // 检查翻译功能是否启用
    if (aiTranslationConfig.enabled) {
      showTranslationNotification('翻译已取消', 'warning', 1500);
    }

    console.log('[AI翻译] 用户取消翻译');
  } catch (error) {
    console.error('取消翻译失败:', error);
  }
}

/**
 * 根据检测到的语言自动选择目标语言
 */
function getAutoTargetLanguage(text) {
  const detectedLang = detectTextLanguage(text);
  console.log('检测到的语言:', detectedLang);

  // 自动选择逻辑：中文→英文，英文→中文，其他→中文
  switch (detectedLang) {
    case 'zh':
      return 'en'; // 中文翻译成英文
    case 'en':
      return 'zh-CN'; // 英文翻译成中文
    default:
      return 'zh-CN'; // 其他语言默认翻译成中文
  }
}

/**
 * 翻译文本并输入
 */
export async function translateAndInputText(text) {
  let originalTargetLanguage = null;

  try {
    // 翻译开始反馈
    await handleTranslationStart(text);
    showTranslationStatus('translating');

    // 检查是否需要自动选择目标语言
    if (aiTranslationConfig.targetLanguage === 'auto') {
      // 保存原始设置
      originalTargetLanguage = aiTranslationConfig.targetLanguage;

      // 自动选择目标语言
      const autoTargetLanguage = getAutoTargetLanguage(text);
      console.log('自动选择的目标语言:', autoTargetLanguage);

      // 临时更新设置
      await saveAiTranslationSetting('aiTargetLanguage', autoTargetLanguage);
      aiTranslationConfig.targetLanguage = autoTargetLanguage;
    }

    console.log('开始翻译文本:', text);
    await invoke('translate_text_smart', { text });

    // 如果使用了自动选择，恢复原始设置
    if (originalTargetLanguage !== null) {
      await saveAiTranslationSetting('aiTargetLanguage', originalTargetLanguage);
      aiTranslationConfig.targetLanguage = originalTargetLanguage;
    }

    // 翻译成功反馈
    await handleTranslationSuccess(text, text.length); // 这里无法获取实际翻译长度，使用原文长度
    console.log('文本翻译和输入完成');
  } catch (error) {
    console.error('翻译文本失败:', error);

    // 如果使用了自动选择，确保恢复原始设置
    if (originalTargetLanguage !== null) {
      try {
        await saveAiTranslationSetting('aiTargetLanguage', originalTargetLanguage);
        aiTranslationConfig.targetLanguage = originalTargetLanguage;
      } catch (restoreError) {
        console.error('恢复目标语言设置失败:', restoreError);
      }
    }

    // 检查是否是用户取消
    if (error.toString().includes('翻译已被取消')) {
      hideTranslationIndicator();
      if (aiTranslationConfig.enabled) {
        showTranslationNotification('翻译已取消', 'warning', 1500);
      }
      return; // 不抛出错误，因为这是正常的取消操作
    }

    // 翻译失败反馈
    await handleTranslationError(error, text);

    // 根据错误类型提供不同的错误信息
    const errorMessage = getTranslationErrorMessage(error);
    throw new Error(errorMessage);
  }
}

/**
 * 获取翻译错误信息
 */
function getTranslationErrorMessage(error) {
  const errorStr = error.toString().toLowerCase();

  // 网络相关错误
  if (errorStr.includes('network') || errorStr.includes('网络') ||
    errorStr.includes('connection') || errorStr.includes('连接')) {
    return '网络连接失败，请检查网络连接';
  }

  // 认证相关错误
  if (errorStr.includes('authentication') || errorStr.includes('认证') ||
    errorStr.includes('401') || errorStr.includes('unauthorized') ||
    errorStr.includes('invalid api key') || errorStr.includes('api key')) {
    return 'API认证失败，请检查API密钥是否正确';
  }

  // 限流相关错误
  if (errorStr.includes('rate limit') || errorStr.includes('限流') ||
    errorStr.includes('429') || errorStr.includes('too many requests') ||
    errorStr.includes('quota') || errorStr.includes('配额')) {
    return 'API调用频率过高或配额不足，请稍后再试';
  }

  // 超时相关错误
  if (errorStr.includes('timeout') || errorStr.includes('超时') ||
    errorStr.includes('timed out') || errorStr.includes('time out')) {
    return '翻译请求超时，请稍后再试';
  }

  // 服务器错误
  if (errorStr.includes('500') || errorStr.includes('502') ||
    errorStr.includes('503') || errorStr.includes('504') ||
    errorStr.includes('server error') || errorStr.includes('服务器错误')) {
    return '服务器暂时不可用，请稍后再试';
  }

  // 配置相关错误
  if (errorStr.includes('config') || errorStr.includes('配置') ||
    errorStr.includes('setting') || errorStr.includes('设置')) {
    return 'AI翻译配置错误，请检查设置';
  }

  // 模型相关错误
  if (errorStr.includes('model') || errorStr.includes('模型') ||
    errorStr.includes('not found') || errorStr.includes('不存在')) {
    return '所选AI模型不可用，请尝试其他模型';
  }

  // 内容相关错误
  if (errorStr.includes('content') || errorStr.includes('内容') ||
    errorStr.includes('text too long') || errorStr.includes('文本过长')) {
    return '文本内容不符合要求，请检查文本长度和格式';
  }

  // 权限相关错误
  if (errorStr.includes('permission') || errorStr.includes('权限') ||
    errorStr.includes('forbidden') || errorStr.includes('403')) {
    return '权限不足，请检查API密钥权限';
  }

  // 默认错误信息
  return `翻译失败: ${error}`;
}

/**
 * 复制时翻译文本并直接输入到目标位置
 */
export async function translateAndInputOnCopy(text) {
  // 检查是否应该进行翻译
  const translationCheck = shouldTranslateText(text, 'copy');
  if (!translationCheck.should) {
    console.log('跳过复制时翻译:', translationCheck.reason);
    return;
  }

  console.log('开始复制时翻译:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));

  // 显示翻译指示器
  showTranslationIndicator('正在翻译复制的内容...');

  try {
    // 自动选择目标语言
    let originalTargetLanguage = null;
    if (aiTranslationConfig.targetLanguage === 'auto') {
      const detectedLanguage = detectTextLanguage(text);
      const targetLanguage = detectedLanguage === 'zh' ? 'en' : 'zh-CN';

      originalTargetLanguage = aiTranslationConfig.targetLanguage;
      await saveAiTranslationSetting('aiTargetLanguage', targetLanguage);
      aiTranslationConfig.targetLanguage = targetLanguage;

      console.log(`自动选择目标语言: ${detectedLanguage} -> ${targetLanguage}`);
    }

    // 调用后端翻译并直接输入到目标位置
    await invoke('translate_and_input_on_copy', { text });

    // 如果使用了自动选择，恢复原始设置
    if (originalTargetLanguage !== null) {
      await saveAiTranslationSetting('aiTargetLanguage', originalTargetLanguage);
      aiTranslationConfig.targetLanguage = originalTargetLanguage;
    }

    // 翻译成功反馈
    if (aiTranslationConfig.enabled) {
      showTranslationNotification('复制内容已翻译并输入', 'success', 1500);
    }
    console.log('复制时翻译完成');
  } catch (error) {
    console.error('复制时翻译失败:', error);

    // 如果使用了自动选择，确保恢复原始设置
    if (originalTargetLanguage !== null) {
      try {
        await saveAiTranslationSetting('aiTargetLanguage', originalTargetLanguage);
        aiTranslationConfig.targetLanguage = originalTargetLanguage;
      } catch (restoreError) {
        console.error('恢复目标语言设置失败:', restoreError);
      }
    }

    if (aiTranslationConfig.enabled) {
      showTranslationNotification(`复制时翻译失败: ${error}`, 'error', 3000);
    }
  } finally {
    hideTranslationIndicator();
  }
}

/**
 * 安全的翻译文本并输入（带降级处理）
 */
export async function safeTranslateAndInputText(text, fallbackCallback) {
  try {
    await translateAndInputText(text);
    return { success: true, method: 'translation' };
  } catch (error) {
    console.warn('AI翻译失败，使用降级处理:', error);

    // 执行降级回调（通常是原始粘贴）
    if (fallbackCallback && typeof fallbackCallback === 'function') {
      try {
        await fallbackCallback();
        return { success: true, method: 'fallback', error: error.message };
      } catch (fallbackError) {
        console.error('降级处理也失败了:', fallbackError);
        return { success: false, method: 'none', error: fallbackError.message };
      }
    } else {
      return { success: false, method: 'none', error: error.message };
    }
  }
}

/**
 * 重试翻译（带指数退避）
 */
export async function retryTranslation(text, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`翻译尝试 ${attempt}/${maxRetries}:`, text);
      await translateAndInputText(text);
      return { success: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      console.warn(`翻译尝试 ${attempt} 失败:`, error);

      // 如果是配置错误或认证错误，不需要重试
      const errorStr = error.toString().toLowerCase();
      if (errorStr.includes('config') || errorStr.includes('authentication') || errorStr.includes('401')) {
        break;
      }

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // 指数退避
        console.log(`等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * 获取AI翻译配置
 */
export function getAiTranslationConfig() {
  return { ...aiTranslationConfig };
}

/**
 * 检查是否应该进行翻译
 */
export function shouldTranslate(context = 'paste') {
  // 检查AI功能是否启用
  const aiConfig = getCurrentAIConfig();
  if (!aiConfig.enabled) {
    return false;
  }

  // 检查AI翻译功能是否启用
  if (!getIsAiTranslationEnabled()) {
    return false;
  }

  if (context === 'copy') {
    return aiTranslationConfig.translateOnCopy;
  } else if (context === 'paste') {
    return aiTranslationConfig.translateOnPaste;
  }

  return false;
}

/**
 * 检查文本是否适合翻译
 */
export function isTextSuitableForTranslation(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return true;
}

/**
 * 检查翻译配置是否有效
 */
export function isTranslationConfigValid() {
  // 检查AI配置是否有效
  const aiConfig = getCurrentAIConfig();
  if (!aiConfig.enabled || !isAIConfigValid(aiConfig)) {
    return false;
  }

  // 检查AI翻译功能是否启用
  if (!getIsAiTranslationEnabled()) {
    return false;
  }

  // 检查翻译特定配置
  return aiTranslationConfig.targetLanguage &&
    aiTranslationConfig.targetLanguage.trim() !== '';
}

/**
 * 检查是否应该进行翻译（完整检查）
 */
export function shouldTranslateText(text, context = 'paste') {
  // 基础开关检查
  if (!shouldTranslate(context)) {
    return { should: false, reason: 'AI翻译功能未启用或未配置相应的翻译时机' };
  }

  // 配置有效性检查
  if (!isTranslationConfigValid()) {
    return { should: false, reason: 'AI翻译配置无效，请检查API密钥等设置' };
  }

  // 文本适合性检查
  if (!isTextSuitableForTranslation(text)) {
    return { should: false, reason: '文本不适合翻译（可能是代码、URL、路径等）' };
  }

  return { should: true, reason: '满足翻译条件' };
}

/**
 * 检测文本语言（简单实现）
 */
export function detectTextLanguage(text) {
  if (!text || typeof text !== 'string') {
    return 'unknown';
  }

  const trimmedText = text.trim();

  // 检测中文
  const chinesePattern = /[\u4e00-\u9fa5]/;
  const chineseMatches = trimmedText.match(/[\u4e00-\u9fa5]/g);
  const chineseRatio = chineseMatches ? chineseMatches.length / trimmedText.length : 0;

  // 检测英文
  const englishPattern = /[a-zA-Z]/;
  const englishMatches = trimmedText.match(/[a-zA-Z]/g);
  const englishRatio = englishMatches ? englishMatches.length / trimmedText.length : 0;

  // 检测日文
  const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/;
  const japaneseMatches = trimmedText.match(/[\u3040-\u309f\u30a0-\u30ff]/g);
  const japaneseRatio = japaneseMatches ? japaneseMatches.length / trimmedText.length : 0;

  // 检测韩文
  const koreanPattern = /[\uac00-\ud7af]/;
  const koreanMatches = trimmedText.match(/[\uac00-\ud7af]/g);
  const koreanRatio = koreanMatches ? koreanMatches.length / trimmedText.length : 0;

  // 根据比例判断主要语言
  const ratios = [
    { lang: 'zh', ratio: chineseRatio },
    { lang: 'en', ratio: englishRatio },
    { lang: 'ja', ratio: japaneseRatio },
    { lang: 'ko', ratio: koreanRatio }
  ];

  ratios.sort((a, b) => b.ratio - a.ratio);

  // 如果最高比例超过30%，认为是该语言
  if (ratios[0].ratio > 0.3) {
    return ratios[0].lang;
  }

  return 'unknown';
}

/**
 * 播放翻译相关音效
 */
export async function playTranslationSound(type = 'success') {
  try {
    // 检查音效是否启用
    const settings = await invoke('get_settings');
    if (!settings.soundEnabled) {
      return;
    }

    let soundPath;
    switch (type) {
      case 'start':
        soundPath = 'sounds/translation_start.mp3'; // 翻译开始音效
        break;
      case 'success':
        soundPath = 'sounds/translation_success.mp3'; // 翻译成功音效
        break;
      case 'error':
        soundPath = 'sounds/translation_error.mp3'; // 翻译失败音效
        break;
      default:
        soundPath = 'sounds/notification.mp3'; // 默认通知音效
    }

    // 播放音效
    await invoke('play_sound', { path: soundPath });
  } catch (error) {
    console.warn('播放翻译音效失败:', error);
  }
}



/**
 * 显示翻译状态提示
 */
export function showTranslationStatus(status, details = '') {
  const statusMap = {
    'starting': { text: '正在启动翻译...', icon: '🚀' },
    'translating': { text: '正在翻译...', icon: '🌐' },
    'inputting': { text: '正在输入翻译结果...', icon: '⌨️' },
    'completed': { text: '翻译完成', icon: '✅' },
    'failed': { text: '翻译失败', icon: '❌' },
    'cancelled': { text: '翻译已取消', icon: '⏹️' }
  };

  const statusInfo = statusMap[status] || { text: status, icon: '📝' };
  const message = details ? `${statusInfo.text}: ${details}` : statusInfo.text;

  updateTranslationIndicator(`${statusInfo.icon} ${message}`);
  console.log(`[AI翻译] ${message}`);
}

/**
 * 翻译成功的用户反馈
 */
export async function handleTranslationSuccess(originalText, translatedLength) {
  try {
    // 检查翻译功能是否启用
    if (!aiTranslationConfig.enabled) {
      return;
    }

    // 播放成功音效
    await playTranslationSound('success');

    // 显示成功通知
    const message = `翻译完成 (${originalText.length} → ${translatedLength} 字符)`;
    showTranslationNotification(message, 'success', 2000);

    // 更新状态
    showTranslationStatus('completed');

    console.log('[AI翻译] 翻译成功:', { originalLength: originalText.length, translatedLength });
  } catch (error) {
    console.warn('处理翻译成功反馈失败:', error);
  }
}

/**
 * 翻译失败的用户反馈
 */
export async function handleTranslationError(error, originalText) {
  try {
    // 检查翻译功能是否启用
    if (!aiTranslationConfig.enabled) {
      return;
    }

    // 播放错误音效
    await playTranslationSound('error');

    // 显示错误通知
    const errorMessage = getTranslationErrorMessage(error);
    showTranslationNotification(errorMessage, 'error', 4000);

    // 更新状态
    showTranslationStatus('failed', errorMessage);

    console.error('[AI翻译] 翻译失败:', { error: errorMessage, originalText: originalText.substring(0, 100) });
  } catch (feedbackError) {
    console.warn('处理翻译失败反馈失败:', feedbackError);
  }
}

/**
 * 翻译开始的用户反馈
 */
export async function handleTranslationStart(text) {
  try {
    // 检查翻译功能是否启用
    if (!getIsAiTranslationEnabled()) {
      return;
    }

    // 播放开始音效
    await playTranslationSound('start');

    // 显示开始通知
    const message = `开始翻译 (${text.length} 字符)`;
    showTranslationNotification(message, 'info', 1500);

    // 更新状态
    showTranslationStatus('starting');

    console.log('[AI翻译] 翻译开始:', { textLength: text.length });
  } catch (error) {
    console.warn('处理翻译开始反馈失败:', error);
  }
}

/**
 * 设置取消按钮事件
 */
function setupCancelButton() {
  const cancelButton = document.getElementById('cancel-translation-btn');
  if (cancelButton) {
    cancelButton.addEventListener('click', async () => {
      await cancelTranslation();
    });
  }
}





/**
 * 显示翻译进度指示器
 */
export function showTranslationIndicator(text = '正在翻译...') {
  const indicator = document.getElementById('ai-translation-indicator');
  if (indicator) {
    const textElement = indicator.querySelector('.indicator-text');
    if (textElement) {
      textElement.textContent = text;
    }

    // 添加淡入动画
    indicator.style.opacity = '0';
    indicator.style.display = 'block';

    // 使用requestAnimationFrame确保动画流畅
    requestAnimationFrame(() => {
      indicator.style.transition = 'opacity 0.3s ease-in-out';
      indicator.style.opacity = '1';
    });
  }
}

/**
 * 隐藏翻译进度指示器
 */
export function hideTranslationIndicator() {
  const indicator = document.getElementById('ai-translation-indicator');
  if (indicator) {
    // 添加淡出动画
    indicator.style.transition = 'opacity 0.3s ease-in-out';
    indicator.style.opacity = '0';

    // 动画完成后隐藏元素
    setTimeout(() => {
      indicator.style.display = 'none';
    }, 300);
  }
}

/**
 * 更新翻译进度指示器文本
 */
export function updateTranslationIndicator(text) {
  const indicator = document.getElementById('ai-translation-indicator');
  if (indicator) {
    const textElement = indicator.querySelector('.indicator-text');
    if (textElement) {
      // 添加文本更新动画
      textElement.style.transition = 'opacity 0.2s ease-in-out';
      textElement.style.opacity = '0.7';

      setTimeout(() => {
        textElement.textContent = text;
        textElement.style.opacity = '1';
      }, 100);
    }
  }
}

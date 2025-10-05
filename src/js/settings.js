import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getDominantColor, generateTitleBarColors, applyTitleBarColors, removeTitleBarColors } from './colorAnalyzer.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { confirm } from '@tauri-apps/plugin-dialog';
import { setTheme, getCurrentTheme, getAvailableThemes, addThemeChangeListener } from './themeManager.js';
import { updateShortcutDisplay } from './settingsManager.js';
import { showNotification } from './notificationManager.js';
import {
  initAIConfig,
  getCurrentAIConfig,
  saveAIConfig
} from './aiConfig.js';
import { settingsSearch } from './settingsSearch.js';
import { initDisableBrowserShortcuts } from './utils/disableBrowserShortcuts.js';

// =================== 启动横幅 ===================
function printSettingsBanner() {
  console.log('');
  console.log('███╗   ███╗ ██████╗ ███████╗██╗  ██╗███████╗███╗   ██╗ ██████╗ ');
  console.log('████╗ ████║██╔═══██╗██╔════╝██║  ██║██╔════╝████╗  ██║██╔════╝ ');
  console.log('██╔████╔██║██║   ██║███████╗███████║█████╗  ██╔██╗ ██║██║  ███╗');
  console.log('██║╚██╔╝██║██║   ██║╚════██║██╔══██║██╔══╝  ██║╚██╗██║██║   ██║');
  console.log('██║ ╚═╝ ██║╚██████╔╝███████║██║  ██║███████╗██║ ╚████║╚██████╔╝');
  console.log('╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝ ╚═════╝ ');
  console.log('');
  console.log('Settings Window - 设置窗口');
  console.log('Author: MoSheng | QuickClipboard v1.0.0');
  console.log('Settings window initializing...');
  console.log('');
}
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});
// 当前窗口实例
const currentWindow = getCurrentWindow();

// 设置数据 - 将从后端加载
let settings = {};

// 初始化设置页面
document.addEventListener('DOMContentLoaded', async () => {
  // 输出启动横幅
  printSettingsBanner();

  // 禁用浏览器默认快捷键
  initDisableBrowserShortcuts();

  // 初始化主题管理器
  const { initThemeManager } = await import('./themeManager.js');
  initThemeManager();

  // 初始化AI配置管理器
  await initAIConfig();

  await loadSettings();
  await initializeUI();
  bindEvents();
  // 来自托盘或其他窗口的设置变更同步到设置界面
  try {
    await listen('settings-changed', (event) => {
      const newSettings = event?.payload || {};
      // 同步剪贴板监听开关
      if (typeof newSettings.clipboardMonitor === 'boolean') {
        settings.clipboardMonitor = newSettings.clipboardMonitor;
        const el = document.getElementById('clipboard-monitor');
        if (el && el.checked !== newSettings.clipboardMonitor) {
          el.checked = newSettings.clipboardMonitor;
        }
      }
    });
  } catch (e) {
    console.warn('监听设置变更事件失败:', e);
  }
  setupWindowEvents();
  
  // 初始化搜索功能
  setTimeout(() => {
    settingsSearch.init();
  }, 100);
});

// 默认设置
const defaultSettings = {
  autoStart: false,
  startHidden: false,
  runAsAdmin: false,
  showStartupNotification: true,
  historyLimit: 100,
  theme: 'light',
  opacity: 0.9,
  backgroundImagePath: '',
  toggleShortcut: 'Win+V',
  numberShortcuts: true,
  clipboardMonitor: true,
  ignoreDuplicates: true,
  saveImages: true,
  showImagePreview: false,
  soundEnabled: true,
  soundVolume: 50,
  copySoundPath: '',
  pasteSoundPath: '',
  screenshotEnabled: true,
  screenshotShortcut: 'Ctrl+Shift+A',
  screenshotQuality: 85,
  screenshotAutoSave: false,
  screenshotShowHints: true,
  previewItemsCount: 5,
  previewAutoPaste: true,
  previewScrollSound: true,
  previewScrollSoundPath: 'sounds/roll.mp3',
  previewShortcut: 'Ctrl+`',
  // 剪贴板窗口快捷键设置
  navigateUpShortcut: 'ArrowUp',
  navigateDownShortcut: 'ArrowDown',
  tabLeftShortcut: 'ArrowLeft',
  tabRightShortcut: 'ArrowRight',
  focusSearchShortcut: 'Tab',
  hideWindowShortcut: 'Escape',
  executeItemShortcut: 'Ctrl+Enter',
  previousGroupShortcut: 'Ctrl+ArrowUp',
  nextGroupShortcut: 'Ctrl+ArrowDown',
  togglePinShortcut: 'Ctrl+P',
  // 窗口行为设置
  autoFocusSearch: false,
  // AI翻译设置
  aiTranslationEnabled: false,
  aiApiKey: '',
  aiModel: 'Qwen/Qwen2-7B-Instruct',
  aiBaseUrl: 'https://api.siliconflow.cn/v1',
  aiTargetLanguage: 'auto',
  aiTranslateOnCopy: false,
  aiTranslateOnPaste: true,
  aiTranslationPrompt: '请将以下文本翻译成{target_language}，严格保持原文的所有格式、换行符、段落结构和空白字符，只返回翻译结果，不要添加任何解释或修改格式：',
  aiInputSpeed: 50,
  aiNewlineMode: 'auto',
  aiOutputMode: 'stream',
  // 鼠标设置
  mouseMiddleButtonEnabled: true,
  // 窗口位置和大小设置
  windowPositionMode: 'smart',
  rememberWindowSize: false,
  savedWindowPosition: null,
  savedWindowSize: null,
  titleBarPosition: 'top',
  // 显示行为
  autoScrollToTopOnShow: false,
  // 贴边隐藏设置
  edgeHideEnabled: true,
  // 应用黑白名单设置
  appFilterEnabled: false,
  appFilterMode: 'blacklist',
  appFilterList: [],
  // 图片粘贴策略
  imageDataPriorityApps: []
};

// 加载设置
async function loadSettings() {
  try {
    // 使用reload_settings确保从配置文件获取最新状态
    const savedSettings = await invoke('reload_settings');
    // 合并默认设置和保存的设置，确保所有字段都有值
    settings = { ...defaultSettings, ...savedSettings };

    // 特殊处理：如果toggleShortcut为空，使用默认值
    if (!settings.toggleShortcut || settings.toggleShortcut.trim() === '') {
      settings.toggleShortcut = defaultSettings.toggleShortcut;
    }

    // 获取当前管理员状态，确保UI显示与实际状态一致
    try {
      const adminStatus = await invoke('get_admin_status');
      console.log('当前管理员状态:', adminStatus);

      // 如果设置要求管理员运行但当前不是管理员，说明可能需要重启
      if (settings.runAsAdmin && !adminStatus.is_admin) {
        console.log('设置要求管理员运行但当前不是管理员权限');
      }
    } catch (error) {
      console.error('获取管理员状态失败:', error);
    }

    console.log('设置加载成功:', settings);
  } catch (error) {
    console.error('加载设置失败:', error);
    // 使用默认设置
    settings = { ...defaultSettings };
  }
}

// 保存设置
async function saveSettings() {
  try {
    await invoke('save_settings', { settings });

    // 发送设置变更事件到主窗口
    await emit('settings-changed', settings);

    showNotification('设置已保存', 'success');
  } catch (error) {
    console.error('保存设置失败:', error);
    showNotification('保存设置失败', 'error');
  }
}

// 初始化UI
async function initializeUI() {
  // 设置表单值
  document.getElementById('auto-start').checked = settings.autoStart;
  document.getElementById('start-hidden').checked = settings.startHidden;
  document.getElementById('run-as-admin').checked = settings.runAsAdmin;
  document.getElementById('show-startup-notification').checked = settings.showStartupNotification;
  document.getElementById('history-limit').value = settings.historyLimit;
  const toggleShortcutInput = document.getElementById('toggle-shortcut');
  if (toggleShortcutInput) {
    toggleShortcutInput.value = settings.toggleShortcut || 'Win+V';
    console.log('设置快捷键显示值:', settings.toggleShortcut);
  }
  document.getElementById('number-shortcuts').checked = settings.numberShortcuts;
  document.getElementById('number-shortcuts-modifier').value = settings.numberShortcutsModifier || 'Ctrl';
  document.getElementById('clipboard-monitor').checked = settings.clipboardMonitor;
  document.getElementById('ignore-duplicates').checked = settings.ignoreDuplicates;
  document.getElementById('save-images').checked = settings.saveImages;
  document.getElementById('show-image-preview').checked = settings.showImagePreview;

  const bgPathInput = document.getElementById('background-image-path');
  if (bgPathInput) {
    bgPathInput.value = settings.backgroundImagePath || '';
  }

  // 音效设置
  document.getElementById('sound-enabled').checked = settings.soundEnabled;
  document.getElementById('sound-volume').value = settings.soundVolume;
  document.getElementById('copy-sound-path').value = settings.copySoundPath;
  document.getElementById('paste-sound-path').value = settings.pasteSoundPath;

  // 预览窗口设置
  document.getElementById('preview-enabled').checked = settings.previewEnabled;
  document.getElementById('preview-shortcut').value = settings.previewShortcut;
  document.getElementById('preview-items-count').value = settings.previewItemsCount;
  document.getElementById('preview-auto-paste').checked = settings.previewAutoPaste;
  document.getElementById('preview-scroll-sound').checked = settings.previewScrollSound;
  document.getElementById('preview-scroll-sound-path').value = settings.previewScrollSoundPath;

  // 剪贴板窗口快捷键设置
  const clipboardShortcutInputs = [
    { id: 'navigate-up-shortcut', key: 'navigateUpShortcut' },
    { id: 'navigate-down-shortcut', key: 'navigateDownShortcut' },
    { id: 'tab-left-shortcut', key: 'tabLeftShortcut' },
    { id: 'tab-right-shortcut', key: 'tabRightShortcut' },
    { id: 'focus-search-shortcut', key: 'focusSearchShortcut' },
    { id: 'hide-window-shortcut', key: 'hideWindowShortcut' },
    { id: 'execute-item-shortcut', key: 'executeItemShortcut' },
    { id: 'previous-group-shortcut', key: 'previousGroupShortcut' },
    { id: 'next-group-shortcut', key: 'nextGroupShortcut' },
    { id: 'toggle-pin-shortcut', key: 'togglePinShortcut' }
  ];

  clipboardShortcutInputs.forEach(({ id, key }) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = settings[key] || defaultSettings[key];
    }
  });

  // 截屏设置
  document.getElementById('screenshot-enabled').checked = settings.screenshot_enabled;
  document.getElementById('screenshot-shortcut').value = settings.screenshot_shortcut;
  document.getElementById('screenshot-quality').value = settings.screenshot_quality;
  document.getElementById('screenshot-auto-save').checked = settings.screenshot_auto_save;
  document.getElementById('screenshot-show-hints').checked = settings.screenshot_show_hints;

  // AI配置设置
  const aiConfig = getCurrentAIConfig();
  document.getElementById('ai-api-key').value = aiConfig.apiKey;
  document.getElementById('ai-model').value = aiConfig.model;
  document.getElementById('ai-base-url').value = aiConfig.baseUrl;

  // AI翻译设置
  document.getElementById('ai-translation-enabled').checked = settings.aiTranslationEnabled;
  document.getElementById('ai-target-language').value = settings.aiTargetLanguage;
  document.getElementById('ai-translate-on-copy').checked = settings.aiTranslateOnCopy;
  document.getElementById('ai-translate-on-paste').checked = settings.aiTranslateOnPaste;
  document.getElementById('ai-translation-prompt').value = settings.aiTranslationPrompt;
  document.getElementById('ai-input-speed').value = settings.aiInputSpeed;
  document.getElementById('ai-newline-mode').value = settings.aiNewlineMode;
  document.getElementById('ai-output-mode').value = settings.aiOutputMode;

  // 更新AI输入速度显示
  updateAiInputSpeedDisplay(settings.aiInputSpeed);

  // 鼠标设置
  document.getElementById('mouse-middle-button-enabled').checked = settings.mouseMiddleButtonEnabled;
  document.getElementById('mouse-middle-button-modifier').value = settings.mouseMiddleButtonModifier || 'None';

  // 动画设置
  document.getElementById('clipboard-animation-enabled').checked = settings.clipboardAnimationEnabled;
  // 显示后自动滚动到顶部
  const autoScrollSwitch = document.getElementById('auto-scroll-to-top-on-show');
  if (autoScrollSwitch) {
    autoScrollSwitch.checked = !!settings.autoScrollToTopOnShow;
  }

  // 窗口位置和大小设置
  document.getElementById('window-position-mode').value = settings.windowPositionMode || 'smart';
  document.getElementById('remember-window-size').checked = settings.rememberWindowSize;
  
  // 标题栏位置设置
  document.getElementById('title-bar-position').value = settings.titleBarPosition || 'top';
  
  // 贴边隐藏设置
  document.getElementById('edge-hide-enabled').checked = settings.edgeHideEnabled !== undefined ? settings.edgeHideEnabled : true;
  
  // 自动聚焦搜索框设置
  document.getElementById('auto-focus-search').checked = settings.autoFocusSearch !== undefined ? settings.autoFocusSearch : false;
  
  // 侧边栏悬停延迟设置
  const sidebarHoverDelay = settings.sidebarHoverDelay !== undefined ? settings.sidebarHoverDelay : 0.5;
  document.getElementById('sidebar-hover-delay').value = sidebarHoverDelay;

  // 应用黑白名单设置
  document.getElementById('app-filter-enabled').checked = settings.appFilterEnabled || false;

  // 设置过滤模式
  const modeRadio = document.querySelector(`input[name="filter-mode"][value="${settings.appFilterMode || 'blacklist'}"]`);
  if (modeRadio) modeRadio.checked = true;

  const appFilterListTextarea = document.getElementById('app-filter-list');
  if (appFilterListTextarea) {
    appFilterListTextarea.value = (settings.appFilterList || []).join('\n');
  }

  const imageDataPriorityApps = document.getElementById('image-data-priority-apps');
  if (imageDataPriorityApps) {
    imageDataPriorityApps.value = (settings.imageDataPriorityApps || []).join('\n');
  }

  updateAppFilterStatus();
  renderAddedAppsGrid();
  renderAvailableAppsGrid();

  // 首次进入时自动获取应用列表
  setTimeout(async () => {
    try {
      if (!window.allWindowsInfo || window.allWindowsInfo.length === 0) {
        const windows = await invoke('get_all_windows_info_cmd');
        window.allWindowsInfo = windows;
        renderAddedAppsGrid();
        renderAvailableAppsGrid();
      }
    } catch (error) {
      console.warn('首次获取应用列表失败，用户可手动刷新:', error);
      // 显示友好的提示信息
      const availableGrid = document.getElementById('available-apps-grid');
      if (availableGrid) {
        availableGrid.innerHTML = '<div class="empty-grid">点击"刷新"按钮获取应用列表</div>';
      }
    }
  }, 500);

  // 设置主题
  setActiveTheme(settings.theme);

  // 设置透明度
  const opacitySlider = document.getElementById('opacity-slider');
  opacitySlider.value = settings.opacity;
  updateOpacityDisplay(settings.opacity);

  // 设置音量显示
  updateVolumeDisplay(settings.soundVolume);

  // 加载应用版本信息
  loadAppVersion();

  // 初始化数据管理功能
  initDataManagement();

  // 初次根据主题显示背景图设置
  const bgSetting = document.getElementById('background-image-setting');
  if (bgSetting) {
    bgSetting.style.display = (settings.theme === 'background') ? '' : 'none';
  }

  // 初次应用背景
  applyBackgroundToSettingsContainer();

  // 初始化更新检测
  try {
    const { setupUpdateChecker } = await import('./updateChecker.js');
    setupUpdateChecker();

    // 监听模块发出的可更新事件，弹出一次性通知
    let notified = false;
    window.addEventListener('qc-update-available', (e) => {
      if (notified) return;
      notified = true;
      const rel = e?.detail?.latestRelease;
      const ver = (rel?.tagName || rel?.name || '').toString();
      showNotification(`发现新版本 ${ver}，点击“关于 → 检查更新”查看详情`, 'success');
    }, { once: true });
  } catch (e) {
    console.warn('初始化更新检测失败:', e);
  }
}

// 绑定事件
function bindEvents() {
  // 关闭按钮
  document.getElementById('close-settings').addEventListener('click', () => {
    currentWindow.close();
  });

  // 导航切换
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      switchSection(section);
    });
  });

  // 设置项变更
  bindSettingEvents();

  // 主题选择
  document.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', () => {
      const theme = option.dataset.theme;
      setActiveTheme(theme);
      settings.theme = theme;
      // 切换背景图设置项显隐
      const bgSetting = document.getElementById('background-image-setting');
      if (bgSetting) {
        bgSetting.style.display = theme === 'background' ? '' : 'none';
      }
      applyBackgroundToSettingsContainer();
      saveSettings();
    });
  });

  // 透明度滑块
  const opacitySlider = document.getElementById('opacity-slider');
  opacitySlider.addEventListener('input', (e) => {
    const opacity = parseFloat(e.target.value);
    settings.opacity = opacity;
    updateOpacityDisplay(opacity);
    saveSettings();
  });

  // 快捷键设置
  bindToggleShortcutEvents();

  // 剪贴板窗口快捷键设置
  bindClipboardShortcutEvents();

  // 音效设置事件
  bindSoundEvents();

  // AI配置设置事件
  bindAiConfigEvents();

  // AI翻译设置事件
  bindAiTranslationEvents();

  // 背景图浏览按钮
  const browseBgBtn = document.getElementById('browse-background-image');
  if (browseBgBtn) {
    browseBgBtn.addEventListener('click', async () => {
      try {
        const result = await invoke('browse_image_file');
        if (result) {
          settings.backgroundImagePath = result;
          const bgPathInput = document.getElementById('background-image-path');
          if (bgPathInput) bgPathInput.value = result;
          applyBackgroundToSettingsContainer();
          saveSettings();
        }
      } catch (error) {
        console.error('浏览背景图片失败:', error);
        showNotification('浏览图片失败', 'error');
      }
    });
  }

  // 关于页面按钮
  const checkUpdatesBtn = document.getElementById('check-updates');
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', checkForUpdates);
  }

  const openGithubBtns = document.querySelectorAll('.open-github');
  openGithubBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', openGitHub);
    }
  });

  // 绑定管理员运行设置的特殊处理
  bindAdminRunEvents();

  // 绑定应用黑白名单事件
  bindAppFilterEvents();
}

// 绑定设置项事件
function bindSettingEvents() {
  const settingInputs = [
    'auto-start', 'start-hidden', 'show-startup-notification', 'history-limit',
    'number-shortcuts', 'number-shortcuts-modifier', 'clipboard-monitor',
    'ignore-duplicates', 'save-images', 'show-image-preview',
    'sound-enabled', 'copy-sound-path', 'paste-sound-path',
    'preview-enabled', 'preview-shortcut', 'preview-items-count', 'preview-auto-paste',
    'preview-scroll-sound', 'preview-scroll-sound-path',
    'screenshot-enabled', 'screenshot-shortcut', 'screenshot-quality',
    'screenshot-auto-save', 'screenshot-show-hints',
    'ai-target-language', 'ai-translate-on-copy', 'ai-translate-on-paste',
    'ai-translation-prompt', 'ai-input-speed', 'ai-newline-mode', 'ai-output-mode',
    'mouse-middle-button-enabled', 'mouse-middle-button-modifier', 'clipboard-animation-enabled',
    'window-position-mode', 'remember-window-size', 'auto-scroll-to-top-on-show',
    'title-bar-position', 'edge-hide-enabled', 'auto-focus-search', 'sidebar-hover-delay',
    'image-data-priority-apps'
  ];

  settingInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', () => {
        // 特殊处理截屏设置的键名映射
        let key;
        if (id.startsWith('screenshot-')) {
          // 截屏设置保持下划线命名
          key = id.replace(/-/g, '_');
        } else {
          // 其他设置使用驼峰命名
          key = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        }

        if (element.type === 'checkbox') {
          settings[key] = element.checked;
        } else if (element.type === 'number' || id === 'screenshot-quality') {
          settings[key] = parseInt(element.value);
        } else if (element.type === 'select-one' && (id === 'preview-items-count' || id === 'ai-input-speed' || id === 'history-limit')) {
          settings[key] = parseInt(element.value);
          console.log(`特殊处理整数设置: ${id} -> ${key} = ${settings[key]} (原始值: ${element.value})`);
        } else if (id === 'image-data-priority-apps') {
          const lines = element.value
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => line.toLowerCase());
          settings.imageDataPriorityApps = lines;
        } else {
          settings[key] = element.value;
        }
        console.log(`设置更新: ${key} = ${settings[key]} (类型: ${element.type}, ID: ${id})`);
        saveSettings();
      });
    }
  });

  // 预览快捷键特殊处理
  bindPreviewShortcutEvents();



  // 截屏快捷键特殊处理
  bindScreenshotShortcutEvents();
  
  // 贴边隐藏特殊处理
  bindEdgeHideEvents();
}

// 绑定显示/隐藏窗口快捷键事件
function bindToggleShortcutEvents() {
  const shortcutInput = document.getElementById('toggle-shortcut');
  const clearButton = document.querySelector('.sound-reset-btn');

  if (shortcutInput) {
    let isRecording = false;

    shortcutInput.addEventListener('focus', async () => {
      if (!isRecording) {
        // 先禁用后端监听，再开始录制
        try {
          await invoke('set_shortcut_recording', { recording: true });
          startRecording();
        } catch (err) {
          console.error('设置快捷键录制状态失败:', err);
          startRecording(); // 即使失败也继续录制
        }
      }
    });

    shortcutInput.addEventListener('keydown', (e) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      const key = e.key;
      const modifiers = [];

      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.altKey) modifiers.push('Alt');
      if (e.metaKey) modifiers.push('Win');  // 在Windows上Meta键就是Win键

      // 忽略单独的修饰键
      if (['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(key)) {
        return;
      }

      // 构建快捷键字符串
      const shortcut = [...modifiers, key.toUpperCase()].join('+');
      shortcutInput.value = shortcut;
      settings.toggleShortcut = shortcut;

      stopRecording();
      saveSettings();

      // 更新主窗口的快捷键显示
      updateShortcutDisplay();
    });

    shortcutInput.addEventListener('blur', () => {
      if (isRecording) {
        stopRecording();
      }
    });

    function startRecording() {
      isRecording = true;
      shortcutInput.classList.add('recording');
      shortcutInput.placeholder = '请按下快捷键组合...';
      shortcutInput.value = '';
      // 通知全局禁用系统
      if (window.setShortcutRecording) {
        window.setShortcutRecording(true);
      }
    }

    function stopRecording() {
      isRecording = false;
      shortcutInput.classList.remove('recording');
      shortcutInput.placeholder = '点击设置快捷键';
      // 通知全局禁用系统
      if (window.setShortcutRecording) {
        window.setShortcutRecording(false);
      }
      // 通知后端恢复快捷键监听
      invoke('set_shortcut_recording', { recording: false }).catch(err => {
        console.error('设置快捷键录制状态失败:', err);
      });
    }
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      // 恢复到默认快捷键而不是清空
      const defaultShortcut = defaultSettings.toggleShortcut;
      shortcutInput.value = defaultShortcut;
      settings.toggleShortcut = defaultShortcut;
      saveSettings();
      console.log('快捷键已恢复为默认值:', defaultShortcut);

      // 更新主窗口的快捷键显示
      updateShortcutDisplay();
    });
  }

  // 预设快捷键按钮事件
  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(button => {
    button.addEventListener('click', () => {
      const shortcut = button.getAttribute('data-shortcut');
      shortcutInput.value = shortcut;
      settings.toggleShortcut = shortcut;
      saveSettings();
      console.log('已设置预设快捷键:', shortcut);

      // 更新主窗口的快捷键显示
      updateShortcutDisplay();

      // 添加视觉反馈
      button.style.background = '#28a745';
      button.style.color = 'white';
      setTimeout(() => {
        button.style.background = '';
        button.style.color = '';
      }, 500);
    });
  });
}

// 绑定剪贴板窗口快捷键事件
function bindClipboardShortcutEvents() {
  const shortcutConfigs = [
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

  shortcutConfigs.forEach(config => {
    const shortcutInput = document.getElementById(config.id);
    const clearButton = shortcutInput?.parentElement?.querySelector('.sound-reset-btn');

    if (shortcutInput) {
      let isRecording = false;

      shortcutInput.addEventListener('focus', () => {
        if (!isRecording) {
          startRecording();
        }
      });

      shortcutInput.addEventListener('keydown', (e) => {
        if (!isRecording) return;

        e.preventDefault();
        e.stopPropagation();

        const key = e.key;
        const modifiers = [];

        if (e.ctrlKey) modifiers.push('Ctrl');
        if (e.shiftKey) modifiers.push('Shift');
        if (e.altKey) modifiers.push('Alt');
        if (e.metaKey) modifiers.push('Win');

        // 忽略单独的修饰键
        if (['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(key)) {
          return;
        }

        // 构建快捷键字符串
        let keyName = key;
        // 特殊键名处理
        if (key === 'ArrowUp') keyName = 'ArrowUp';
        else if (key === 'ArrowDown') keyName = 'ArrowDown';
        else if (key === 'ArrowLeft') keyName = 'ArrowLeft';
        else if (key === 'ArrowRight') keyName = 'ArrowRight';
        else if (key === 'Escape') keyName = 'Escape';
        else if (key === 'Tab') keyName = 'Tab';
        else if (key === 'Enter') keyName = 'Enter';
        else keyName = key.toUpperCase();

        const shortcut = [...modifiers, keyName].join('+');
        shortcutInput.value = shortcut;
        settings[config.key] = shortcut;

        stopRecording();
        saveSettings();
      });

      shortcutInput.addEventListener('blur', () => {
        if (isRecording) {
          stopRecording();
        }
      });

      function startRecording() {
        isRecording = true;
        shortcutInput.classList.add('recording');
        shortcutInput.placeholder = '请按下快捷键组合...';
        shortcutInput.value = '';
      }

      function stopRecording() {
        isRecording = false;
        shortcutInput.classList.remove('recording');
        shortcutInput.placeholder = '点击设置快捷键';
      }

      // 清除/恢复默认按钮
      if (clearButton) {
        clearButton.addEventListener('click', () => {
          const defaultShortcut = config.default;
          shortcutInput.value = defaultShortcut;
          settings[config.key] = defaultShortcut;
          saveSettings();
          console.log(`${config.key} 已恢复为默认值:`, defaultShortcut);
        });
      }
    }
  });
}

// 绑定预览快捷键事件
function bindPreviewShortcutEvents() {
  const shortcutInput = document.getElementById('preview-shortcut');
  const clearButton = document.getElementById('clear-preview-shortcut');

  if (shortcutInput) {
    let isRecording = false;

    shortcutInput.addEventListener('focus', async () => {
      if (!isRecording) {
        // 先禁用后端监听，再开始录制
        try {
          await invoke('set_shortcut_recording', { recording: true });
          startRecording();
        } catch (err) {
          console.error('设置快捷键录制状态失败:', err);
          startRecording(); // 即使失败也继续录制
        }
      }
    });

    shortcutInput.addEventListener('keydown', (e) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      const key = e.key;
      const modifiers = [];

      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.altKey) modifiers.push('Alt');
      if (e.metaKey) modifiers.push('Meta');

      // 忽略单独的修饰键
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
        return;
      }

      // 构建快捷键字符串
      const shortcut = [...modifiers, key.toUpperCase()].join('+');
      shortcutInput.value = shortcut;
      settings.previewShortcut = shortcut;

      stopRecording();
      saveSettings();
    });

    shortcutInput.addEventListener('blur', () => {
      if (isRecording) {
        stopRecording();
      }
    });

    function startRecording() {
      isRecording = true;
      shortcutInput.classList.add('recording');
      shortcutInput.placeholder = '请按下快捷键组合...';
      shortcutInput.value = '';
      // 通知全局禁用系统
      if (window.setShortcutRecording) {
        window.setShortcutRecording(true);
      }
      // 后端状态已在focus事件中设置，这里不再重复调用
    }

    function stopRecording() {
      isRecording = false;
      shortcutInput.classList.remove('recording');
      shortcutInput.placeholder = '点击设置快捷键';
      // 通知全局禁用系统
      if (window.setShortcutRecording) {
        window.setShortcutRecording(false);
      }
      // 通知后端恢复快捷键监听
      invoke('set_shortcut_recording', { recording: false }).catch(err => {
        console.error('设置快捷键录制状态失败:', err);
      });
    }
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      // 恢复到默认快捷键而不是清空
      const defaultShortcut = defaultSettings.previewShortcut;
      shortcutInput.value = defaultShortcut;
      settings.previewShortcut = defaultShortcut;
      saveSettings();
      console.log('预览快捷键已恢复为默认值:', defaultShortcut);
    });
  }

  // 初次根据主题显示背景图设置
  const bgSetting = document.getElementById('background-image-setting');
  if (bgSetting) {
    bgSetting.style.display = (settings.theme === 'background') ? '' : 'none';
  }

  // 初次应用背景
  applyBackgroundToSettingsContainer();
}

// 将背景图应用到当前文档
async function applyBackgroundToSettingsContainer() {
  try {
    const container = document.querySelector('.settings-container');
    const path = settings.backgroundImagePath || '';
    if (container) {
      if (path && settings.theme === 'background') {
        let url = '';
        try {
          // 优先读原图为 dataURL，避免 asset.localhost 访问失败
          const dataUrl = await invoke('read_image_file', { filePath: path });
          url = dataUrl;
        } catch (e) {
          // 退回到 convertFileSrc
          url = convertFileSrc ? convertFileSrc(path) : path;
        }
        container.style.backgroundImage = `url("${url.replaceAll('"', '\\"')}")`;

        try {
          const dominantColor = await getDominantColor(url);
          const titleBarColors = generateTitleBarColors(dominantColor);
          applyTitleBarColors(titleBarColors);
        } catch (colorError) {
          console.warn('设置页面分析背景图颜色失败:', colorError);
          removeTitleBarColors();
        }
      } else {
        container.style.backgroundImage = '';
        removeTitleBarColors();
      }
    }
  } catch (e) {
    console.warn('应用背景图片失败:', e);
  }
}



// 绑定截屏快捷键事件
function bindScreenshotShortcutEvents() {
  const shortcutInput = document.getElementById('screenshot-shortcut');
  const clearButton = document.getElementById('clear-screenshot-shortcut');

  if (shortcutInput) {
    let isRecording = false;

    shortcutInput.addEventListener('focus', async () => {
      if (!isRecording) {
        // 先禁用后端监听，再开始录制
        try {
          await invoke('set_shortcut_recording', { recording: true });
          startRecording();
        } catch (err) {
          console.error('设置快捷键录制状态失败:', err);
          startRecording(); // 即使失败也继续录制
        }
      }
    });

    shortcutInput.addEventListener('keydown', (e) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      const key = e.key;
      const modifiers = [];

      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.altKey) modifiers.push('Alt');
      if (e.metaKey) modifiers.push('Meta');

      // 忽略单独的修饰键
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
        return;
      }

      // 构建快捷键字符串
      const shortcut = [...modifiers, key.toUpperCase()].join('+');
      shortcutInput.value = shortcut;
      settings.screenshot_shortcut = shortcut;

      stopRecording();
      saveSettings();
    });

    shortcutInput.addEventListener('blur', () => {
      if (isRecording) {
        stopRecording();
      }
    });

    function startRecording() {
      isRecording = true;
      shortcutInput.classList.add('recording');
      shortcutInput.placeholder = '请按下快捷键组合...';
      shortcutInput.value = '';
      // 通知全局禁用系统
      if (window.setShortcutRecording) {
        window.setShortcutRecording(true);
      }
      // 后端状态已在focus事件中设置，这里不再重复调用
    }

    function stopRecording() {
      isRecording = false;
      shortcutInput.classList.remove('recording');
      shortcutInput.placeholder = '点击设置快捷键';
      // 通知全局禁用系统
      if (window.setShortcutRecording) {
        window.setShortcutRecording(false);
      }
      // 通知后端恢复快捷键监听
      invoke('set_shortcut_recording', { recording: false }).catch(err => {
        console.error('设置快捷键录制状态失败:', err);
      });
    }
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      // 恢复到默认快捷键而不是清空
      const defaultShortcut = defaultSettings.screenshotShortcut;
      shortcutInput.value = defaultShortcut;
      settings.screenshot_shortcut = defaultShortcut;
      saveSettings();
      console.log('截屏快捷键已恢复为默认值:', defaultShortcut);
    });
  }
}

// 绑定贴边隐藏设置事件
function bindEdgeHideEvents() {
  const edgeHideCheckbox = document.getElementById('edge-hide-enabled');
  if (edgeHideCheckbox) {
    edgeHideCheckbox.addEventListener('change', async (e) => {
      try {
        // 调用后端设置贴边隐藏开关
        await invoke('set_edge_hide_enabled', { enabled: e.target.checked });
        console.log('贴边隐藏设置已更新:', e.target.checked);
        
        if (e.target.checked) {
          showNotification('贴边隐藏功能已启用', 'success');
        } else {
          showNotification('贴边隐藏功能已禁用', 'info');
        }
      } catch (error) {
        console.error('更新贴边隐藏设置失败:', error);
        showNotification('设置失败: ' + error, 'error');
        // 恢复复选框状态
        e.target.checked = !e.target.checked;
      }
    });
  }
}

// 绑定音效设置事件
function bindSoundEvents() {
  // 音量滑块
  const volumeSlider = document.getElementById('sound-volume');
  volumeSlider.addEventListener('input', (e) => {
    const volume = parseInt(e.target.value);
    settings.soundVolume = volume;
    updateVolumeDisplay(volume);
    saveSettings();
  });

  // 恢复默认音效按钮
  document.getElementById('reset-copy-sound').addEventListener('click', () => {
    settings.copySoundPath = '';
    document.getElementById('copy-sound-path').value = '';
    saveSettings();
    showNotification('已恢复默认复制音效', 'success');
  });

  document.getElementById('reset-paste-sound').addEventListener('click', () => {
    settings.pasteSoundPath = '';
    document.getElementById('paste-sound-path').value = '';
    saveSettings();
    showNotification('已恢复默认粘贴音效', 'success');
  });

  document.getElementById('reset-preview-scroll-sound').addEventListener('click', () => {
    settings.previewScrollSoundPath = 'sounds/roll.mp3';
    document.getElementById('preview-scroll-sound-path').value = settings.previewScrollSoundPath;
    saveSettings();
    showNotification('已恢复默认滚动音效', 'success');
  });

  // 浏览音效文件按钮
  document.getElementById('browse-copy-sound').addEventListener('click', () => {
    browseSoundFile('copy');
  });

  document.getElementById('browse-paste-sound').addEventListener('click', () => {
    browseSoundFile('paste');
  });

  // 测试音效按钮
  document.getElementById('test-copy-sound').addEventListener('click', () => {
    testSound('copy');
  });

  document.getElementById('test-paste-sound').addEventListener('click', () => {
    testSound('paste');
  });

  // 预览滚动音效按钮
  document.getElementById('browse-preview-scroll-sound').addEventListener('click', () => {
    browseSoundFile('preview-scroll');
  });

  document.getElementById('test-preview-scroll-sound').addEventListener('click', () => {
    testSound('preview-scroll');
  });

  // 清理缓存按钮
  document.getElementById('clear-sound-cache').addEventListener('click', () => {
    clearSoundCache();
  });
}

// 设置窗口事件
function setupWindowEvents() {
  // 关闭按钮事件
  const closeButton = document.getElementById('close-settings');
  if (closeButton) {
    closeButton.addEventListener('click', async () => {
      await closeSettingsWindow();
    });
  }

  // 最小化按钮事件
  const minimizeButton = document.getElementById('minimize-btn');
  if (minimizeButton) {
    minimizeButton.addEventListener('click', async () => {
      try {
        await currentWindow.minimize();
      } catch (error) {
        console.error('最小化窗口失败:', error);
      }
    });
  }

  // 最大化/还原按钮事件
  const maximizeButton = document.getElementById('maximize-btn');
  if (maximizeButton) {
    maximizeButton.addEventListener('click', async () => {
      try {
        const isMaximized = await currentWindow.isMaximized();
        await currentWindow.toggleMaximize();
        maximizeButton.innerHTML = isMaximized ? '<i class="ti ti-square"></i>' : '<i class="ti ti-square-minus"></i>';
        maximizeButton.title = isMaximized ? '最大化' : '还原';
      } catch (error) {
        console.error('切换窗口最大化状态失败:', error);
      }
    });
  }

  // 监听窗口关闭事件
  currentWindow.onCloseRequested(async () => {
    await closeSettingsWindow();
  });

  // ESC键关闭窗口
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      await closeSettingsWindow();
    }
  });

  // 监听窗口最大化状态变化，更新按钮图标
  currentWindow.onResized(async () => {
    try {
      const isMaximized = await currentWindow.isMaximized();
      const maximizeButton = document.getElementById('maximize-btn');
      if (maximizeButton) {
        if (isMaximized) {
          maximizeButton.innerHTML = '<i class="ti ti-square-minus"></i>';
          maximizeButton.title = '还原';
        } else {
          maximizeButton.innerHTML = '<i class="ti ti-square"></i>';
          maximizeButton.title = '最大化';
        }
      }
    } catch (error) {
      console.error('更新最大化按钮状态失败:', error);
    }
  });
}

// 关闭设置窗口
async function closeSettingsWindow() {
  try {
    // 通知主窗口隐藏（如果它是因为设置窗口打开而显示的）
    await invoke('hide_main_window_if_auto_shown');

    // 关闭设置窗口
    await currentWindow.close();
  } catch (error) {
    console.error('关闭设置窗口失败:', error);
    // 即使出错也要尝试关闭窗口
    try {
      await currentWindow.close();
    } catch (closeError) {
      console.error('强制关闭设置窗口失败:', closeError);
    }
  }
}

// 切换设置面板
function switchSection(sectionName) {
  // 更新导航状态
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

  // 更新面板显示
  document.querySelectorAll('.settings-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(`${sectionName}-section`).classList.add('active');
}

// 设置活动主题
function setActiveTheme(theme) {
  document.querySelectorAll('.theme-option').forEach(option => {
    option.classList.remove('active');
  });

  const themeOption = document.querySelector(`[data-theme="${theme}"]`);
  if (themeOption) {
    themeOption.classList.add('active');
  }

  // 使用主题管理器应用主题
  setTheme(theme);
}

// 更新透明度显示
function updateOpacityDisplay(opacity) {
  const percentage = Math.round(opacity * 100);
  document.querySelector('.slider-value').textContent = `${percentage}%`;
}

// 更新音量显示
function updateVolumeDisplay(volume) {
  const volumeDisplay = document.querySelector('#sound-volume').nextElementSibling;
  volumeDisplay.textContent = `${volume}%`;
}

// 更新AI输入速度显示
function updateAiInputSpeedDisplay(speed) {
  const speedDisplay = document.querySelector('#ai-input-speed').nextElementSibling;
  if (speedDisplay) {
    speedDisplay.textContent = `${speed} 字符/秒`;
  }
}



// 浏览音效文件
async function browseSoundFile(type) {
  try {
    const result = await invoke('browse_sound_file');
    if (result) {
      if (type === 'copy') {
        settings.copySoundPath = result;
        document.getElementById('copy-sound-path').value = result;
      } else if (type === 'paste') {
        settings.pasteSoundPath = result;
        document.getElementById('paste-sound-path').value = result;
      } else if (type === 'preview-scroll') {
        settings.previewScrollSoundPath = result;
        document.getElementById('preview-scroll-sound-path').value = result;
      }
      saveSettings();
    }
  } catch (error) {
    console.error('浏览音效文件失败:', error);
    showNotification('浏览文件失败', 'error');
  }
}

// 测试音效（异步版本，不阻塞UI）
async function testSound(type) {
  const button = document.getElementById(`test-${type}-sound`);
  let soundPath;
  if (type === 'copy') {
    soundPath = settings.copySoundPath;
  } else if (type === 'paste') {
    soundPath = settings.pasteSoundPath;
  } else if (type === 'preview-scroll') {
    soundPath = settings.previewScrollSoundPath;
  }

  // 检查是否已经在播放
  if (button.classList.contains('playing')) {
    return; // 防止重复点击
  }

  try {
    // 立即更新UI状态
    button.classList.add('playing');
    button.disabled = true;

    // 异步调用音效测试，不等待完成
    invoke('test_sound', {
      soundPath: soundPath || '', // 空路径将播放默认音效
      volume: settings.soundVolume,
      soundType: type
    }).catch(error => {
      console.error('测试音效失败:', error);
      showNotification('音效测试失败', 'error');
    });

    // 设置UI恢复定时器
    setTimeout(() => {
      button.classList.remove('playing');
      button.disabled = false;
    }, 1500); // 给音效播放足够的时间

  } catch (error) {
    console.error('测试音效失败:', error);
    showNotification('音效测试失败', 'error');
    button.classList.remove('playing');
    button.disabled = false;
  }
}

// 清理音效缓存
async function clearSoundCache() {
  const button = document.getElementById('clear-sound-cache');

  if (button.disabled) {
    return; // 防止重复点击
  }

  try {
    button.disabled = true;
    button.innerHTML = '<i class="ti ti-loader"></i> 清理中...';

    await invoke('clear_sound_cache');

    showNotification('缓存清理成功', 'success');
    button.innerHTML = '<i class="ti ti-trash"></i> 清理缓存';

  } catch (error) {
    console.error('清理缓存失败:', error);
    showNotification('缓存清理失败', 'error');
    button.innerHTML = '<i class="ti ti-trash"></i> 清理缓存';
  } finally {
    button.disabled = false;
  }
}



// 检查更新
async function checkForUpdates() {
  try {
    const { handleCheckUpdatesClick } = await import('./updateChecker.js');
    await handleCheckUpdatesClick();
  } catch (error) {
    console.error('检查更新失败:', error);
    showNotification('检查更新失败', 'error');
  }
}

// 打开GitHub
async function openGitHub() {
  try {
    await openUrl('https://github.com/mosheng1/QuickClipboard');
  } catch (error) {
    console.error('打开GitHub失败:', error);
  }
}

// 加载应用版本信息
async function loadAppVersion() {
  try {
    const versionInfo = await invoke('get_app_version');
    const versionElement = document.getElementById('app-version');

    if (versionElement && versionInfo) {
      versionElement.textContent = `版本 ${versionInfo.version}`;
      console.log('应用版本信息:', versionInfo);
    }
  } catch (error) {
    console.error('获取版本信息失败:', error);
    const versionElement = document.getElementById('app-version');
    if (versionElement) {
      versionElement.textContent = '版本 未知';
    }
  }
}

// 绑定管理员运行设置的特殊处理
function bindAdminRunEvents() {
  const runAsAdminCheckbox = document.getElementById('run-as-admin');
  if (runAsAdminCheckbox) {
    runAsAdminCheckbox.addEventListener('change', async (e) => {
      const isEnabled = e.target.checked;

      if (isEnabled) {
        // 检查当前是否已经以管理员权限运行
        try {
          const adminStatus = await invoke('get_admin_status');

          if (adminStatus.is_admin) {
            // 已经是管理员权限，直接保存设置
            settings.runAsAdmin = true;
            await saveSettings();
            showNotification('设置已保存', 'success');
          } else {
            // 不是管理员权限，询问用户是否重启
            const shouldRestart = await showConfirmDialog(
              '需要重启应用',
              '启用管理员运行需要重启应用程序。\n下次启动时将自动以管理员权限运行。\n\n是否现在重启？',
              '重启',
              '稍后重启'
            );

            // 无论用户选择什么，都保存设置
            settings.runAsAdmin = true;
            await saveSettings();

            if (shouldRestart) {
              // 以管理员权限重启
              try {
                showNotification('正在重启...', 'info');
                await invoke('restart_as_admin');
              } catch (error) {
                console.error('重启为管理员失败:', error);
                showNotification('重启失败: ' + error, 'error');
              }
            } else {
              showNotification('设置已保存，下次启动时将以管理员权限运行', 'success');
            }
          }
        } catch (error) {
          console.error('检查管理员状态失败:', error);
          showNotification('检查管理员状态失败', 'error');
          // 发生错误时不改变设置，让用户重试
        }
      } else {
        // 禁用管理员运行
        settings.runAsAdmin = false;
        await saveSettings();
        showNotification('设置已保存，下次启动时生效', 'success');
      }
    });
  }
}

// 显示确认对话框
async function showConfirmDialog(title, message, confirmText, cancelText) {
  return new Promise((resolve) => {
    // 创建对话框元素
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-dialog-header">
          <h3>${title}</h3>
        </div>
        <div class="confirm-dialog-body">
          <p>${message}</p>
        </div>
        <div class="confirm-dialog-footer">
          <button class="btn btn-secondary" id="cancel-btn">${cancelText}</button>
          <button class="btn btn-primary" id="confirm-btn">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // 绑定事件
    const confirmBtn = dialog.querySelector('#confirm-btn');
    const cancelBtn = dialog.querySelector('#cancel-btn');

    confirmBtn.addEventListener('click', () => {
      document.body.removeChild(dialog);
      resolve(true);
    });

    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(dialog);
      resolve(false);
    });

    // 点击遮罩层关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
        resolve(false);
      }
    });
  });
}

// 绑定AI配置设置事件
function bindAiConfigEvents() {

  // AI配置输入框
  const aiConfigInputs = ['ai-api-key', 'ai-model', 'ai-base-url'];
  aiConfigInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', async () => {
        try {
          const configKey = id.replace('ai-', '').replace(/-([a-z])/g, (g) => g[1].toUpperCase());
          const config = {};
          config[configKey] = element.value;

          // 保存AI配置到后端
          await saveAIConfig(config);

          // 同时更新前端settings对象
          const settingsKey = 'ai' + configKey.charAt(0).toUpperCase() + configKey.slice(1);
          settings[settingsKey] = element.value;

          // 显示保存成功提示
          showNotification('AI配置已保存', 'success');

          console.log(`AI配置已更新: ${configKey} = ${element.value}`);
        } catch (error) {
          console.error('保存AI配置失败:', error);
        }
      });
    }
  });

  // API密钥输入框 - 当用户输入密钥后自动刷新模型列表
  const apiKeyInput = document.getElementById('ai-api-key');
  if (apiKeyInput) {
    let refreshTimeout = null;

    apiKeyInput.addEventListener('input', (e) => {
      const apiKey = e.target.value.trim();

      // 清除之前的定时器
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      // 如果API密钥不为空且长度合理，延迟刷新模型列表
      if (apiKey && apiKey.length > 10) {
        refreshTimeout = setTimeout(async () => {
          console.log('API密钥已更新，自动刷新模型列表...');
          await refreshAiConfigModelsList(true); // silent模式
        }, 1500); // 延迟1.5秒，避免频繁请求
      }
    });
  }

  // 页面加载时自动刷新模型列表（如果有API密钥）
  setTimeout(async () => {
    const aiConfig = getCurrentAIConfig();
    if (aiConfig.apiKey && aiConfig.apiKey.trim() !== '') {
      console.log('自动刷新AI模型列表...');
      await refreshAiConfigModelsList(true); // silent模式，不显示错误提示
    }
  }, 1000); // 延迟1秒确保页面完全加载

  // 刷新AI模型列表按钮
  const refreshModelsButton = document.getElementById('refresh-ai-models');
  if (refreshModelsButton) {
    refreshModelsButton.addEventListener('click', async () => {
      await refreshAiConfigModelsList();
    });
  }

  // 测试AI配置按钮
  const testConfigButton = document.getElementById('test-ai-config');
  if (testConfigButton) {
    testConfigButton.addEventListener('click', async () => {
      try {
        testConfigButton.disabled = true;
        testConfigButton.innerHTML = '<i class="ti ti-loader"></i> 测试中...';

        // 动态导入AI配置模块的函数
        const { testAIConfig } = await import('./aiConfig.js');

        const testResult = await testAIConfig();
        if (testResult) {
          showNotification('AI配置测试成功', 'success');
        } else {
          throw new Error('AI配置测试失败');
        }
      } catch (error) {
        console.error('AI配置测试失败:', error);
        showNotification(`AI配置测试失败: ${error.message}`, 'error');
      } finally {
        testConfigButton.disabled = false;
        testConfigButton.innerHTML = '<i class="ti ti-test-pipe"></i> 测试配置';
      }
    });
  }
}

// 刷新AI配置页面的模型列表
async function refreshAiConfigModelsList(silent = false) {
  const refreshButton = document.getElementById('refresh-ai-models');
  const modelSelect = document.getElementById('ai-model');

  if (!refreshButton || !modelSelect) {
    return;
  }

  try {
    // 显示加载状态
    refreshButton.disabled = true;
    refreshButton.innerHTML = '<i class="ti ti-loader ti-spin"></i>';

    // 获取当前AI配置
    const aiConfig = getCurrentAIConfig();

    // 检查配置是否有效
    if (!aiConfig.apiKey || !aiConfig.baseUrl) {
      throw new Error('请先设置API密钥和API地址');
    }

    // 动态导入AI配置模块的函数
    const { getAvailableAIModels, getModelDisplayName } = await import('./aiConfig.js');

    // 获取可用模型列表
    const models = await getAvailableAIModels();

    if (!models || models.length === 0) {
      throw new Error('未获取到可用模型列表');
    }

    // 保存当前选中的模型
    const currentModel = aiConfig.model;

    // 清空现有选项
    modelSelect.innerHTML = '';

    // 添加新的模型选项
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = getModelDisplayName(model);
      modelSelect.appendChild(option);
    });

    // 如果当前模型不在新列表中，添加它作为选项
    if (currentModel && !models.includes(currentModel)) {
      const option = document.createElement('option');
      option.value = currentModel;
      option.textContent = getModelDisplayName(currentModel) + ' (自定义)';
      modelSelect.insertBefore(option, modelSelect.firstChild);
    }

    // 设置选中的模型
    if (currentModel) {
      modelSelect.value = currentModel;
    } else if (models.length > 0) {
      // 如果没有当前模型，选择推荐模型或第一个模型
      const recommendedModel = 'Qwen/Qwen2-7B-Instruct';
      const selectedModel = models.includes(recommendedModel) ? recommendedModel : models[0];
      modelSelect.value = selectedModel;

      // 更新AI配置
      await saveAIConfig({ model: selectedModel });
    }

    if (!silent) {
      showNotification(`成功加载 ${models.length} 个可用模型`, 'success');
    }
    console.log('已刷新AI模型列表:', models);

  } catch (error) {
    console.error('刷新AI模型列表失败:', error);

    if (!silent) {
      let errorMessage = '刷新模型列表失败';
      if (error.message.includes('请先设置')) {
        errorMessage = error.message;
      } else if (error.toString().includes('API请求失败')) {
        errorMessage = 'API请求失败，请检查网络连接和API密钥';
      }

      showNotification(errorMessage, 'error');
    }
  } finally {
    // 恢复按钮状态
    refreshButton.disabled = false;
    refreshButton.innerHTML = '<i class="ti ti-refresh"></i>';
  }
}

// 绑定AI翻译设置事件
function bindAiTranslationEvents() {
  // AI输入速度滑块
  const aiInputSpeedSlider = document.getElementById('ai-input-speed');
  if (aiInputSpeedSlider) {
    aiInputSpeedSlider.addEventListener('input', (e) => {
      const speed = parseInt(e.target.value);
      settings.aiInputSpeed = speed;
      updateAiInputSpeedDisplay(speed);
      saveSettings();
    });
  }

  // 侧边栏悬停延迟输入框
  const sidebarHoverDelayInput = document.getElementById('sidebar-hover-delay');
  if (sidebarHoverDelayInput) {
    sidebarHoverDelayInput.addEventListener('change', async (e) => {
      let delay = parseFloat(e.target.value);
      
      // 验证范围和有效性
      if (isNaN(delay) || delay < 0) {
        delay = 0;
        e.target.value = delay;
      } else if (delay > 10) {
        delay = 10;
        e.target.value = delay;
      }
      
      settings.sidebarHoverDelay = delay;
      saveSettings();
      
      try {
        const { emit } = await import('@tauri-apps/api/event');
        await emit('sidebar-hover-delay-changed', { delay: delay });
      } catch (error) {
        console.error('发送侧边栏悬停延迟更新事件失败:', error);
      }
    });
  }

  // AI换行符处理模式选择
  const aiNewlineModeSelect = document.getElementById('ai-newline-mode');
  if (aiNewlineModeSelect) {
    aiNewlineModeSelect.addEventListener('change', (e) => {
      settings.aiNewlineMode = e.target.value;
      console.log('AI换行符处理模式已更新:', e.target.value);
      saveSettings();
    });
  }

  // AI输出模式选择
  const aiOutputModeSelect = document.getElementById('ai-output-mode');
  if (aiOutputModeSelect) {
    aiOutputModeSelect.addEventListener('change', (e) => {
      settings.aiOutputMode = e.target.value;
      console.log('AI输出模式已更新:', e.target.value);
      saveSettings();
    });
  }



  // AI翻译测试按钮
  const testButton = document.getElementById('test-ai-translation');
  if (testButton) {
    testButton.addEventListener('click', async () => {
      try {
        testButton.disabled = true;
        testButton.innerHTML = '<i class="ti ti-loader"></i> 测试中...';

        // 重新加载设置以确保使用最新的配置
        await loadSettings();

        // 检查AI翻译配置是否有效
        const isConfigValid = await invoke('check_ai_translation_config');
        if (!isConfigValid) {
          throw new Error('AI翻译配置无效，请检查AI配置和翻译设置');
        }

        const result = await invoke('test_ai_translation');
        showNotification(`AI翻译测试成功: ${result}`, 'success');
        console.log('AI翻译测试结果:', result);

      } catch (error) {
        console.error('AI翻译测试失败:', error);
        showNotification(`AI翻译测试失败: ${error}`, 'error');
      } finally {
        testButton.disabled = false;
        testButton.innerHTML = '<i class="ti ti-test-pipe"></i> 测试翻译';
      }
    });
  }

  // AI翻译开关变化时发送事件到主窗口
  const aiTranslationEnabledCheckbox = document.getElementById('ai-translation-enabled');
  if (aiTranslationEnabledCheckbox) {
    aiTranslationEnabledCheckbox.addEventListener('change', async (e) => {
      try {
        // 如果尝试启用AI翻译，先检查API密钥是否配置
        if (e.target.checked) {
          // 获取当前AI配置
          const aiConfig = getCurrentAIConfig();
          
          // 检查API密钥是否为空
          if (!aiConfig.apiKey || aiConfig.apiKey.trim() === '') {
            // API密钥未配置，不允许启用，并弹出提示
            e.target.checked = false; // 恢复开关状态
            showNotification('请先配置AI API密钥后再启用AI翻译功能', 'warning');
            
            // 滚动到AI配置区域
            const aiConfigSection = document.getElementById('ai-config-section');
            if (aiConfigSection) {
              aiConfigSection.scrollIntoView({ behavior: 'smooth' });
            }
            
            return;
          }
          
          // 检查AI配置是否有效
          const isConfigValid = await invoke('check_ai_translation_config');
          if (!isConfigValid) {
            // AI配置无效，不允许启用，并弹出提示
            e.target.checked = false; // 恢复开关状态
            showNotification('AI配置无效，请检查AI配置后再启用AI翻译功能', 'warning');
            
            // 滚动到AI配置区域
            const aiConfigSection = document.getElementById('ai-config-section');
            if (aiConfigSection) {
              aiConfigSection.scrollIntoView({ behavior: 'smooth' });
            }
            
            return;
          }
        }
        
        // 更新本地设置
        settings.aiTranslationEnabled = e.target.checked;
        saveSettings();
        
        // 发送AI翻译状态变化事件到主窗口
        await emit('ai-translation-state-changed', { enabled: e.target.checked });
        
        // 显示适当的提示
        if (e.target.checked) {
          showNotification('AI翻译功能已启用', 'success');
        } else {
          showNotification('AI翻译功能已禁用', 'info');
        }
      } catch (error) {
        console.error('发送AI翻译状态变化事件失败:', error);
        // 如果发生错误，恢复开关状态
        e.target.checked = !e.target.checked;
        showNotification('启用AI翻译失败，请重试', 'error');
      }
    });
  }

  // 监听AI翻译设置变化，发送更新事件
  const aiSettingInputs = [
    'ai-api-key', 'ai-model', 'ai-base-url', 'ai-target-language',
    'ai-translate-on-copy', 'ai-translate-on-paste', 'ai-translation-prompt'
  ];

  aiSettingInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', async () => {
        try {
          // 收集当前表单的最新AI翻译设置值
          const currentAiSettings = {
            aiTargetLanguage: document.getElementById('ai-target-language')?.value || settings.aiTargetLanguage,
            aiTranslateOnCopy: document.getElementById('ai-translate-on-copy')?.checked || false,
            aiTranslateOnPaste: document.getElementById('ai-translate-on-paste')?.checked || false,
            aiTranslationPrompt: document.getElementById('ai-translation-prompt')?.value || settings.aiTranslationPrompt,
            aiInputSpeed: parseInt(document.getElementById('ai-input-speed')?.value) || settings.aiInputSpeed,
            aiNewlineMode: document.getElementById('ai-newline-mode')?.value || settings.aiNewlineMode,
            aiOutputMode: document.getElementById('ai-output-mode')?.value || settings.aiOutputMode
          };

          console.log('发送最新的AI翻译设置:', currentAiSettings);

          // 发送AI翻译设置更新事件到主窗口，使用最新的设置值
          await emit('ai-translation-settings-updated', currentAiSettings);
        } catch (error) {
          console.error('发送AI翻译设置更新事件失败:', error);
        }
      });
    }
  });

  // 监听来自主窗口的AI翻译状态变化事件
  listen('ai-translation-state-changed', (event) => {
    const { enabled } = event.payload;
    console.log('设置页面收到AI翻译状态变化事件:', enabled);

    // 更新设置页面的AI翻译开关状态
    const aiTranslationEnabledCheckbox = document.getElementById('ai-translation-enabled');
    if (aiTranslationEnabledCheckbox && aiTranslationEnabledCheckbox.checked !== enabled) {
      aiTranslationEnabledCheckbox.checked = enabled;
      // 更新本地设置
      settings.aiTranslationEnabled = enabled;
    }
  });
}

// =================== 数据管理功能 ===================

// 刷新整个前端界面
async function refreshAllWindows() {
  try {
    // 刷新所有窗口
    await invoke('refresh_all_windows');
    console.log('已刷新所有窗口');
  } catch (error) {
    console.error('刷新窗口失败:', error);
  }
}

// 初始化数据管理功能
function initDataManagement() {
  // 导出数据按钮
  const exportButton = document.getElementById('export-all-data');
  if (exportButton) {
    exportButton.addEventListener('click', handleExportData);
  }

  // 导入数据按钮
  const importButton = document.getElementById('import-data');
  if (importButton) {
    importButton.addEventListener('click', handleImportData);
  }

  // 清空剪贴板历史按钮
  const clearHistoryButton = document.getElementById('clear-clipboard-history');
  if (clearHistoryButton) {
    clearHistoryButton.addEventListener('click', handleClearClipboardHistory);
  }

  // 重置所有数据按钮
  const resetAllButton = document.getElementById('reset-all-data');
  if (resetAllButton) {
    resetAllButton.addEventListener('click', handleResetAllData);
  }

  // 存储位置管理按钮
  const openStorageButton = document.getElementById('open-storage-folder');
  if (openStorageButton) {
    openStorageButton.addEventListener('click', handleOpenStorageFolder);
  }

  const changeStorageButton = document.getElementById('change-storage-location');
  if (changeStorageButton) {
    changeStorageButton.addEventListener('click', handleChangeStorageLocation);
  }

  const resetStorageButton = document.getElementById('reset-storage-location');
  if (resetStorageButton) {
    resetStorageButton.addEventListener('click', handleResetStorageLocation);
  }

  // 加载存储信息
  loadStorageInfo();
}

// 处理导出数据
async function handleExportData() {
  try {
    // 使用文件对话框选择保存位置
    const { save } = await import('@tauri-apps/plugin-dialog');
    const filePath = await save({
      title: '导出全部数据',
      defaultPath: `quickclipboard_backup_${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{
        name: 'ZIP文件',
        extensions: ['zip']
      }]
    });

    if (!filePath) {
      return; // 用户取消了操作
    }

    // 显示进度提示
    showNotification('正在导出全部数据，请稍候...', 'info');

    // 调用后端导出函数
    await invoke('export_data', {
      exportPath: filePath,
      options: {} // 空选项，后端会导出所有数据
    });

    showNotification('全部数据导出成功！', 'success');
  } catch (error) {
    console.error('导出数据失败:', error);
    showNotification(`导出数据失败: ${error}`, 'error');
  }
}

// 处理导入数据
async function handleImportData() {
  try {
    // 获取导入模式
    const importModeRadios = document.querySelectorAll('input[name="import-mode"]');
    let importMode = 'replace';
    for (const radio of importModeRadios) {
      if (radio.checked) {
        importMode = radio.value;
        break;
      }
    }

    // 使用文件对话框选择导入文件
    const { open } = await import('@tauri-apps/plugin-dialog');
    const filePath = await open({
      title: '选择要导入的数据文件',
      filters: [{
        name: 'ZIP文件',
        extensions: ['zip']
      }]
    });

    if (!filePath) {
      return; // 用户取消了操作
    }

    // 确认导入操作
    const confirmMessage = importMode === 'replace'
      ? '导入将替换所有现有数据，此操作不可撤销。是否继续？'
      : '导入将与现有数据合并。是否继续？';

    const confirmed = await confirm(confirmMessage, {
      title: '确认导入',
      kind: 'warning'
    });

    if (!confirmed) {
      return;
    }

    // 显示进度提示
    showNotification('正在导入数据，请稍候...', 'info');

    // 调用后端导入函数
    await invoke('import_data', {
      importPath: filePath,
      options: {
        mode: importMode === 'replace' ? 'Replace' : 'Merge'
      }
    });

    showNotification('数据导入成功！', 'success');

    // 刷新所有窗口
    await refreshAllWindows();
  } catch (error) {
    console.error('导入数据失败:', error);
    showNotification(`导入数据失败: ${error}`, 'error');
  }
}

// 处理清空剪贴板历史
async function handleClearClipboardHistory() {
  const confirmed = await confirm('确定要清空所有剪贴板历史吗？此操作不可撤销。', {
    title: '确认清空历史',
    kind: 'warning'
  });

  if (!confirmed) {
    return;
  }

  try {
    showNotification('正在清空剪贴板历史...', 'info');
    await invoke('clear_clipboard_history_dm');
    showNotification('剪贴板历史已清空！', 'success');

    // 刷新所有窗口
    await refreshAllWindows();
  } catch (error) {
    console.error('清空剪贴板历史失败:', error);
    showNotification(`清空剪贴板历史失败: ${error}`, 'error');
  }
}

// 处理重置所有数据
async function handleResetAllData() {
  const firstConfirmed = await confirm('确定要重置所有数据吗？这将删除所有剪贴板历史、常用文本、分组和设置。此操作不可撤销！', {
    title: '确认重置数据',
    kind: 'warning'
  });

  if (!firstConfirmed) {
    return;
  }

  const finalConfirmed = await confirm('最后确认：这将完全重置应用到初始状态，所有数据都将丢失。确定继续吗？', {
    title: '最终确认',
    kind: 'error'
  });

  if (!finalConfirmed) {
    return;
  }

  try {
    showNotification('正在重置所有数据...', 'info');
    await invoke('reset_all_data');
    showNotification('所有数据已重置！', 'success');

    // 刷新所有窗口
    await refreshAllWindows();
  } catch (error) {
    console.error('重置所有数据失败:', error);
    showNotification(`重置所有数据失败: ${error}`, 'error');
  }
}

// 绑定应用黑白名单事件
function bindAppFilterEvents() {
  const appFilterEnabled = document.getElementById('app-filter-enabled');
  const appFilterModeBlacklist = document.querySelector('input[name="filter-mode"][value="blacklist"]');
  const appFilterModeWhitelist = document.querySelector('input[name="filter-mode"][value="whitelist"]');
  const appFilterList = document.getElementById('app-filter-list');
  const clearAppListBtn = document.getElementById('clear-app-list');

  if (appFilterEnabled) {
    appFilterEnabled.addEventListener('change', () => {
      settings.appFilterEnabled = appFilterEnabled.checked;
      saveSettings();
      updateAppFilterStatus();
      renderAddedAppsGrid();
      renderAvailableAppsGrid();
    });
  }

  if (appFilterModeBlacklist && appFilterModeWhitelist) {
    const updateMode = () => {
      const mode = document.querySelector('input[name="filter-mode"]:checked')?.value || 'blacklist';
      settings.appFilterMode = mode;
      saveSettings();
      updateAppFilterStatus();
    };

    appFilterModeBlacklist.addEventListener('change', updateMode);
    appFilterModeWhitelist.addEventListener('change', updateMode);
  }

  if (appFilterList) {
    appFilterList.addEventListener('input', () => {
      const apps = appFilterList.value
        .split('\n')
        .map(app => app.trim())
        .filter(app => app.length > 0);
      settings.appFilterList = apps;
      saveSettings();
      updateAppFilterStatus();
      renderAddedAppsGrid();
      renderAvailableAppsGrid();
    });
  }

  if (clearAppListBtn) {
    clearAppListBtn.addEventListener('click', clearAppFilterList);
  }

  const refreshAppDataBtn = document.getElementById('refresh-windows-list');
  if (refreshAppDataBtn) {
    refreshAppDataBtn.addEventListener('click', refreshAppData);
  }

  // 自定义输入框事件
  const customAppInput = document.getElementById('custom-app-input');
  const addCustomAppBtn = document.getElementById('add-custom-app');
  const addCurrentAppBtn = document.getElementById('add-current-app');

  if (customAppInput && addCustomAppBtn) {
    addCustomAppBtn.addEventListener('click', () => {
      const appName = customAppInput.value.trim();
      if (appName) {
        addAppToFilterList(appName);
        customAppInput.value = '';
      }
    });

    customAppInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const appName = customAppInput.value.trim();
        if (appName) {
          addAppToFilterList(appName);
          customAppInput.value = '';
        }
      }
    });
  }
}



// 更新应用过滤状态显示
function updateAppFilterStatus() {
  const statusElement = document.getElementById('app-filter-status');
  if (!statusElement) return;

  const enabled = settings.appFilterEnabled || false;
  const mode = settings.appFilterMode || 'blacklist';
  const list = settings.appFilterList || [];

  const statusTitle = statusElement.querySelector('.status-title');
  const statusDescription = statusElement.querySelector('.status-description');
  const statusIcon = statusElement.querySelector('.status-icon i');

  if (!enabled) {
    statusTitle.textContent = '功能已禁用';
    statusDescription.textContent = '应用过滤功能已关闭，所有应用均可使用剪贴板管理';
    statusIcon.className = 'ti ti-circle-x';
    statusElement.style.background = 'linear-gradient(135deg, rgba(108, 117, 125, 0.1), rgba(108, 117, 125, 0.05))';
    statusElement.style.borderColor = 'rgba(108, 117, 125, 0.2)';
    statusElement.querySelector('.status-icon').style.color = '#6c757d';
  } else {
    const modeText = mode === 'blacklist' ? '黑名单' : '白名单';
    const countText = list.length > 0 ? `${list.length}个应用` : '暂无应用';
    statusTitle.textContent = `${modeText}模式`;
    statusDescription.textContent = `已添加 ${countText}，${mode === 'blacklist' ? '这些应用将被禁用' : '仅这些应用可用'}`;
    statusIcon.className = mode === 'blacklist' ? 'ti ti-ban' : 'ti ti-check-circle';

    if (mode === 'blacklist') {
      statusElement.style.background = 'linear-gradient(135deg, rgba(220, 53, 69, 0.1), rgba(220, 53, 69, 0.05))';
      statusElement.style.borderColor = 'rgba(220, 53, 69, 0.2)';
      statusElement.querySelector('.status-icon').style.color = '#dc3545';
    } else {
      statusElement.style.background = 'linear-gradient(135deg, rgba(40, 167, 69, 0.1), rgba(40, 167, 69, 0.05))';
      statusElement.style.borderColor = 'rgba(40, 167, 69, 0.2)';
      statusElement.querySelector('.status-icon').style.color = '#28a745';
    }
  }
}

// 渲染已添加的应用网格
function renderAddedAppsGrid() {
  const grid = document.getElementById('added-apps-grid');
  if (!grid) return;

  const apps = settings.appFilterList || [];
  grid.innerHTML = '';

  if (apps.length === 0) {
    grid.innerHTML = '<div class="empty-grid">暂无添加的应用</div>';
    return;
  }

  apps.forEach(app => {
    const appItem = createAppItem(app, true);
    grid.appendChild(appItem);
  });
}

// 渲染可添加的应用网格
function renderAvailableAppsGrid() {
  const grid = document.getElementById('available-apps-grid');
  if (!grid) return;

  const windows = window.allWindowsInfo || [];
  const addedApps = settings.appFilterList || [];
  grid.innerHTML = '';

  if (windows.length === 0) {
    grid.innerHTML = '<div class="empty-grid">暂无可用应用</div>';
    return;
  }

  // 过滤已添加的应用
  const availableApps = windows.filter(window =>
    !addedApps.some(added =>
      added.toLowerCase() === window.process?.toLowerCase()
    )
  );

  if (availableApps.length === 0) {
    grid.innerHTML = '<div class="empty-grid">所有应用已添加</div>';
    return;
  }

  // 去重：按进程名分组
  const uniqueApps = [];
  const seenProcesses = new Set();

  availableApps.forEach(window => {
    if (window.process && !seenProcesses.has(window.process.toLowerCase())) {
      seenProcesses.add(window.process.toLowerCase());
      uniqueApps.push(window);
    }
  });

  uniqueApps.forEach(window => {
    const appItem = createAppItem(window, false);
    grid.appendChild(appItem);
  });
}

// 创建应用项
function createAppItem(appData, isAdded) {
  const appItem = document.createElement('div');
  appItem.className = `app-item ${isAdded ? 'added' : ''}`;
  appItem.dataset.app = isAdded ? appData : appData.process;

  let displayName, iconSrc;

  if (isAdded) {
    displayName = appData;
    // 对于已添加的应用，尝试从allWindowsInfo中查找图标
    let foundApp = null;
    const searchTerm = appData.toLowerCase();

    // 1. 精确匹配进程名
    foundApp = window.allWindowsInfo?.find(w =>
      w.process?.toLowerCase() === searchTerm
    );

    // 2. 模糊匹配进程名（包含关系）
    if (!foundApp) {
      foundApp = window.allWindowsInfo?.find(w =>
        w.process?.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(w.process?.toLowerCase())
      );
    }

    // 3. 匹配窗口标题
    if (!foundApp) {
      foundApp = window.allWindowsInfo?.find(w =>
        w.name?.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(w.name?.toLowerCase())
      );
    }

    // 4. 特殊处理常见应用别名
    if (!foundApp) {
      const aliasMap = {
        'weixin': 'wechat',
        '微信': 'wechat',
        'qq': 'qq',
        '钉钉': 'dingtalk',
        '企业微信': 'wxwork',
        'wps': 'wpsoffice',
        '谷歌浏览器': 'chrome',
        '火狐': 'firefox'
      };

      const alias = aliasMap[searchTerm];
      if (alias) {
        foundApp = window.allWindowsInfo?.find(w =>
          w.process?.toLowerCase().includes(alias) ||
          w.name?.toLowerCase().includes(alias)
        );
      }
    }

    iconSrc = foundApp?.icon || null;
  } else {
    displayName = appData.process || '未知应用';
    iconSrc = appData.icon;
  }

  appItem.innerHTML = `
    <div class="app-icon-container">
      ${iconSrc ?
      `<img src="${iconSrc}" class="app-icon-img" alt="${displayName}" onerror="this.handleIconError(this)">` :
      `<div class="app-icon-placeholder">
          <i class="ti ti-${isAdded ? 'check' : 'plus'}"></i>
        </div>`
    }
    </div>
    <div class="app-name" title="${displayName}">${displayName}</div>
  `;

  appItem.addEventListener('click', () => {
    if (isAdded) {
      removeAppFromFilter(appData);
    } else {
      addAppToFilterList(appData.process, appData.name);
    }
  });

  return appItem;
}

// 处理图标加载错误
function handleIconError(img) {
  img.style.display = 'none';
  const placeholder = img.parentElement.querySelector('.app-icon-placeholder');
  if (placeholder) {
    placeholder.style.display = 'flex';
  }
}

// 从过滤列表移除应用
function removeAppFromFilter(appName) {
  const appList = settings.appFilterList || [];
  const index = appList.indexOf(appName);
  if (index > -1) {
    appList.splice(index, 1);
    settings.appFilterList = appList;

    const appFilterListTextarea = document.getElementById('app-filter-list');
    if (appFilterListTextarea) {
      appFilterListTextarea.value = appList.join('\n');
    }

    saveSettings();
    updateAppFilterStatus();
    renderAddedAppsGrid();
    renderAvailableAppsGrid();
    showNotification(`已移除: ${appName}`, 'success');
  }
}

// 清空应用过滤列表
function clearAppFilterList() {

  settings.appFilterList = [];

  const appFilterListTextarea = document.getElementById('app-filter-list');
  if (appFilterListTextarea) {
    appFilterListTextarea.value = '';
  }

  saveSettings();
  updateAppFilterStatus();
  renderAddedAppsGrid();
  renderAvailableAppsGrid();
  showNotification('应用列表已清空', 'success');
}

// 刷新应用数据
async function refreshAppData() {
  const refreshBtn = document.getElementById('refresh-windows-list');

  if (!refreshBtn) return;

  // 显示加载状态
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<i class="ti ti-loader"></i> 刷新中...';

  try {
    const windows = await invoke('get_all_windows_info_cmd');

    // 保存窗口信息到全局变量
    window.allWindowsInfo = windows;

    // 更新两个网格
    renderAddedAppsGrid();
    renderAvailableAppsGrid();

  } catch (error) {
    console.error('获取应用数据失败:', error);
    showNotification('获取应用数据失败', 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<i class="ti ti-refresh"></i> 刷新应用列表';
  }
}

// 添加应用到过滤列表
function addAppToFilterList(processName, appName) {
  if (!processName) return;

  const appList = settings.appFilterList || [];

  if (!appList.includes(processName)) {
    appList.push(processName);
    settings.appFilterList = appList;

    // 更新UI
    const appFilterListTextarea = document.getElementById('app-filter-list');
    if (appFilterListTextarea) {
      appFilterListTextarea.value = appList.join('\n');
    }

    saveSettings();
    updateAppFilterStatus();
    renderAddedAppsGrid();
    renderAvailableAppsGrid();

    showNotification(`已添加 ${processName} 到应用过滤列表`, 'success');
  }
}

// =================== 存储位置管理功能 ===================

// 加载存储信息
async function loadStorageInfo() {
  try {
    const storageInfo = await invoke('get_storage_info');
    const currentPathElement = document.getElementById('current-storage-path');
    if (currentPathElement) {
      currentPathElement.textContent = storageInfo.current_path;
      currentPathElement.title = storageInfo.current_path; 
    }
  } catch (error) {
    console.error('获取存储信息失败:', error);
    const currentPathElement = document.getElementById('current-storage-path');
    if (currentPathElement) {
      currentPathElement.textContent = '获取存储位置失败';
    }
  }
}

// 处理打开存储文件夹
async function handleOpenStorageFolder() {
  try {
    await invoke('open_storage_folder');
  } catch (error) {
    console.error('打开存储文件夹失败:', error);
    showNotification(`打开存储文件夹失败: ${error}`, 'error');
  }
}

// 处理更改存储位置
async function handleChangeStorageLocation() {
  try {
    // 使用文件夹选择对话框
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selectedPath = await open({
      title: '选择新的数据存储位置',
      directory: true,
      multiple: false
    });

    if (!selectedPath) {
      return; // 用户取消了操作
    }

    // 确认操作
    const confirmed = await confirm(
      '更改存储位置将迁移所有现有数据到新位置，此过程可能需要一些时间。确定继续吗？',
      {
        title: '确认更改存储位置',
        type: 'warning'
      }
    );

    if (!confirmed) {
      return;
    }

    // 显示进度提示
    showNotification('正在迁移数据到新位置，请稍候...', 'info');

    // 调用后端迁移函数
    await invoke('set_custom_storage_location', {
      newPath: selectedPath
    });

    // 重新加载存储信息
    await loadStorageInfo();

    showNotification('存储位置更改成功！', 'success');
  } catch (error) {
    console.error('更改存储位置失败:', error);
    showNotification(`更改存储位置失败: ${error}`, 'error');
  }
}

// 处理重置存储位置
async function handleResetStorageLocation() {
  try {
    // 确认操作
    const confirmed = await confirm(
      '重置存储位置将把数据迁移回默认的AppData目录。确定继续吗？',
      {
        title: '确认重置存储位置',
        type: 'warning'
      }
    );

    if (!confirmed) {
      return;
    }

    // 显示进度提示
    showNotification('正在重置存储位置，请稍候...', 'info');

    // 调用后端重置函数
    await invoke('reset_to_default_storage_location');

    // 重新加载存储信息
    await loadStorageInfo();

    showNotification('存储位置已重置为默认位置！', 'success');
  } catch (error) {
    console.error('重置存储位置失败:', error);
    showNotification(`重置存储位置失败: ${error}`, 'error');
  }
}



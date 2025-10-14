/**
 * 设置页面主文件
 */

import '@tabler/icons-webfont/dist/tabler-icons.min.css';

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getDominantColor, generateTitleBarColors, applyTitleBarColors, removeTitleBarColors } from '../../js/colorAnalyzer.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit, listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { confirm } from '@tauri-apps/plugin-dialog';
import { setTheme } from '../../js/themeManager.js';
import { showNotification } from '../../js/notificationManager.js';
import { initAIConfig, getCurrentAIConfig } from '../../js/aiConfig.js';
import { settingsSearch } from './settingsSearch.js';
import { initDisableBrowserShortcuts } from '../../js/utils/disableBrowserShortcuts.js';

// 导入功能模块
import { ShortcutManager } from './modules/shortcuts.js';
import { SoundManager } from './modules/sound.js';
import { ThemeManager } from './modules/theme.js';
import { AIManager } from './modules/ai.js';
import { DataManager } from './modules/data.js';

// 全局变量
const currentWindow = getCurrentWindow();
let settings = {};
let shortcutManager, soundManager, themeManager, aiManager, dataManager;

// =================== 默认设置 ===================
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
  numberShortcutsModifier: 'Ctrl',
  clipboardMonitor: true,
  ignoreDuplicates: true,
  saveImages: true,
  showImagePreview: false,
  soundEnabled: true,
  soundVolume: 50,
  copySoundPath: '',
  pasteSoundPath: '',
  screenshot_enabled: true,
  screenshot_shortcut: 'Ctrl+Shift+A',
  screenshot_quality: 85,
  screenshot_auto_save: false,
  screenshot_show_hints: true,
  screenshot_element_detection: 'all',
  screenshot_magnifier_enabled: true,
  screenshot_hints_enabled: true,
  screenshot_color_include_format: true,
  previewEnabled: true,
  previewItemsCount: 5,
  previewAutoPaste: true,
  previewScrollSound: true,
  previewScrollSoundPath: 'sounds/roll.mp3',
  previewShortcut: 'Ctrl+`',
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
  autoFocusSearch: false,
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
  mouseMiddleButtonEnabled: true,
  mouseMiddleButtonModifier: 'None',
  windowPositionMode: 'smart',
  rememberWindowSize: false,
  savedWindowPosition: null,
  savedWindowSize: null,
  titleBarPosition: 'top',
  autoScrollToTopOnShow: false,
  edgeHideEnabled: true,
  edgeHideOffset: 3,
  appFilterEnabled: false,
  appFilterMode: 'blacklist',
  appFilterList: [],
  imageDataPriorityApps: [],
  clipboardAnimationEnabled: true,
  pasteWithFormat: true,
  sidebarHoverDelay: 0.5
};

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
  console.log('');
}

// 禁用右键菜单
document.addEventListener('contextmenu', (e) => e.preventDefault());

// =================== 页面初始化 ===================
document.addEventListener('DOMContentLoaded', async () => {
  const perfStart = performance.now();
  printSettingsBanner();
  initDisableBrowserShortcuts();
  
  const themeStart = performance.now();
  const [{ initThemeManager }] = await Promise.all([
    import('../../js/themeManager.js'),
    loadSettings()
  ]);
  
  initThemeManager();
  initAIConfig(settings);
  
  // 初始化 UI
  const uiStart = performance.now();
  await initializeUI();
  
  // 初始化功能模块
  initializeModules();
  
  // 绑定事件
  bindNavigationEvents();
  bindWindowEvents();
  bindBasicSettingEvents();
  bindAppFilterEvents();
  bindAdminRunEvents();
  bindAboutPageEvents();
  
  // 监听设置变更
  setupSettingsSync();
  
  // 初始化搜索
  setTimeout(() => settingsSearch.init(), 50);
});

// =================== 加载和保存设置 ===================
async function loadSettings() {
  try {
    const savedSettings = await invoke('reload_settings');
    settings = { ...defaultSettings, ...savedSettings };
    
    if (!settings.toggleShortcut || settings.toggleShortcut.trim() === '') {
      settings.toggleShortcut = defaultSettings.toggleShortcut;
    }
    
    console.log('设置加载成功:', settings);
  } catch (error) {
    console.error('加载设置失败:', error);
    settings = { ...defaultSettings };
  }
}

async function saveSettings() {
  try {
    emit('settings-changed', settings);
    await invoke('save_settings', { settings });
    showNotification('设置已保存', 'success');
  } catch (error) {
    console.error('保存设置失败:', error);
    showNotification('保存设置失败', 'error');
  }
}

// =================== UI初始化 ===================
async function initializeUI() {
  // 基础设置
  setInputValue('auto-start', settings.autoStart);
  setInputValue('start-hidden', settings.startHidden);
  setInputValue('run-as-admin', settings.runAsAdmin);
  setInputValue('show-startup-notification', settings.showStartupNotification);
  setInputValue('history-limit', settings.historyLimit);
  setInputValue('toggle-shortcut', settings.toggleShortcut || 'Win+V');
  setInputValue('number-shortcuts', settings.numberShortcuts);
  setInputValue('number-shortcuts-modifier', settings.numberShortcutsModifier || 'Ctrl');
  setInputValue('clipboard-monitor', settings.clipboardMonitor);
  setInputValue('ignore-duplicates', settings.ignoreDuplicates);
  setInputValue('save-images', settings.saveImages);
  setInputValue('show-image-preview', settings.showImagePreview);
  setInputValue('background-image-path', settings.backgroundImagePath || '');

  // 音效设置
  setInputValue('sound-enabled', settings.soundEnabled);
  setInputValue('sound-volume', settings.soundVolume);
  setInputValue('copy-sound-path', settings.copySoundPath);
  setInputValue('paste-sound-path', settings.pasteSoundPath);

  // 预览窗口设置
  setInputValue('preview-enabled', settings.previewEnabled);
  setInputValue('preview-shortcut', settings.previewShortcut);
  setInputValue('preview-items-count', settings.previewItemsCount);
  setInputValue('preview-auto-paste', settings.previewAutoPaste);
  setInputValue('preview-scroll-sound', settings.previewScrollSound);
  setInputValue('preview-scroll-sound-path', settings.previewScrollSoundPath);

  // 剪贴板窗口快捷键
  const shortcutIds = [
    'navigate-up-shortcut', 'navigate-down-shortcut', 'tab-left-shortcut', 'tab-right-shortcut',
    'focus-search-shortcut', 'hide-window-shortcut', 'execute-item-shortcut',
    'previous-group-shortcut', 'next-group-shortcut', 'toggle-pin-shortcut'
  ];
  shortcutIds.forEach(id => {
    const key = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    setInputValue(id, settings[key] || defaultSettings[key]);
  });

  // 截屏设置
  setInputValue('screenshot-enabled', settings.screenshot_enabled);
  setInputValue('screenshot-shortcut', settings.screenshot_shortcut);
  setInputValue('screenshot-quality', settings.screenshot_quality);
  setInputValue('screenshot-auto-save', settings.screenshot_auto_save);
  setInputValue('screenshot-show-hints', settings.screenshot_show_hints);
  setInputValue('screenshot-element-detection', settings.screenshot_element_detection || 'all');
  setInputValue('screenshot-magnifier-enabled', settings.screenshot_magnifier_enabled !== undefined ? settings.screenshot_magnifier_enabled : true);
  setInputValue('screenshot-hints-enabled', settings.screenshot_hints_enabled !== undefined ? settings.screenshot_hints_enabled : true);
  setInputValue('screenshot-color-include-format', settings.screenshot_color_include_format !== undefined ? settings.screenshot_color_include_format : true);

  // AI配置
  const aiConfig = getCurrentAIConfig();
  setInputValue('ai-api-key', aiConfig.apiKey);
  setInputValue('ai-model', aiConfig.model);
  setInputValue('ai-base-url', aiConfig.baseUrl);

  // AI翻译设置
  setInputValue('ai-translation-enabled', settings.aiTranslationEnabled);
  setInputValue('ai-target-language', settings.aiTargetLanguage);
  setInputValue('ai-translate-on-copy', settings.aiTranslateOnCopy);
  setInputValue('ai-translate-on-paste', settings.aiTranslateOnPaste);
  setInputValue('ai-translation-prompt', settings.aiTranslationPrompt);
  setInputValue('ai-input-speed', settings.aiInputSpeed);
  setInputValue('ai-newline-mode', settings.aiNewlineMode);
  setInputValue('ai-output-mode', settings.aiOutputMode);

  // 鼠标设置
  setInputValue('mouse-middle-button-enabled', settings.mouseMiddleButtonEnabled);
  setInputValue('mouse-middle-button-modifier', settings.mouseMiddleButtonModifier || 'None');

  // 动画和行为设置
  setInputValue('clipboard-animation-enabled', settings.clipboardAnimationEnabled);
  setInputValue('auto-scroll-to-top-on-show', settings.autoScrollToTopOnShow);

  // 窗口设置
  setInputValue('window-position-mode', settings.windowPositionMode || 'smart');
  setInputValue('remember-window-size', settings.rememberWindowSize);
  setInputValue('title-bar-position', settings.titleBarPosition || 'top');
  setInputValue('edge-hide-enabled', settings.edgeHideEnabled !== undefined ? settings.edgeHideEnabled : true);
  setInputValue('edge-hide-offset', settings.edgeHideOffset !== undefined ? settings.edgeHideOffset : 3);
  setInputValue('auto-focus-search', settings.autoFocusSearch !== undefined ? settings.autoFocusSearch : false);
  setInputValue('sidebar-hover-delay', settings.sidebarHoverDelay !== undefined ? settings.sidebarHoverDelay : 0.5);

  // 应用过滤设置
  setInputValue('app-filter-enabled', settings.appFilterEnabled || false);
  const modeRadio = document.querySelector(`input[name="filter-mode"][value="${settings.appFilterMode || 'blacklist'}"]`);
  if (modeRadio) modeRadio.checked = true;
  setInputValue('app-filter-list', (settings.appFilterList || []).join('\n'));
  setInputValue('image-data-priority-apps', (settings.imageDataPriorityApps || []).join('\n'));

  updateAppFilterStatus();
  renderAddedAppsGrid();
  renderAvailableAppsGrid();

  const lazyLoadApps = () => {
    if (window.allWindowsInfo && window.allWindowsInfo.length > 0) {
      return;
    }
    
    const availableGrid = document.getElementById('available-apps-grid');
    if (!availableGrid) return;

    availableGrid.innerHTML = '<div class="empty-grid">正在加载应用列表...</div>';
    
    invoke('get_all_windows_info_cmd')
      .then(windows => {
        window.allWindowsInfo = windows;
        renderAddedAppsGrid();
        renderAvailableAppsGrid();
      })
      .catch(error => {
        console.warn('获取应用列表失败:', error);
        availableGrid.innerHTML = '<div class="empty-grid">点击"刷新"按钮获取应用列表</div>';
      });
  };

  const appFilterSection = document.getElementById('app-filter-section');
  if (appFilterSection) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          lazyLoadApps();
          observer.disconnect(); 
        }
      });
    }, { threshold: 0.1 });
    observer.observe(appFilterSection);
  }

  // 加载版本信息
  loadAppVersion().catch(err => console.warn('加载版本信息失败:', err));
  const bgSetting = document.getElementById('background-image-setting');
  if (bgSetting) {
    bgSetting.style.display = (settings.theme === 'background') ? '' : 'none';
  }

  // 延迟初始化更新检测
  setTimeout(async () => {
    try {
      const { setupUpdateChecker } = await import('../../js/updateChecker.js');
      setupUpdateChecker();
      
      let notified = false;
      window.addEventListener('qc-update-available', (e) => {
        if (notified) return;
        notified = true;
        const rel = e?.detail?.latestRelease;
        const ver = (rel?.tagName || rel?.name || '').toString();
        showNotification(`发现新版本 ${ver}，点击"关于 → 检查更新"查看详情`, 'success');
      }, { once: true });
    } catch (e) {
      console.warn('初始化更新检测失败:', e);
    }
  }, 500);
}

// =================== 辅助函数 ===================
function setInputValue(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  if (element.type === 'checkbox') {
    element.checked = Boolean(value);
  } else if (element.tagName === 'TEXTAREA') {
    element.value = value || '';
  } else {
    element.value = value !== null && value !== undefined ? value : '';
  }
}

// =================== 初始化模块 ===================
function initializeModules() {
  shortcutManager = new ShortcutManager(settings, saveSettings);
  soundManager = new SoundManager(settings, saveSettings);
  themeManager = new ThemeManager(settings, saveSettings);
  aiManager = new AIManager(settings, saveSettings);
  dataManager = new DataManager();

  shortcutManager.bindEvents();
  soundManager.bindEvents();
  themeManager.bindEvents();
  aiManager.bindEvents();
  dataManager.init();
  
  // 应用初始状态
  themeManager.setActiveTheme(settings.theme, { withAnimation: false });
  themeManager.updateOpacityDisplay(settings.opacity);
  soundManager.updateVolumeDisplay(settings.soundVolume);
  aiManager.updateInputSpeedDisplay(settings.aiInputSpeed);
  themeManager.applyBackgroundToSettingsContainer();
}

// =================== 事件绑定 ===================
function bindNavigationEvents() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      switchSection(section);
    });
  });
}

function bindWindowEvents() {
  const closeBtn = document.getElementById('close-settings');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => currentWindow.close());
  }

  const minimizeBtn = document.getElementById('minimize-btn');
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', async () => {
      try {
        await currentWindow.minimize();
      } catch (error) {
        console.error('最小化窗口失败:', error);
      }
    });
  }

  const maximizeBtn = document.getElementById('maximize-btn');
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', async () => {
      try {
        const isMaximized = await currentWindow.isMaximized();
        await currentWindow.toggleMaximize();
        maximizeBtn.innerHTML = isMaximized ? '<i class="ti ti-square"></i>' : '<i class="ti ti-square-minus"></i>';
        maximizeBtn.title = isMaximized ? '最大化' : '还原';
      } catch (error) {
        console.error('切换窗口最大化状态失败:', error);
      }
    });
  }

  currentWindow.onCloseRequested(async () => {
    await closeSettingsWindow();
  });

  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') {
      await closeSettingsWindow();
    }
  });

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

async function closeSettingsWindow() {
  try {
    await invoke('hide_main_window_if_auto_shown');
    await currentWindow.close();
  } catch (error) {
    console.error('关闭设置窗口失败:', error);
    try {
      await currentWindow.close();
    } catch (closeError) {
      console.error('强制关闭设置窗口失败:', closeError);
    }
  }
}

function bindBasicSettingEvents() {
  const settingInputs = [
    'auto-start', 'start-hidden', 'show-startup-notification', 'history-limit',
    'number-shortcuts', 'number-shortcuts-modifier', 'clipboard-monitor',
    'ignore-duplicates', 'save-images', 'show-image-preview',
    'sound-enabled', 'copy-sound-path', 'paste-sound-path',
    'preview-enabled', 'preview-shortcut', 'preview-items-count', 'preview-auto-paste',
    'preview-scroll-sound', 'preview-scroll-sound-path',
    'screenshot-enabled', 'screenshot-shortcut', 'screenshot-quality',
    'screenshot-auto-save', 'screenshot-show-hints', 'screenshot-element-detection',
    'screenshot-magnifier-enabled', 'screenshot-hints-enabled', 'screenshot-color-include-format',
    'ai-target-language', 'ai-translate-on-copy', 'ai-translate-on-paste',
    'ai-translation-prompt', 'ai-input-speed', 'ai-newline-mode', 'ai-output-mode',
    'mouse-middle-button-enabled', 'mouse-middle-button-modifier', 'clipboard-animation-enabled',
    'window-position-mode', 'remember-window-size', 'auto-scroll-to-top-on-show',
    'title-bar-position', 'edge-hide-enabled', 'edge-hide-offset', 'auto-focus-search', 'sidebar-hover-delay',
    'image-data-priority-apps'
  ];

  settingInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', () => {
        let key;
        if (id.startsWith('screenshot-')) {
          key = id.replace(/-/g, '_');
        } else {
          key = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        }

        if (element.type === 'checkbox') {
          settings[key] = element.checked;
        } else if (element.type === 'number' || id === 'screenshot-quality') {
          settings[key] = parseInt(element.value);
        } else if (element.type === 'select-one' && (id === 'preview-items-count' || id === 'ai-input-speed' || id === 'history-limit')) {
          settings[key] = parseInt(element.value);
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
        saveSettings();
      });
    }
  });

  // 贴边隐藏
  const edgeHideCheckbox = document.getElementById('edge-hide-enabled');
  if (edgeHideCheckbox) {
    edgeHideCheckbox.addEventListener('change', async (e) => {
      try {
        await invoke('set_edge_hide_enabled', { enabled: e.target.checked });
        showNotification(
          e.target.checked ? '贴边隐藏功能已启用' : '贴边隐藏功能已禁用',
          e.target.checked ? 'success' : 'info'
        );
      } catch (error) {
        console.error('更新贴边隐藏设置失败:', error);
        showNotification('设置失败: ' + error, 'error');
        e.target.checked = !e.target.checked;
      }
    });
  }
}

// =================== 应用过滤功能 ===================
function bindAppFilterEvents() {
  const appFilterEnabled = document.getElementById('app-filter-enabled');
  const appFilterModeBlacklist = document.querySelector('input[name="filter-mode"][value="blacklist"]');
  const appFilterModeWhitelist = document.querySelector('input[name="filter-mode"][value="whitelist"]');
  const appFilterList = document.getElementById('app-filter-list');
  const clearAppListBtn = document.getElementById('clear-app-list');
  const refreshAppDataBtn = document.getElementById('refresh-windows-list');
  const customAppInput = document.getElementById('custom-app-input');
  const addCustomAppBtn = document.getElementById('add-custom-app');

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
      const apps = appFilterList.value.split('\n').map(app => app.trim()).filter(app => app.length > 0);
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

  if (refreshAppDataBtn) {
    refreshAppDataBtn.addEventListener('click', refreshAppData);
  }

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

  const availableApps = windows.filter(window =>
    !addedApps.some(added => added.toLowerCase() === window.process?.toLowerCase())
  );

  if (availableApps.length === 0) {
    grid.innerHTML = '<div class="empty-grid">所有应用已添加</div>';
    return;
  }

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

function createAppItem(appData, isAdded) {
  const appItem = document.createElement('div');
  appItem.className = `app-item ${isAdded ? 'added' : ''}`;
  appItem.dataset.app = isAdded ? appData : appData.process;

  let displayName, iconSrc;

  if (isAdded) {
    displayName = appData;
    let foundApp = window.allWindowsInfo?.find(w => w.process?.toLowerCase() === appData.toLowerCase());
    iconSrc = foundApp?.icon || null;
  } else {
    displayName = appData.process || '未知应用';
    iconSrc = appData.icon;
  }

  appItem.innerHTML = `
    <div class="app-icon-container">
      ${iconSrc ?
      `<img src="${iconSrc}" class="app-icon-img" alt="${displayName}" onerror="this.style.display='none'">` :
      `<div class="app-icon-placeholder"><i class="ti ti-${isAdded ? 'check' : 'plus'}"></i></div>`
    }
    </div>
    <div class="app-name" title="${displayName}">${displayName}</div>
  `;

  appItem.addEventListener('click', () => {
    if (isAdded) {
      removeAppFromFilter(appData);
    } else {
      addAppToFilterList(appData.process);
    }
  });

  return appItem;
}

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

async function refreshAppData() {
  const refreshBtn = document.getElementById('refresh-windows-list');
  if (!refreshBtn) return;

  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<i class="ti ti-loader"></i> 刷新中...';

  try {
    const windows = await invoke('get_all_windows_info_cmd');
    window.allWindowsInfo = windows;
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

function addAppToFilterList(processName) {
  if (!processName) return;

  const appList = settings.appFilterList || [];
  if (!appList.includes(processName)) {
    appList.push(processName);
    settings.appFilterList = appList;

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

// =================== 关于页面事件 ===================
async function bindAboutPageEvents() {
  const checkUpdatesBtn = document.getElementById('check-updates');
  if (checkUpdatesBtn) {
    // 检查是否为便携版模式
    try {
      const isPortable = await invoke('is_portable_mode');
      if (isPortable) {
        checkUpdatesBtn.disabled = true;
        checkUpdatesBtn.title = '便携版模式下已禁用自动更新功能';
        checkUpdatesBtn.style.opacity = '0.5';
        checkUpdatesBtn.style.cursor = 'not-allowed';
        checkUpdatesBtn.textContent = '检查更新（已禁用便携版更新）';
      } else {
        checkUpdatesBtn.addEventListener('click', async () => {
          await checkForUpdates();
        });
      }
    } catch (error) {
      console.error('检查便携版模式失败:', error);
      checkUpdatesBtn.addEventListener('click', async () => {
        await checkForUpdates();
      });
    }
  }

  const githubButtons = document.querySelectorAll('.open-github');
  githubButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      await openGitHub();
    });
  });

  const bilibiliButtons = document.querySelectorAll('.open-bilibili');
  bilibiliButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      await openBilibili();
    });
  });
}

// =================== 管理员运行功能 ===================
function bindAdminRunEvents() {
  const runAsAdminCheckbox = document.getElementById('run-as-admin');
  if (runAsAdminCheckbox) {
    runAsAdminCheckbox.addEventListener('change', async (e) => {
      const isEnabled = e.target.checked;

      if (isEnabled) {
        try {
          const adminStatus = await invoke('get_admin_status');

          if (adminStatus.is_admin) {
            settings.runAsAdmin = true;
            await saveSettings();
            showNotification('设置已保存', 'success');
          } else {
            const shouldRestart = await showConfirmDialog(
              '需要重启应用',
              '启用管理员运行需要重启应用程序。\n下次启动时将自动以管理员权限运行。\n\n是否现在重启？',
              '重启',
              '稍后重启'
            );

            settings.runAsAdmin = true;
            await saveSettings();

            if (shouldRestart) {
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
        }
      } else {
        settings.runAsAdmin = false;
        await saveSettings();
        showNotification('设置已保存，下次启动时生效', 'success');
      }
    });
  }
}

async function showConfirmDialog(title, message, confirmText, cancelText) {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-dialog-header"><h3>${title}</h3></div>
        <div class="confirm-dialog-body"><p>${message}</p></div>
        <div class="confirm-dialog-footer">
          <button class="btn btn-secondary" id="cancel-btn">${cancelText}</button>
          <button class="btn btn-primary" id="confirm-btn">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

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

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
        resolve(false);
      }
    });
  });
}

// =================== 其他功能 ===================
function switchSection(sectionName) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-section="${sectionName}"]`)?.classList.add('active');

  document.querySelectorAll('.settings-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(`${sectionName}-section`)?.classList.add('active');
}

async function setupSettingsSync() {
  try {
    await listen('settings-changed', (event) => {
      const newSettings = event?.payload || {};
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
}

async function loadAppVersion() {
  try {
    const versionInfo = await invoke('get_app_version');
    const versionElement = document.getElementById('app-version');
    if (versionElement && versionInfo) {
      versionElement.textContent = `版本 ${versionInfo.version}`;
    }
  } catch (error) {
    console.error('获取版本信息失败:', error);
    const versionElement = document.getElementById('app-version');
    if (versionElement) {
      versionElement.textContent = '版本 未知';
    }
  }
}

async function checkForUpdates() {
  try {
    const { autoUpdater } = await import('../../js/autoUpdater.js');
    await autoUpdater.checkForUpdates(false);
  } catch (error) {
    console.error('检查更新失败:', error);
    showNotification('检查更新失败', 'error');
  }
}

async function openGitHub() {
  try {
    await openUrl('https://github.com/mosheng1/QuickClipboard');
  } catch (error) {
    console.error('打开GitHub失败:', error);
  }
}

async function openBilibili() {
  try {
    await openUrl('https://space.bilibili.com/438982697');
  } catch (error) {
    console.error('打开哔哩哔哩失败:', error);
  }
}

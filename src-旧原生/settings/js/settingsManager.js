// 设置管理器 - 主窗口的设置状态同步和应用
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { refreshClipboardHistory } from '../../js/clipboard.js';
import { setPasteWithFormat } from '../../js/config.js';
import { updateFormatButtonStatus } from '../../js/toolsPanel.js';
import { applyBackgroundImage } from '../../js/backgroundManager.js';

let currentSettings = {};

// 初始化设置管理器
export async function initializeSettingsManager() {
  await loadSettings();
  await applySettings(currentSettings);
  
  await listen('settings-changed', async (event) => {
    const newSettings = event.payload;
    currentSettings = { ...currentSettings, ...newSettings };
    await applySettings(newSettings);
  });
}

// 加载设置
async function loadSettings() {
  try {
    const savedSettings = await invoke('get_settings');
    currentSettings = savedSettings;
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 应用设置
async function applySettings(settings) {
  if (settings.theme) {
    applyTheme(settings.theme);
  }

  if (settings.opacity !== undefined) {
    applyOpacity(settings.opacity);
  }

  // 背景图处理
  if (settings.theme !== undefined || settings.backgroundImagePath !== undefined) {
    const theme = settings.theme || currentSettings.theme;
    if (theme === 'background' && currentSettings.backgroundImagePath) {
      await applyBackgroundImageToMainWindow();
    } else {
      clearBackgroundImageInMainWindow();
    }
  }

  if (settings.historyLimit) {
    refreshClipboardHistory();
  }

  if (settings.showImagePreview !== undefined) {
    refreshVirtualLists();
  }

  if (settings.pasteWithFormat !== undefined) {
    setPasteWithFormat(settings.pasteWithFormat);
    updateFormatButtonStatus();
  }

  if (Array.isArray(settings.imageDataPriorityApps)) {
    window.__imageDataPriorityApps = settings.imageDataPriorityApps;
  }

  if (settings.titleBarPosition !== undefined) {
    applyTitleBarPosition(settings.titleBarPosition);
  }
}

// 刷新虚拟列表
function refreshVirtualLists() {
  if (window.clipboardModule?.clipboardVirtualList) {
    window.clipboardModule.clipboardVirtualList.updateData(
      window.clipboardModule.clipboardVirtualList.data
    );
  }
  if (window.quickTextsModule?.quickTextsVirtualList) {
    window.quickTextsModule.quickTextsVirtualList.updateData(
      window.quickTextsModule.quickTextsVirtualList.data
    );
  }
}

// 应用主题（主窗口直接切换，无动画）
function applyTheme(theme) {
  const body = document.body;
  body.classList.remove('theme-light', 'theme-dark', 'theme-transparent', 'theme-background', 'theme-auto');
  
  let resolvedTheme = theme;
  if (theme === 'auto' || theme === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    resolvedTheme = prefersDark ? 'dark' : 'light';
  }
  
  body.classList.add(`theme-${resolvedTheme}`);
}

// 应用透明度
function applyOpacity(opacity) {
  if (currentSettings.theme === 'transparent') {
    document.documentElement.style.setProperty('--window-opacity', opacity);
  }
}

// 应用背景图到主窗口
async function applyBackgroundImageToMainWindow() {
  await applyBackgroundImage({
    containerSelector: '.container',
    theme: currentSettings.theme,
    backgroundImagePath: currentSettings.backgroundImagePath,
    windowName: '主窗口'
  });
}

// 清除主窗口背景图
function clearBackgroundImageInMainWindow() {
  const container = document.querySelector('.container');
  if (container) {
    container.style.backgroundImage = '';
  }
  
  // 移除CSS变量
  document.documentElement.style.removeProperty('--titlebar-bg-dynamic');
  document.documentElement.style.removeProperty('--titlebar-text-dynamic');
  document.documentElement.style.removeProperty('--titlebar-border-dynamic');
  document.documentElement.style.removeProperty('--primary-color');
  document.documentElement.style.removeProperty('--primary-hover');
  document.documentElement.style.removeProperty('--primary-light');
  document.documentElement.style.removeProperty('--primary-dark');
  document.body.classList.remove('has-dynamic-titlebar');
}

// 应用标题栏位置设置
function applyTitleBarPosition(position) {
  const body = document.body;
  if (!body) return;

  body.classList.remove('titlebar-top', 'titlebar-bottom', 'titlebar-left', 'titlebar-right');
  body.classList.add(`titlebar-${position}`);

  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('update-tab-indicator'));
  }, 50);
}

// 获取当前设置
export function getCurrentSettings() {
  return { ...currentSettings };
}

// 更新单个设置项
export function updateSetting(key, value) {
  currentSettings[key] = value;
  applySettings({ [key]: value });
}

/**
 * 初始化主题
 */
export async function initializeTheme() {
  const theme = currentSettings.theme || 'light';
  applyTheme(theme);
  
  if (theme === 'background' && currentSettings.backgroundImagePath) {
    await applyBackgroundImageToMainWindow();
  }
}

// 监听系统主题变化
export function setupThemeListener() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (currentSettings.theme === 'auto' || currentSettings.theme === 'system') {
      const prefersDark = e.matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
  });
}

// 更新快捷键显示
export function updateShortcutDisplay() {
  const toggleShortcutElement = document.getElementById('toggle-shortcut-display');
  if (toggleShortcutElement && currentSettings.toggleShortcut) {
    toggleShortcutElement.textContent = `${currentSettings.toggleShortcut}: 显示/隐藏`;
  }
}

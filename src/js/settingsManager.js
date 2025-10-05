import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentTheme } from './themeManager.js';
import { refreshClipboardHistory } from './clipboard.js';
import { getDominantColor, generateTitleBarColors, applyTitleBarColors, removeTitleBarColors } from './colorAnalyzer.js';
import { setPasteWithFormat } from './config.js';
import { updateFormatButtonStatus } from './toolsPanel.js';

// 当前设置
let currentSettings = {
  autoStart: false,
  startHidden: false,
  runAsAdmin: false,
  showStartupNotification: true,
  historyLimit: 100,
  theme: 'light',
  opacity: 0.9,
  toggleShortcut: '',
  numberShortcuts: true,
  clipboardMonitor: true,
  ignoreDuplicates: true,
  saveImages: true,
  showImagePreview: false,
  // 音效设置
  soundEnabled: true,
  soundVolume: 50,
  copySoundPath: '',
  pasteSoundPath: '',
  soundPreset: 'default',
  // 动画设置
  clipboardAnimationEnabled: true
  ,
  // 显示行为
  autoScrollToTopOnShow: false,
  // 格式设置
  pasteWithFormat: true, // 是否带格式粘贴和显示，true=带格式，false=纯文本
  // 图片粘贴策略
  imageDataPriorityApps: []
};

// 初始化设置管理器
export async function initializeSettingsManager() {
  // 加载当前设置
  await loadSettings();

  // 应用设置
  applySettings(currentSettings);

  // 监听设置变更事件
  await listen('settings-changed', (event) => {
    const newSettings = event.payload;
    currentSettings = { ...currentSettings, ...newSettings };
    applySettings(newSettings);
  });
}

// 加载设置
async function loadSettings() {
  try {
    const savedSettings = await invoke('get_settings');
    currentSettings = savedSettings;
    // console.log('主窗口设置加载成功:', currentSettings);
  } catch (error) {
    console.error('加载设置失败:', error);
    // 保持默认设置
  }
}

// 应用设置
function applySettings(settings) {
  // 应用主题
  if (settings.theme) {
    applyTheme(settings.theme);
  }

  // 应用透明度
  if (settings.opacity !== undefined) {
    applyOpacity(settings.opacity);
  }

  // 应用其他设置
  if (settings.historyLimit) {
    // 刷新剪贴板历史以应用新的数量限制
    refreshClipboardHistory();
  }

  if (settings.clipboardMonitor !== undefined) {
    // 剪贴板监听设置
    console.log('剪贴板监听设置:', settings.clipboardMonitor);
  }

  // 应用动画设置
  if (settings.clipboardAnimationEnabled !== undefined) {
    applyAnimationSettings(settings.clipboardAnimationEnabled);
  }

  if (Array.isArray(settings.imageDataPriorityApps)) {
    try {
      window.__imageDataPriorityApps = settings.imageDataPriorityApps;
    } catch (error) {
      console.warn('记录图像数据优先应用失败:', error);
    }
  }

  // 设置显示后滚动行为
  if (settings.autoScrollToTopOnShow !== undefined) {
    console.log('应用自动滚动设置:', settings.autoScrollToTopOnShow);
    setupAutoScrollOnShow(Boolean(settings.autoScrollToTopOnShow));
  }

  // 应用标题栏位置设置
  if (settings.titleBarPosition !== undefined) {
    applyTitleBarPosition(settings.titleBarPosition);
  }

  // 应用格式设置
  if (settings.pasteWithFormat !== undefined) {
    setPasteWithFormat(settings.pasteWithFormat);
    try {
      updateFormatButtonStatus();
    } catch (error) {
      console.warn('更新格式按钮状态失败:', error);
    }
  }
}

// 应用主题
function applyTheme(theme) {
  const body = document.body;

  // 移除所有主题类
  body.classList.remove('theme-light', 'theme-dark', 'theme-transparent', 'theme-background', 'theme-auto');

  // 将 auto/system 映射为实际主题
  let resolvedTheme = theme;
  if (theme === 'auto' || theme === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    resolvedTheme = prefersDark ? 'dark' : 'light';
  }

  // 应用新主题
  body.classList.add(`theme-${resolvedTheme}`);
  applyBackgroundToMainWindow(resolvedTheme);

  // console.log('主题已应用:', theme);
}

// 应用主窗口背景图
async function applyBackgroundToMainWindow(theme) {
  try {
    const container = document.querySelector('.container');
    if (!container) return;
    const path = currentSettings.backgroundImagePath || '';
    if (theme === 'background' && path) {
      let url = '';
      try {
        const dataUrl = await invoke('read_image_file', { filePath: path });
        url = dataUrl;
      } catch (e) {
        url = convertFileSrc ? convertFileSrc(path) : path;
      }
      container.style.backgroundImage = `url("${url.replaceAll('"', '\\"')}")`;

      // 分析背景图主色调并应用到标题栏
      try {
        const dominantColor = await getDominantColor(url);
        const titleBarColors = generateTitleBarColors(dominantColor);
        applyTitleBarColors(titleBarColors);
      } catch (colorError) {
        console.warn('分析背景图颜色失败:', colorError);
        // 如果颜色分析失败，移除动态颜色类以使用默认样式
        removeTitleBarColors();
      }
    } else {
      container.style.backgroundImage = '';
      // 移除动态标题栏颜色
      removeTitleBarColors();
    }
  } catch (e) {
    console.warn('应用主窗口背景图片失败:', e);
  }
}

// 应用透明度
function applyOpacity(opacity) {
  // 透明度主要影响透明主题
  if (currentSettings.theme === 'transparent') {
    document.documentElement.style.setProperty('--window-opacity', opacity);
  }

  // console.log('透明度已应用:', opacity);
}

// 应用动画设置
async function applyAnimationSettings(animationEnabled) {
  try {
    // 清理旧的动画样式元素
    const oldAnimationStyleElement = document.getElementById('animation-control-styles');
    if (oldAnimationStyleElement) {
      oldAnimationStyleElement.remove();
    }

    //设置开关状态
    const { setAnimationEnabled } = await import('./windowAnimation.js');
    setAnimationEnabled(animationEnabled);
    console.log('动画设置已应用:', animationEnabled);
  } catch (error) {
    console.error('应用动画设置失败:', error);
  }
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

// 设置窗口显示后自动滚动到顶部
function setupAutoScrollOnShow(enabled) {
  console.log('设置自动滚动监听:', enabled);

  // 如已存在监听，则先解除
  if (window.__autoScrollUnlisten && typeof window.__autoScrollUnlisten === 'function') {
    try {
      console.log('移除现有自动滚动监听');
      window.__autoScrollUnlisten();
    } catch (_) { }
    window.__autoScrollUnlisten = null;
  }

  if (enabled) {
    console.log('创建新的自动滚动监听');
    // 监听来自后端的显示事件
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen('window-show-animation', () => autoScrollHandler()))
      .then((unlisten) => {
        console.log('自动滚动监听创建成功');
        window.__autoScrollUnlisten = unlisten;
      })
      .catch((error) => {
        console.error('设置自动滚动监听失败:', error);
      });
  } else {
    console.log('自动滚动已禁用');
  }
}

function autoScrollHandler() {
  console.log('自动滚动处理器被调用，当前设置:', currentSettings.autoScrollToTopOnShow);

  if (!currentSettings.autoScrollToTopOnShow) {
    console.log('自动滚动已禁用，不执行滚动');
    return;
  }

  console.log('执行自动滚动到顶部');
  // 推迟到渲染完成后执行
  setTimeout(() => {
    try {
      const list = document.getElementById('clipboard-list');
      if (list) {
        list.scrollTo({ top: 0, behavior: 'instant' });
        console.log('滚动到顶部完成');
      } else {
        console.log('未找到clipboard-list元素');
      }
    } catch (error) {
      console.error('滚动到顶部失败:', error);
    }
  }, 0);
}

// 初始化主题（用于应用启动时）
export function initializeTheme() {
  const currentTheme = getCurrentTheme();

  if (currentTheme) {
    // 更新设置对象以保持同步
    currentSettings.theme = currentTheme;
    console.log('主题已同步:', currentTheme);
  } else {
    // 如果主题管理器还没有初始化，使用设置中的主题
    const fallbackTheme = currentSettings.theme || 'light';
    applyTheme(fallbackTheme);
    currentSettings.theme = fallbackTheme;
    console.log('使用备用主题:', fallbackTheme);
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

// 应用标题栏位置设置
function applyTitleBarPosition(position) {
  const titleBar = document.getElementById('titlebar');
  const container = document.querySelector('.container');
  const body = document.body;

  if (!titleBar || !container) return;

  // 移除所有位置类
  body.classList.remove('titlebar-top', 'titlebar-bottom', 'titlebar-left', 'titlebar-right');

  // 应用新位置类
  body.classList.add(`titlebar-${position}`);

  console.log('标题栏位置已应用:', position);

  // 标题栏位置改变后需要重新计算指示器位置
  updateIndicatorsAfterLayoutChange();
}

// 布局变化后更新指示器位置
function updateIndicatorsAfterLayoutChange() {
  // 等待布局更新完成
  setTimeout(() => {
    // 更新标签页切换指示器 - 通过事件触发
    window.dispatchEvent(new CustomEvent('update-tab-indicator'));

    // 更新筛选标签指示器
    if (typeof moveFilterTabsIndicator === 'function') {
      moveFilterTabsIndicator();
    }

  }, 50); // 短暂延迟确保布局已更新
}

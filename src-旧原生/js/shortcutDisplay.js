import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// 快捷键显示映射
const SHORTCUT_DISPLAY_MAP = {
  toggleShortcut: 'global-toggle-shortcut-display',
  previewShortcut: 'preview-shortcut-display',
  screenshot_shortcut: 'screenshot-shortcut-display',
  navigateUpShortcut: 'navigate-shortcut-display',
  navigateDownShortcut: 'navigate-shortcut-display',
  tabLeftShortcut: 'tab-shortcut-display',
  tabRightShortcut: 'tab-shortcut-display',
  focusSearchShortcut: 'focus-search-shortcut-display',
  hideWindowShortcut: 'hide-window-shortcut-display',
  executeItemShortcut: 'execute-item-shortcut-display',
  previousGroupShortcut: 'previous-group-shortcut-display',
  nextGroupShortcut: 'next-group-shortcut-display',
  togglePinShortcut: 'toggle-pin-shortcut-display'
};

// 格式化快捷键显示
function formatShortcutForDisplay(shortcut) {
  if (!shortcut) return '';
  
  // 将快捷键字符串转换为显示格式
  return shortcut
    .split('+')
    .map(key => {
      switch (key.toLowerCase()) {
        case 'ctrl': return 'Ctrl';
        case 'alt': return 'Alt';
        case 'shift': return 'Shift';
        case 'win': return 'Win';
        case 'cmd': return 'Cmd';
        case 'arrowup': return '↑';
        case 'arrowdown': return '↓';
        case 'arrowleft': return '←';
        case 'arrowright': return '→';
        case 'enter': return 'Enter';
        case 'escape': return 'ESC';
        case 'tab': return 'Tab';
        case 'space': return 'Space';
        case 'v': return 'V';
        case 'p': return 'P';
        default: return key.toUpperCase();
      }
    })
    .map(key => `<kbd>${key}</kbd>`)
    .join(' + ');
}

// 更新单个快捷键显示
function updateShortcutDisplay(elementId, shortcut1, shortcut2 = null) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const kbdContainer = element.querySelector('kbd').parentNode;
  if (!kbdContainer) return;
  
  let displayText;
  if (shortcut2) {
    // 双快捷键显示 (如导航键)
    displayText = `${formatShortcutForDisplay(shortcut1)} / ${formatShortcutForDisplay(shortcut2)}`;
  } else {
    // 单快捷键显示
    displayText = formatShortcutForDisplay(shortcut1);
  }
  
  // 更新键盘显示部分
  const span = element.querySelector('span');
  kbdContainer.innerHTML = displayText;
  kbdContainer.appendChild(span);
}

// 更新所有快捷键显示
export async function updateAllShortcutDisplays() {
  try {
    const settings = await invoke('get_settings');
    
    // 更新全局显示/隐藏快捷键
    updateShortcutDisplay('global-toggle-shortcut-display', settings.toggleShortcut);
    
    // 同时更新底部状态栏的快捷键显示
    const toggleShortcutElement = document.getElementById('toggle-shortcut-display');
    if (toggleShortcutElement && settings.toggleShortcut) {
      toggleShortcutElement.textContent = `${settings.toggleShortcut}: 显示/隐藏`;
    }
    
    // 更新数字快捷键显示
    const numberShortcutElement = document.querySelector('#footer .shortcuts-info span:nth-child(2)');
    if (numberShortcutElement && settings.numberShortcutsModifier) {
      numberShortcutElement.textContent = `${settings.numberShortcutsModifier}+数字: 粘贴对应历史`;
    }
    
    // 更新导航快捷键 (上下键)
    updateShortcutDisplay('navigate-shortcut-display', 
      settings.navigateUpShortcut, 
      settings.navigateDownShortcut
    );
    
    // 更新标签切换快捷键 (左右键)
    updateShortcutDisplay('tab-shortcut-display', 
      settings.tabLeftShortcut, 
      settings.tabRightShortcut
    );
    
    // 更新其他单独的快捷键
    updateShortcutDisplay('focus-search-shortcut-display', settings.focusSearchShortcut);
    updateShortcutDisplay('hide-window-shortcut-display', settings.hideWindowShortcut);
    updateShortcutDisplay('execute-item-shortcut-display', settings.executeItemShortcut);
    updateShortcutDisplay('previous-group-shortcut-display', settings.previousGroupShortcut);
    updateShortcutDisplay('next-group-shortcut-display', settings.nextGroupShortcut);
    updateShortcutDisplay('toggle-pin-shortcut-display', settings.togglePinShortcut);
    
    // 更新帮助面板中的数字快捷键显示
    if (settings.numberShortcutsModifier) {
      updateShortcutDisplay('number-shortcut-display', settings.numberShortcutsModifier + '+1-9');
    }
    
  } catch (error) {
    console.error('更新快捷键显示失败:', error);
  }
}

// 初始化快捷键显示
export async function initShortcutDisplay() {
  // 初始加载
  await updateAllShortcutDisplays();
  
  // 监听设置变更事件
  try {
    await listen('settings-changed', async () => {
      await updateAllShortcutDisplays();
    });
  } catch (error) {
    console.error('监听设置变更事件失败:', error);
  }
}

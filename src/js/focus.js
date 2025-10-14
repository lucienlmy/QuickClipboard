import { invoke } from '@tauri-apps/api/core';
import {
  searchInput,
  quickTextsSearch,
  quickTextTitleInput,
  quickTextContentInput,
  groupNameInput
} from './config.js';

// 焦点状态管理
let currentFocusState = 'normal'; // 'normal' | 'focused'
let focusDebounceTimer = null;
let blurDebounceTimer = null;
const FOCUS_DEBOUNCE_DELAY = 50; // 50ms 防抖延迟

// 防抖的焦点启用函数
async function debouncedEnableFocus() {
  // 清除可能存在的blur定时器
  if (blurDebounceTimer) {
    clearTimeout(blurDebounceTimer);
    blurDebounceTimer = null;
  }
  
  // 如果已经是focused状态，不需要重复调用
  if (currentFocusState === 'focused') {
    return;
  }
  
  // 清除之前的focus定时器
  if (focusDebounceTimer) {
    clearTimeout(focusDebounceTimer);
  }
  
  focusDebounceTimer = setTimeout(async () => {
    try {
      await invoke('focus_clipboard_window');
      currentFocusState = 'focused';
    } catch (error) {
      console.error('启用窗口焦点失败:', error);
    }
    focusDebounceTimer = null;
  }, FOCUS_DEBOUNCE_DELAY);
}

// 防抖的焦点恢复函数
async function debouncedRestoreFocus() {
  // 清除可能存在的focus定时器
  if (focusDebounceTimer) {
    clearTimeout(focusDebounceTimer);
    focusDebounceTimer = null;
  }
  
  // 如果已经是normal状态，不需要重复调用
  if (currentFocusState === 'normal') {
    return;
  }
  
  // 清除之前的blur定时器
  if (blurDebounceTimer) {
    clearTimeout(blurDebounceTimer);
  }
  
  blurDebounceTimer = setTimeout(async () => {
    // 再次检查是否有其他输入框获得焦点
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' || 
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true'
    );
    
    // 如果有其他输入框获得焦点，不恢复
    if (isInputFocused) {
      return;
    }
    
    try {
      await invoke('restore_last_focus');
      currentFocusState = 'normal';
    } catch (error) {
      console.error('恢复工具窗口模式失败:', error);
    }
    blurDebounceTimer = null;
  }, FOCUS_DEBOUNCE_DELAY);
}

// 初始化输入框焦点管理
export function initInputFocusManagement() {
  // 获取所有需要管理焦点的输入框
  const inputElements = [
    searchInput,
    quickTextsSearch,
    quickTextTitleInput,
    quickTextContentInput,
    groupNameInput
  ];

  inputElements.forEach(input => {
    if (input) {
      // 获得焦点时临时启用窗口焦点（使用防抖）
      input.addEventListener('focus', () => {
        debouncedEnableFocus();
      });

      // 失去焦点时恢复工具窗口模式（使用防抖）
      input.addEventListener('blur', () => {
        debouncedRestoreFocus();
      });
    }
  });

  // 为主题设置的单选按钮添加焦点管理
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  themeRadios.forEach(radio => {
    radio.addEventListener('focus', async () => {
      try {
        await invoke('enable_window_focus_temp');
      } catch (error) {
        console.error('启用窗口焦点失败:', error);
      }
    });

    radio.addEventListener('blur', async () => {
      try {
        await invoke('disable_window_focus_temp');
      } catch (error) {
        console.error('恢复工具窗口模式失败:', error);
      }
    });
  });
}

// 手动启用窗口焦点（用于特殊情况）
export async function enableWindowFocus() {
  try {
    await invoke('enable_window_focus_temp');
  } catch (error) {
    console.error('启用窗口焦点失败:', error);
  }
}

// 手动禁用窗口焦点（用于特殊情况）
export async function disableWindowFocus() {
  try {
    await invoke('disable_window_focus_temp');
  } catch (error) {
    console.error('禁用窗口焦点失败:', error);
  }
}

// 恢复焦点
export async function restoreFocus() {
  try {
    await invoke('restore_last_focus');
  } catch (error) {
    console.error('恢复焦点失败:', error);
  }
}

// 自动聚焦搜索框（根据设置）
export async function autoFocusSearchIfEnabled() {
  try {
    // 获取设置
    const settings = await invoke('get_settings');
    
    if (!settings.autoFocusSearch) {
      return false; // 如果没有启用自动聚焦，返回false
    }
    
    // 使用 navigation.js 中的 focusSearchBox 函数
    const { focusSearchBox } = await import('./navigation.js');
    await focusSearchBox();
    return true;
  } catch (error) {
    console.error('自动聚焦搜索框失败:', error);
    return false;
  }
}

// 移除搜索框焦点
export function blurSearchInputs() {
  const searchInputs = [
    document.getElementById('search-input'),
    document.getElementById('quick-texts-search')
  ];
  
  searchInputs.forEach(input => {
    if (input && document.activeElement === input) {
      input.blur();
    }
  });
}

// 为动态创建的输入框添加焦点管理
export function addInputFocusManagement(inputElement) {
  if (!inputElement) return;
  
  // 获得焦点时临时启用窗口焦点（使用防抖）
  inputElement.addEventListener('focus', () => {
    debouncedEnableFocus();
  });

  // 失去焦点时恢复工具窗口模式（使用防抖）
  inputElement.addEventListener('blur', () => {
    debouncedRestoreFocus();
  });
}

// 批量为多个输入框添加焦点管理
export function addMultipleInputsFocusManagement(inputElements) {
  inputElements.forEach(input => {
    if (input) {
      addInputFocusManagement(input);
    }
  });
}
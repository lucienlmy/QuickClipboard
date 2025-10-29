import { invoke } from '@tauri-apps/api/core';
import {
  isPinned,
  setIsPinned
} from './config.js';
import { updateToolState } from './toolManager.js';

// 切换窗口固定状态（控制粘贴后是否隐藏窗口）
export async function togglePin() {
  const newPinState = !isPinned;
  setIsPinned(newPinState);

  try {
    await invoke('set_window_pinned', {
      pinned: newPinState
    });

    // 更新UI状态
    updateToolState('pin-button', newPinState);

  } catch (error) {
    console.error('设置窗口固定状态失败:', error);
    // 如果设置失败，恢复原状态
    setIsPinned(!newPinState);
  }
}


// 打开设置窗口
export async function openSettingsWindow() {
  try {
    await invoke('open_settings_window');
  } catch (error) {
    console.error('打开设置窗口失败:', error);
  }
}

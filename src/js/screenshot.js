import { invoke } from '@tauri-apps/api/core';
import { showNotification } from './notificationManager.js';

// 启动内置截屏窗口
export async function startBuiltinScreenshot() {
  try {
    console.log('启动内置截屏窗口...');
    await invoke('start_builtin_screenshot');
  } catch (error) {
    console.error('启动内置截屏窗口失败:', error);
    showNotification(`启动内置截屏窗口失败: ${error}`, 'error');
  }
}

// 启动内置截屏窗口
export async function startNativeScreenshot() {
  try {
    console.log('启动内置截屏窗口...');
    setTimeout(async () => {
      await invoke('start_builtin_screenshot');
    }, 600);
  } catch (error) {
    console.error('启动截屏失败:', error);
    showNotification(`启动截屏失败: ${error}`, 'error');
  }
}

// 默认使用内置截屏
export async function startScreenshot() {
  await startBuiltinScreenshot();
}

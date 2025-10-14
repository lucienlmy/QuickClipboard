/**
 * 背景图管理器
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { getDominantColor, generateTitleBarColors, applyTitleBarColors, removeTitleBarColors } from './colorAnalyzer.js';

/**
 * 应用背景图到指定容器
 */
export async function applyBackgroundImage(options) {
  const {
    containerSelector,
    theme,
    backgroundImagePath,
    windowName = '窗口'
  } = options;

  try {
    const container = document.querySelector(containerSelector);
    if (!container) {
      return;
    }

    // 只有在背景图主题时才应用背景图
    if (theme === 'background' && backgroundImagePath) {
      // 使用 convertFileSrc 直接转换文件路径
      const assetUrl = convertFileSrc(backgroundImagePath, 'asset');
      
      // 预加载图片
      await preloadBackgroundImage(assetUrl);
      
      // 设置背景图
      container.style.backgroundImage = `url("${assetUrl}")`;

      // 分析背景图主色调并应用到标题栏
      try {
        const dominantColor = await getDominantColor(assetUrl);
        const titleBarColors = generateTitleBarColors(dominantColor);
        applyTitleBarColors(titleBarColors);
      } catch (colorError) {
        console.warn(`${windowName}分析背景图颜色失败:`, colorError);
        removeTitleBarColors();
      }
    } else {
      // 清除背景图
      container.style.backgroundImage = '';
      removeTitleBarColors();
    }
  } catch (error) {
    console.error(`${windowName}应用背景图失败:`, error);
  }
}

// 预加载背景图片
function preloadBackgroundImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => {
      console.warn('背景图预加载失败，继续应用');
      resolve();
    };
    img.src = url;

    setTimeout(() => resolve(), 3000);
  });
}

// 清除背景图
export function clearBackgroundImage(containerSelector) {
  try {
    const container = document.querySelector(containerSelector);
    if (container) {
      container.style.backgroundImage = '';
    }
    removeTitleBarColors();
  } catch (error) {
    console.error('清除背景图失败:', error);
  }
}

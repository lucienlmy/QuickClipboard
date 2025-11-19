import { invoke } from '@tauri-apps/api/core';
import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { cancelScreenshotSession } from '@shared/api/system';

async function captureSelectionToBlob(stageRef, selection, cornerRadius = 0) {
  if (!selection || !stageRef || !stageRef.current) return null;

  const stage = stageRef.current.getStage ? stageRef.current.getStage() : stageRef.current;
  if (!stage || typeof stage.toDataURL !== 'function') return null;

  const { x, y, width, height } = selection;
  const x1 = Math.round(x);
  const y1 = Math.round(y);
  const x2 = Math.round(x + width);
  const y2 = Math.round(y + height);

  const safeX = x1;
  const safeY = y1;
  const safeWidth = Math.max(1, x2 - x1);
  const safeHeight = Math.max(1, y2 - y1);

  const bgLayer = stage.findOne('#screenshot-bg-layer');
  const exportNode = bgLayer && typeof bgLayer.toDataURL === 'function' ? bgLayer : stage;

  const stagePixelRatio = stage.pixelRatio?.() || window.devicePixelRatio || 1;

  const dataURL = exportNode.toDataURL({
    x: safeX,
    y: safeY,
    width: safeWidth,
    height: safeHeight,
    pixelRatio: stagePixelRatio,
  });

  let blob;

  if (cornerRadius > 0) {
    try {
      blob = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            const radius = cornerRadius * stagePixelRatio;

            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
            } else {
              ctx.moveTo(radius, 0);
              ctx.lineTo(canvas.width - radius, 0);
              ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
              ctx.lineTo(canvas.width, canvas.height - radius);
              ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
              ctx.lineTo(radius, canvas.height);
              ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
              ctx.lineTo(0, radius);
              ctx.quadraticCurveTo(0, 0, radius, 0);
            }
            ctx.closePath();
            ctx.clip();

            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => resolve(b), 'image/png');
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = (e) => reject(new Error('Failed to load image'));
        img.src = dataURL;
      });
    } catch (err) {
      console.error('圆角处理失败:', err);
      return null;
    }
  } else {
    try {
      const response = await fetch(dataURL);
      blob = await response.blob();
    } catch (err) {
      console.error('获取图片数据失败:', err);
      return null;
    }
  }

  return blob;
}

// 导出到剪贴板
export async function exportToClipboard(stageRef, selection, cornerRadius = 0) {
  if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
    console.error('当前环境不支持图片剪贴板写入');
    return;
  }

  const blob = await captureSelectionToBlob(stageRef, selection, cornerRadius);
  if (!blob) return;

  try {
    const item = new window.ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([item]);
    await cancelScreenshotSession();
  } catch (err) {
    console.error('写入剪贴板失败:', err);
  }
}

// 导出为贴图
export async function exportToPin(stageRef, selection, cornerRadius = 0) {
  const blob = await captureSelectionToBlob(stageRef, selection, cornerRadius);
  if (!blob) return;

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  try {
    const timestamp = Date.now();
    const tempFileName = `screenshot_pin_${timestamp}.png`;
    await writeFile(tempFileName, uint8Array, { baseDir: BaseDirectory.Temp });

    const { tempDir } = await import('@tauri-apps/api/path');
    const tempDirPath = await tempDir();
    const tempFilePath = `${tempDirPath}${tempFileName}`;
    
    const { x, y, width, height } = selection;
    const screenX = Math.round(x);
    const screenY = Math.round(y);
    const screenWidth = Math.round(width);
    const screenHeight = Math.round(height);
    
    await invoke('pin_image_from_file', {
      filePath: tempFilePath,
      x: screenX,
      y: screenY,
      width: screenWidth,
      height: screenHeight
    });

    await cancelScreenshotSession();
  } catch (error) {
    console.error('创建贴图失败:', error);
    throw error;
  }
}

import { invoke } from '@tauri-apps/api/core';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { cancelScreenshotSession } from '@shared/api/system';
import { compositeSelectionImage } from './imageCompositor';

async function calculateImageHash(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 16);
}

function applyCornerRadius(canvas, cornerRadius, pixelRatio) {
  const radius = cornerRadius * pixelRatio;
  const newCanvas = document.createElement('canvas');
  newCanvas.width = canvas.width;
  newCanvas.height = canvas.height;
  const ctx = newCanvas.getContext('2d');
  
  ctx.imageSmoothingEnabled = false;

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
  ctx.drawImage(canvas, 0, 0);

  return newCanvas;
}

async function captureSelectionToBlob(stageRef, selection, cornerRadius = 0, { screens = [] } = {}) {
  if (!selection || !stageRef || !stageRef.current) return null;

  const stage = stageRef.current.getStage ? stageRef.current.getStage() : stageRef.current;
  if (!stage || typeof stage.toDataURL !== 'function') return null;

  try {
    let canvas = await compositeSelectionImage({ stage, selection, screens });
    
    if (cornerRadius > 0) {
      const pixelRatio = stage.pixelRatio?.() || window.devicePixelRatio || 1;
      canvas = applyCornerRadius(canvas, cornerRadius, pixelRatio);
    }
    
    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
  } catch (err) {
    console.error('截图合成失败:', err);
    return null;
  }
}

// 导出到剪贴板
export async function exportToClipboard(stageRef, selection, cornerRadius = 0, { screens = [] } = {}) {
  const blob = await captureSelectionToBlob(stageRef, selection, cornerRadius, { screens });
  if (!blob) return;

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  try {
    const dataDir = await invoke('get_data_directory');
    const hash = await calculateImageHash(uint8Array);
    const filename = `${hash}.png`;
    const filePath = `${dataDir}\\clipboard_images\\${filename}`;
    
    await mkdir(`${dataDir}\\clipboard_images`, { recursive: true });
    await writeFile(filePath, uint8Array);

    await invoke('copy_image_to_clipboard', { filePath });
    await cancelScreenshotSession();
  } catch (err) {
    console.error('写入剪贴板失败:', err);
  }
}

// 导出为贴图
export async function exportToPin(stageRef, selection, cornerRadius = 0, { screens = [] } = {}) {
  const blob = await captureSelectionToBlob(stageRef, selection, cornerRadius, { screens });
  if (!blob) return;

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  try {
    const dataDir = await invoke('get_data_directory');
    const hash = await calculateImageHash(uint8Array);
    const filename = `${hash}.png`;
    const filePath = `${dataDir}\\pin_images\\${filename}`;
    
    await mkdir(`${dataDir}\\pin_images`, { recursive: true });
    await writeFile(filePath, uint8Array);
    
    const { x, y, width, height } = selection;
    const windowScale = window.devicePixelRatio || 1;
    
    const x1 = Math.round(x);
    const y1 = Math.round(y);
    const x2 = Math.round(x + width);
    const y2 = Math.round(y + height);
    const safeWidth = Math.max(1, x2 - x1);
    const safeHeight = Math.max(1, y2 - y1);
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    let targetScreen = screens.find(s => {
      return centerX >= s.x && 
             centerX < s.x + s.width &&
             centerY >= s.y && 
             centerY < s.y + s.height;
    });
    
    if (!targetScreen && screens.length > 0) {
      targetScreen = screens[0];
    }
    
    const targetScaleFactor = targetScreen?.scaleFactor || windowScale;
    
    const physicalWidth = safeWidth * windowScale;
    const physicalHeight = safeHeight * windowScale;
    
    let physicalX, physicalY;
    
    if (targetScreen) {
      const relativeX = x1 - targetScreen.x;
      const relativeY = y1 - targetScreen.y;
      
      const scaleX = targetScreen.physicalWidth / targetScreen.width;
      const scaleY = targetScreen.physicalHeight / targetScreen.height;
      
      const physicalOffsetX = Math.floor(relativeX * scaleX);
      const physicalOffsetY = Math.floor(relativeY * scaleY);
      
      physicalX = targetScreen.physicalX + physicalOffsetX;
      physicalY = targetScreen.physicalY + physicalOffsetY;
    } else {
      const minPhysicalX = screens.length > 0 ? Math.min(...screens.map(s => s.physicalX)) : 0;
      const minPhysicalY = screens.length > 0 ? Math.min(...screens.map(s => s.physicalY)) : 0;
      physicalX = Math.floor(x1 * windowScale + minPhysicalX);
      physicalY = Math.floor(y1 * windowScale + minPhysicalY);
    }
    
    const logicalWidth = Math.round(physicalWidth / targetScaleFactor);
    const logicalHeight = Math.round(physicalHeight / targetScaleFactor);
    
    await invoke('pin_image_from_file', {
      filePath,
      x: physicalX,
      y: physicalY,
      width: logicalWidth,
      height: logicalHeight
    });

    await cancelScreenshotSession();
  } catch (error) {
    console.error('创建贴图失败:', error);
    throw error;
  }
}

// 导出为文件
export async function exportToFile(stageRef, selection, cornerRadius = 0, { screens = [] } = {}) {
  const blob = await captureSelectionToBlob(stageRef, selection, cornerRadius, { screens });
  if (!blob) return;

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  try {
    const timestamp = Date.now();
    const defaultPath = `QC截屏_${timestamp}.png`;
    
    const filePath = await save({
      defaultPath,
      filters: [{
        name: 'Image',
        extensions: ['png']
      }]
    });

    if (filePath) {
      await writeFile(filePath, uint8Array);
      await cancelScreenshotSession();
    }
  } catch (error) {
    console.error('保存文件失败:', error);
  }
}

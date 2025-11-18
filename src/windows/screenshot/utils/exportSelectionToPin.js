import { invoke } from '@tauri-apps/api/core';
import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { cancelScreenshotSession } from '@shared/api/system';

export async function exportSelectionToPin(stageRef, selection) {
  if (!selection || !stageRef || !stageRef.current) return;

  const stage = stageRef.current.getStage ? stageRef.current.getStage() : stageRef.current;
  if (!stage || typeof stage.toDataURL !== 'function') return;

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

  const response = await fetch(dataURL);
  const blob = await response.blob();
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

// 使用 Konva 滤镜处理马赛克和模糊效果

import Konva from 'konva';
import { drawBackgroundFromScreens } from './imageCompositor';

// 应用马赛克效果到图像区域
export function applyMosaic(canvas, x, y, width, height, blockSize = 10) {
  const padding = Math.max(blockSize * 2, 20);
  const sourceWidth = canvas.width;
  const sourceHeight = canvas.height;
  
  const extX = Math.max(0, x - padding);
  const extY = Math.max(0, y - padding);
  const extRight = Math.min(sourceWidth, x + width + padding);
  const extBottom = Math.min(sourceHeight, y + height + padding);
  const extWidth = extRight - extX;
  const extHeight = extBottom - extY;
  
  const offsetX = x - extX;
  const offsetY = y - extY;
  
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.top = '-9999px';
  tempContainer.style.left = '-9999px';
  document.body.appendChild(tempContainer);
  
  try {
    const tempStage = new Konva.Stage({
      container: tempContainer,
      width: extWidth,
      height: extHeight,
    });
    const tempLayer = new Konva.Layer();
    tempStage.add(tempLayer);
    
    const tempImage = new Konva.Image({
      x: 0,
      y: 0,
      image: canvas,
      crop: { x: extX, y: extY, width: extWidth, height: extHeight },
      filters: [Konva.Filters.Pixelate],
      pixelSize: blockSize,
    });
    
    tempLayer.add(tempImage);
    tempImage.cache();
    tempLayer.draw();
    
    const resultCanvas = tempStage.toCanvas();
    
    tempStage.destroy();
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(resultCanvas, offsetX, offsetY, width, height, x, y, width, height);
    
    return canvas;
  } finally {
    document.body.removeChild(tempContainer);
  }
}

// 应用模糊效果到图像区域（Konva.Filters.Blur）
export function applyBlur(canvas, x, y, width, height, radius = 10) {
  const padding = Math.max(radius * 3, 30);
  const sourceWidth = canvas.width;
  const sourceHeight = canvas.height;
  
  const extX = Math.max(0, x - padding);
  const extY = Math.max(0, y - padding);
  const extRight = Math.min(sourceWidth, x + width + padding);
  const extBottom = Math.min(sourceHeight, y + height + padding);
  const extWidth = extRight - extX;
  const extHeight = extBottom - extY;
  
  const offsetX = x - extX;
  const offsetY = y - extY;
  
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.top = '-9999px';
  tempContainer.style.left = '-9999px';
  document.body.appendChild(tempContainer);
  
  try {
    const tempStage = new Konva.Stage({
      container: tempContainer,
      width: extWidth,
      height: extHeight,
    });
    const tempLayer = new Konva.Layer();
    tempStage.add(tempLayer);
    
    const tempImage = new Konva.Image({
      x: 0,
      y: 0,
      image: canvas,
      crop: { x: extX, y: extY, width: extWidth, height: extHeight },
      filters: [Konva.Filters.Blur],
      blurRadius: radius,
    });
    
    tempLayer.add(tempImage);
    tempImage.cache();
    tempLayer.draw();
    
    const resultCanvas = tempStage.toCanvas();
    
    tempStage.destroy();
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(resultCanvas, offsetX, offsetY, width, height, x, y, width, height);
    
    return canvas;
  } finally {
    document.body.removeChild(tempContainer);
  }
}

// 处理马赛克形状（根据路径或区域）

export async function processMosaicShape(shape, stageRef, screens, existingShapes = []) {
  if (!stageRef?.current || !screens?.length) {
    return null;
  }
  
  console.log('[processMosaicShape] coverageMode:', shape.coverageMode, 'existingShapes:', existingShapes.length);
  
  const stage = stageRef.current;
  
  try {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = stage.width();
    tempCanvas.height = stage.height();
    const tempCtx = tempCanvas.getContext('2d');
    
    drawBackgroundFromScreens(tempCtx, screens, { 
      x: 0, 
      y: 0, 
      width: stage.width(), 
      height: stage.height() 
    }, 1);
    
    // 如果是全局模式，使用 Stage 的完整渲染（包括背景 + 所有编辑层内容）
    if (shape.coverageMode === 'global') {
      console.log('[全局模式] 使用 Stage 编辑层，形状数量:', existingShapes.length);
      
      try {
        const overlayLayer = stage.findOne('#screenshot-overlay-layer');
        const uiLayer = stage.findOne('#screenshot-ui-layer');
        const overlayVisible = overlayLayer?.visible();
        const uiVisible = uiLayer?.visible();
        
        if (overlayLayer) overlayLayer.visible(false);
        if (uiLayer) uiLayer.visible(false);
        
        const stageCanvas = stage.toCanvas();
        
        if (overlayLayer && overlayVisible !== undefined) overlayLayer.visible(overlayVisible);
        if (uiLayer && uiVisible !== undefined) uiLayer.visible(uiVisible);
        
        tempCtx.drawImage(stageCanvas, 0, 0);
        
        console.log('[全局模式] Stage 内容已合并到处理源');
      } catch (error) {
        console.error('[全局模式] Stage 渲染失败:', error);
      }
    }
    
    //根据绘画模式处理
    if (shape.drawMode === 'brush') {
      // 画笔模式：创建遮罩并处理路径区域
      return processBrushMosaic(shape, tempCanvas);
    } else if (shape.drawMode === 'region') {
      // 区域模式：直接处理矩形区域
      return processRegionMosaic(shape, tempCanvas);
    }
  } catch (error) {
    console.error('处理马赛克失败:', error);
    return null;
  }
  
  return null;
}

// 处理画笔模式的马赛克

function processBrushMosaic(shape, sourceCanvas) {
  const { points, brushSize, renderMode, mosaicSize, blurRadius } = shape;
  
  if (!points || points.length < 2) return null;
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    minX = Math.min(minX, x - brushSize / 2);
    minY = Math.min(minY, y - brushSize / 2);
    maxX = Math.max(maxX, x + brushSize / 2);
    maxY = Math.max(maxY, y + brushSize / 2);
  }
  
  const padding = 2;
  minX = Math.floor(minX) - padding;
  minY = Math.floor(minY) - padding;
  maxX = Math.ceil(maxX) + padding;
  maxY = Math.ceil(maxY) + padding;
  
  const width = maxX - minX;
  const height = maxY - minY;
  
  if (width <= 0 || height <= 0) return null;
  
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d');
  
  maskCtx.fillStyle = 'white';
  maskCtx.strokeStyle = 'white';
  maskCtx.lineWidth = brushSize;
  maskCtx.lineCap = 'round';
  maskCtx.lineJoin = 'round';
  
  maskCtx.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] - minX;
    const y = points[i + 1] - minY;
    if (i === 0) {
      maskCtx.moveTo(x, y);
    } else {
      maskCtx.lineTo(x, y);
    }
  }
  maskCtx.stroke();
  
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = width;
  resultCanvas.height = height;
  const resultCtx = resultCanvas.getContext('2d');
  
  resultCtx.drawImage(
    sourceCanvas,
    minX, minY, width, height,
    0, 0, width, height
  );
  
  if (renderMode === 'mosaic') {
    applyMosaic(resultCanvas, 0, 0, width, height, mosaicSize || 10);
  } else {
    applyBlur(resultCanvas, 0, 0, width, height, blurRadius || 10);
  }
  
  const maskData = maskCtx.getImageData(0, 0, width, height);
  const resultData = resultCtx.getImageData(0, 0, width, height);
  
  for (let i = 0; i < maskData.data.length; i += 4) {
    const alpha = maskData.data[i] / 255; 
    if (alpha > 0) {
      resultData.data[i + 3] = Math.round(alpha * 255);
    } else {
      resultData.data[i + 3] = 0;
    }
  }
  
  resultCtx.putImageData(resultData, 0, 0);
  
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        ...shape,
        processedImage: img,
        processedX: minX,
        processedY: minY,
        processedWidth: width,
        processedHeight: height,
      });
    };
    img.onerror = () => resolve(null);
    img.src = resultCanvas.toDataURL('image/png');
  });
}

// 处理区域模式的马赛克

function processRegionMosaic(shape, sourceCanvas) {
  const { x, y, width, height, renderMode, mosaicSize, blurRadius } = shape;
  
  if (width <= 0 || height <= 0) return null;
  
  // 创建与区域完全相同大小的 canvas
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = width;
  resultCanvas.height = height;
  const resultCtx = resultCanvas.getContext('2d');
  
  resultCtx.drawImage(
    sourceCanvas,
    x, y, width, height,
    0, 0, width, height
  );
  
  if (renderMode === 'mosaic') {
    applyMosaic(resultCanvas, 0, 0, width, height, mosaicSize || 10);
  } else {
    applyBlur(resultCanvas, 0, 0, width, height, blurRadius || 10);
  }
  
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        ...shape,
        processedImage: img,
        processedX: x,
        processedY: y,
        processedWidth: width,
        processedHeight: height,
      });
    };
    img.onerror = () => resolve(null);
    img.src = resultCanvas.toDataURL('image/png');
  });
}

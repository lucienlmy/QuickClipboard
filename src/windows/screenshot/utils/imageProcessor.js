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

export async function processMosaicShape(shape, stageRef, screens, _existingShapes = [], clipBounds = null) {
  if (!stageRef?.current || !screens?.length) {
    return null;
  }
  
  const stage = stageRef.current;
  
  const hasPhysicalSize = clipBounds?.physicalWidth && clipBounds?.physicalHeight;
  const canvasWidth = hasPhysicalSize ? clipBounds.physicalWidth : (clipBounds ? Math.round(clipBounds.width) : stage.width());
  const canvasHeight = hasPhysicalSize ? clipBounds.physicalHeight : (clipBounds ? Math.round(clipBounds.height) : stage.height());
  const cssWidth = clipBounds ? clipBounds.width : stage.width();
  const cssHeight = clipBounds ? clipBounds.height : stage.height();
  const offsetX = clipBounds ? clipBounds.x : 0;
  const offsetY = clipBounds ? clipBounds.y : 0;
  
  const scaleX = canvasWidth / cssWidth;
  const scaleY = canvasHeight / cssHeight;
  
  try {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasWidth;
    tempCanvas.height = canvasHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // 绘制背景
    if (clipBounds && screens[0]?.image) {
      tempCtx.drawImage(screens[0].image, 0, 0, canvasWidth, canvasHeight);
    } else {
      drawBackgroundFromScreens(tempCtx, screens, { 
        x: offsetX, 
        y: offsetY, 
        width: canvasWidth, 
        height: canvasHeight 
      });
    }
    
    // 如果是全局模式，使用 Stage 的完整渲染（包括背景 + 所有编辑层内容）
    if (shape.coverageMode === 'global') {
      try {
        const overlayLayer = stage.findOne('#screenshot-overlay-layer');
        const uiLayer = stage.findOne('#screenshot-ui-layer');
        const overlayVisible = overlayLayer?.visible();
        const uiVisible = uiLayer?.visible();
        
        if (overlayLayer) overlayLayer.visible(false);
        if (uiLayer) uiLayer.visible(false);
        
        const dpr = window.devicePixelRatio || 1;
        const stageCanvas = stage.toCanvas({ pixelRatio: dpr });
        
        if (overlayLayer && overlayVisible !== undefined) overlayLayer.visible(overlayVisible);
        if (uiLayer && uiVisible !== undefined) uiLayer.visible(uiVisible);
        
        if (clipBounds) {
          const srcX = offsetX * dpr;
          const srcY = offsetY * dpr;
          const srcW = cssWidth * dpr;
          const srcH = cssHeight * dpr;
          
          tempCtx.drawImage(stageCanvas, srcX, srcY, srcW, srcH, 0, 0, canvasWidth, canvasHeight);
        } else {
          tempCtx.drawImage(stageCanvas, 0, 0, stageCanvas.width, stageCanvas.height, 0, 0, canvasWidth, canvasHeight);
        }
        
      } catch (error) {
        console.error('[全局模式] Stage 渲染失败:', error);
      }
    }
    
    //根据绘画模式处理
    if (shape.drawMode === 'brush') {
      // 画笔模式：创建遮罩并处理路径区域
      return processBrushMosaic(shape, tempCanvas, offsetX, offsetY, scaleX, scaleY);
    } else if (shape.drawMode === 'region') {
      // 区域模式：直接处理矩形区域
      return processRegionMosaic(shape, tempCanvas, offsetX, offsetY, scaleX, scaleY);
    }
  } catch (error) {
    console.error('处理马赛克失败:', error);
    return null;
  }
  
  return null;
}

// 处理画笔模式的马赛克

function processBrushMosaic(shape, sourceCanvas, canvasOffsetX = 0, canvasOffsetY = 0, scaleX = 1, scaleY = 1) {
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
  
  const physicalWidth = Math.round(width * scaleX);
  const physicalHeight = Math.round(height * scaleY);
  const avgScale = (scaleX + scaleY) / 2;
  const physicalBrushSize = brushSize * avgScale;
  
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = physicalWidth;
  maskCanvas.height = physicalHeight;
  const maskCtx = maskCanvas.getContext('2d');
  
  maskCtx.fillStyle = 'white';
  maskCtx.strokeStyle = 'white';
  maskCtx.lineWidth = physicalBrushSize;
  maskCtx.lineCap = 'round';
  maskCtx.lineJoin = 'round';
  
  maskCtx.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const x = (points[i] - minX) * scaleX;
    const y = (points[i + 1] - minY) * scaleY;
    if (i === 0) {
      maskCtx.moveTo(x, y);
    } else {
      maskCtx.lineTo(x, y);
    }
  }
  maskCtx.stroke();
  
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = physicalWidth;
  resultCanvas.height = physicalHeight;
  const resultCtx = resultCanvas.getContext('2d');
  
  const srcX = Math.round((minX - canvasOffsetX) * scaleX);
  const srcY = Math.round((minY - canvasOffsetY) * scaleY);
  
  resultCtx.drawImage(
    sourceCanvas,
    srcX, srcY, physicalWidth, physicalHeight,
    0, 0, physicalWidth, physicalHeight
  );
  
  if (renderMode === 'mosaic') {
    const effectiveMosaicSize = Math.max(1, Math.round((mosaicSize || 10) * avgScale));
    applyMosaic(resultCanvas, 0, 0, physicalWidth, physicalHeight, effectiveMosaicSize);
  } else {
    const effectiveBlurRadius = Math.max(1, Math.round((blurRadius || 10) * avgScale));
    applyBlur(resultCanvas, 0, 0, physicalWidth, physicalHeight, effectiveBlurRadius);
  }
  
  const maskData = maskCtx.getImageData(0, 0, physicalWidth, physicalHeight);
  const resultData = resultCtx.getImageData(0, 0, physicalWidth, physicalHeight);
  
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
function processRegionMosaic(shape, sourceCanvas, canvasOffsetX = 0, canvasOffsetY = 0, scaleX = 1, scaleY = 1) {
  const { x, y, width, height, renderMode, mosaicSize, blurRadius } = shape;
  
  if (width <= 0 || height <= 0) return null;
  
  const physicalWidth = Math.round(width * scaleX);
  const physicalHeight = Math.round(height * scaleY);
  
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = physicalWidth;
  resultCanvas.height = physicalHeight;
  const resultCtx = resultCanvas.getContext('2d');
  
  const srcX = Math.round((x - canvasOffsetX) * scaleX);
  const srcY = Math.round((y - canvasOffsetY) * scaleY);
  
  resultCtx.drawImage(
    sourceCanvas,
    srcX, srcY, physicalWidth, physicalHeight,
    0, 0, physicalWidth, physicalHeight
  );
  
  const avgScale = (scaleX + scaleY) / 2;
  if (renderMode === 'mosaic') {
    const effectiveMosaicSize = Math.max(1, Math.round((mosaicSize || 10) * avgScale));
    applyMosaic(resultCanvas, 0, 0, physicalWidth, physicalHeight, effectiveMosaicSize);
  } else {
    const effectiveBlurRadius = Math.max(1, Math.round((blurRadius || 10) * avgScale));
    applyBlur(resultCanvas, 0, 0, physicalWidth, physicalHeight, effectiveBlurRadius);
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

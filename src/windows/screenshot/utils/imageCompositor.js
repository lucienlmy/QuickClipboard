// 图像合成工具

// 计算选区与各屏幕的交集区域
function calculateSelectionRegions(selection, screens) {
  const { x, y, width, height } = selection;
  const selX2 = x + width;
  const selY2 = y + height;
  
  const regions = [];
  
  for (const screen of screens) {
    if (!screen.image) continue;
    
    const screenX2 = screen.x + screen.width;
    const screenY2 = screen.y + screen.height;
    
    // 检查是否有交集
    if (x >= screenX2 || selX2 <= screen.x || y >= screenY2 || selY2 <= screen.y) {
      continue;
    }
    
    // 计算CSS坐标交集
    const intersectX = Math.max(x, screen.x);
    const intersectY = Math.max(y, screen.y);
    const intersectX2 = Math.min(selX2, screenX2);
    const intersectY2 = Math.min(selY2, screenY2);
    
    const scaleX = screen.physicalWidth / screen.width;
    const scaleY = screen.physicalHeight / screen.height;
    
    const relativeX = intersectX - screen.x;
    const relativeY = intersectY - screen.y;
    const relativeWidth = intersectX2 - intersectX;
    const relativeHeight = intersectY2 - intersectY;
    
    const srcPhysicalX = Math.round(relativeX * scaleX);
    const srcPhysicalY = Math.round(relativeY * scaleY);
    const srcPhysicalWidth = Math.round(relativeWidth * scaleX);
    const srcPhysicalHeight = Math.round(relativeHeight * scaleY);
    
    const globalPhysicalX = screen.physicalX + srcPhysicalX;
    const globalPhysicalY = screen.physicalY + srcPhysicalY;
    
    regions.push({
      screen,
      srcX: srcPhysicalX,
      srcY: srcPhysicalY,
      srcWidth: srcPhysicalWidth,
      srcHeight: srcPhysicalHeight,
      globalPhysicalX,
      globalPhysicalY,
      cssX: intersectX,
      cssY: intersectY,
      scaleX,
      scaleY,
    });
  }
  
  if (regions.length === 0) {
    return { regions: [], totalPhysicalWidth: 0, totalPhysicalHeight: 0, physicalOffsetX: 0, physicalOffsetY: 0 };
  }
  
  const minPhysicalX = Math.min(...regions.map(r => r.globalPhysicalX));
  const minPhysicalY = Math.min(...regions.map(r => r.globalPhysicalY));
  const maxPhysicalX = Math.max(...regions.map(r => r.globalPhysicalX + r.srcWidth));
  const maxPhysicalY = Math.max(...regions.map(r => r.globalPhysicalY + r.srcHeight));
  
  const totalPhysicalWidth = maxPhysicalX - minPhysicalX;
  const totalPhysicalHeight = maxPhysicalY - minPhysicalY;
  
  for (const region of regions) {
    region.destX = region.globalPhysicalX - minPhysicalX;
    region.destY = region.globalPhysicalY - minPhysicalY;
  }
  
  return {
    regions,
    totalPhysicalWidth,
    totalPhysicalHeight,
    physicalOffsetX: minPhysicalX,
    physicalOffsetY: minPhysicalY,
  };
}

function drawRegionsToCanvas(ctx, regions) {
  for (const { screen, srcX, srcY, srcWidth, srcHeight, destX, destY } of regions) {
    ctx.drawImage(screen.image, srcX, srcY, srcWidth, srcHeight, destX, destY, srcWidth, srcHeight);
  }
}

export function drawBackgroundFromScreens(ctx, screens, rect) {
  if (!screens || screens.length === 0) return;
  
  const { x, y, width, height } = rect;
  
  for (const screen of screens) {
    if (!screen.image) continue;
    
    const screenX2 = screen.x + screen.width;
    const screenY2 = screen.y + screen.height;

    if (x >= screenX2 || x + width <= screen.x || y >= screenY2 || y + height <= screen.y) {
      continue;
    }

    const intersectX = Math.max(x, screen.x);
    const intersectY = Math.max(y, screen.y);
    const intersectX2 = Math.min(x + width, screenX2);
    const intersectY2 = Math.min(y + height, screenY2);

    const scaleX = screen.physicalWidth / screen.width;
    const scaleY = screen.physicalHeight / screen.height;

    const srcX = Math.round((intersectX - screen.x) * scaleX);
    const srcY = Math.round((intersectY - screen.y) * scaleY);
    const srcW = Math.round((intersectX2 - intersectX) * scaleX);
    const srcH = Math.round((intersectY2 - intersectY) * scaleY);

    const destX = intersectX - x;
    const destY = intersectY - y;
    const destW = intersectX2 - intersectX;
    const destH = intersectY2 - intersectY;

    ctx.drawImage(screen.image, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
  }
}

const DEFAULT_EXCLUDED_LAYER_IDS = new Set([
  'screenshot-overlay-layer',
  'screenshot-ui-layer',
]);

function drawStageLayers(ctx, stage, rect, pixelRatio, options = {}) {
  const { excludeLayerIds = DEFAULT_EXCLUDED_LAYER_IDS, targetWidth, targetHeight } = options;

  const transformers = stage.find?.('Transformer') || [];
  const selectionHandles = stage.find?.('.selection-handle') || [];
  const hiddenNodes = [...transformers, ...selectionHandles];
  const nodeStates = hiddenNodes.map(node => ({ node, visible: node.visible() }));
  hiddenNodes.forEach(node => node.visible(false));

  try {
    const layers = stage.getChildren?.() || [];
    layers.forEach((layer) => {
      if (!layer?.visible?.()) return;
      const layerId = layer.id?.();
      if (layerId && excludeLayerIds.has(layerId)) return;

      if (typeof layer.toCanvas !== 'function') return;

      const layerCanvas = layer.toCanvas({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        pixelRatio,
      });

      if (layerCanvas) {
        if (targetWidth && targetHeight) {
          ctx.drawImage(layerCanvas, 0, 0, targetWidth, targetHeight);
        } else {
          ctx.drawImage(layerCanvas, 0, 0);
        }
      }
    });
  } finally {
    nodeStates.forEach(({ node, visible }) => node.visible(visible));
  }
}

export async function compositeSelectionImage({ stage, selection, screens, pixelRatio }) {
  const { x, y, width, height } = selection;
  const { regions, totalPhysicalWidth, totalPhysicalHeight, physicalOffsetX, physicalOffsetY } = 
    calculateSelectionRegions(selection, screens);
  
  if (regions.length === 0 || totalPhysicalWidth === 0) {
    const pr = pixelRatio ?? stage.pixelRatio?.() ?? window.devicePixelRatio ?? 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * pr));
    canvas.height = Math.max(1, Math.round(height * pr));
    return canvas;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = totalPhysicalWidth;
  canvas.height = totalPhysicalHeight;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  drawRegionsToCanvas(ctx, regions);

  const primaryScaleFactor = regions[0]?.screen?.scaleFactor || window.devicePixelRatio || 1;
  drawStageLayers(ctx, stage, { x, y, width, height }, primaryScaleFactor, { 
    targetWidth: totalPhysicalWidth,
    targetHeight: totalPhysicalHeight,
  });

  canvas._physicalOffsetX = physicalOffsetX;
  canvas._physicalOffsetY = physicalOffsetY;

  return canvas;
}

export async function compositeSelectionToBlob(options) {
  const canvas = await compositeSelectionImage(options);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
}

export async function compositeSelectionToDataURL(options) {
  const canvas = await compositeSelectionImage(options);
  return canvas.toDataURL('image/png');
}

export function getBackgroundRegion(screens, rect, pixelRatio = 1) {
  const { width, height } = rect;
  const { regions, totalPhysicalWidth, totalPhysicalHeight, physicalOffsetX, physicalOffsetY } =
    calculateSelectionRegions(rect, screens);

  if (regions.length === 0 || totalPhysicalWidth === 0) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width)) * pixelRatio;
    canvas.height = Math.max(1, Math.round(height)) * pixelRatio;
    return canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = totalPhysicalWidth;
  canvas.height = totalPhysicalHeight;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawRegionsToCanvas(ctx, regions);

  canvas._physicalOffsetX = physicalOffsetX;
  canvas._physicalOffsetY = physicalOffsetY;

  return canvas;
}

// 贴图编辑模式使用
export function compositePinEditImage({ stage, selection, originalImage }) {
  if (!stage || !selection || !originalImage) return null;

  const physicalWidth = originalImage.naturalWidth;
  const physicalHeight = originalImage.naturalHeight;

  const pixelRatio = physicalWidth / selection.width;
  
  const canvas = document.createElement('canvas');
  canvas.width = physicalWidth;
  canvas.height = physicalHeight;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.drawImage(originalImage, 0, 0, physicalWidth, physicalHeight);

  const editingLayer = stage.findOne?.('#screenshot-editing-layer');
  if (editingLayer && editingLayer.visible()) {
    const transformers = stage.find?.('Transformer') || [];
    const selectionHandles = stage.find?.('.selection-handle') || [];
    const hiddenNodes = [...transformers, ...selectionHandles];
    const nodeStates = hiddenNodes.map(node => ({ node, visible: node.visible() }));
    hiddenNodes.forEach(node => node.visible(false));
    
    try {
      const layerCanvas = editingLayer.toCanvas({
        x: selection.x,
        y: selection.y,
        width: selection.width,
        height: selection.height,
        pixelRatio,
      });
      
      if (layerCanvas) {
        ctx.drawImage(layerCanvas, 0, 0);
      }
    } finally {
      nodeStates.forEach(({ node, visible }) => node.visible(visible));
    }
  }
  
  return canvas;
}

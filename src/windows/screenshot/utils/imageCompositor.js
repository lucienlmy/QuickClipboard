// 图像合成工具
export function drawBackgroundFromScreens(ctx, screens, rect, pixelRatio = 1) {
  if (!screens || screens.length === 0) return;

  const { x: safeX, y: safeY, width: safeWidth, height: safeHeight } = rect;

  for (const screen of screens) {
    if (!screen.image) continue;
    
    const screenX2 = screen.x + screen.width;
    const screenY2 = screen.y + screen.height;
    const selX2 = safeX + safeWidth;
    const selY2 = safeY + safeHeight;
    
    if (safeX >= screenX2 || selX2 <= screen.x || safeY >= screenY2 || selY2 <= screen.y) {
      continue;
    }
    
    const intersectX = Math.max(safeX, screen.x);
    const intersectY = Math.max(safeY, screen.y);
    const intersectX2 = Math.min(selX2, screenX2);
    const intersectY2 = Math.min(selY2, screenY2);
    
    const imgWidth = screen.image.naturalWidth || screen.image.width;
    const imgHeight = screen.image.naturalHeight || screen.image.height;
    const scaleX = imgWidth / screen.width;
    const scaleY = imgHeight / screen.height;
    
    const srcX = Math.floor((intersectX - screen.x) * scaleX);
    const srcY = Math.floor((intersectY - screen.y) * scaleY);
    const srcW = Math.floor((intersectX2 - intersectX) * scaleX);
    const srcH = Math.floor((intersectY2 - intersectY) * scaleY);
    
    const destX = Math.floor((intersectX - safeX) * pixelRatio);
    const destY = Math.floor((intersectY - safeY) * pixelRatio);
    const destW = Math.floor((intersectX2 - intersectX) * pixelRatio);
    const destH = Math.floor((intersectY2 - intersectY) * pixelRatio);
    
    ctx.drawImage(
      screen.image,
      srcX, srcY, srcW, srcH,
      destX, destY, destW, destH
    );
  }
}

const DEFAULT_EXCLUDED_LAYER_IDS = new Set([
  'screenshot-overlay-layer',
  'screenshot-ui-layer',
]);

function drawStageLayers(ctx, stage, rect, pixelRatio, options = {}) {
  const { excludeLayerIds = DEFAULT_EXCLUDED_LAYER_IDS } = options;

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
        ctx.drawImage(layerCanvas, 0, 0);
      }
    });
  } finally {
    nodeStates.forEach(({ node, visible }) => node.visible(visible));
  }
}

export async function compositeSelectionImage({ stage, selection, screens, pixelRatio }) {
  const { x, y, width, height } = selection;
  const x1 = Math.round(x);
  const y1 = Math.round(y);
  const x2 = Math.round(x + width);
  const y2 = Math.round(y + height);

  const safeX = x1;
  const safeY = y1;
  const safeWidth = Math.max(1, x2 - x1);
  const safeHeight = Math.max(1, y2 - y1);

  const stagePixelRatio = pixelRatio ?? stage.pixelRatio?.() ?? window.devicePixelRatio ?? 1;
  const exportWidth = safeWidth * stagePixelRatio;
  const exportHeight = safeHeight * stagePixelRatio;

  const canvas = document.createElement('canvas');
  canvas.width = exportWidth;
  canvas.height = exportHeight;
  const ctx = canvas.getContext('2d');
  
  ctx.imageSmoothingEnabled = false;

  drawBackgroundFromScreens(ctx, screens, { x: safeX, y: safeY, width: safeWidth, height: safeHeight }, stagePixelRatio);

  drawStageLayers(
    ctx,
    stage,
    { x: safeX, y: safeY, width: safeWidth, height: safeHeight },
    stagePixelRatio,
  );

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
  const { x, y, width, height } = rect;
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  
  const canvas = document.createElement('canvas');
  canvas.width = safeWidth * pixelRatio;
  canvas.height = safeHeight * pixelRatio;
  const ctx = canvas.getContext('2d');
  
  ctx.imageSmoothingEnabled = false;
  
  drawBackgroundFromScreens(ctx, screens, { 
    x: Math.round(x), 
    y: Math.round(y), 
    width: safeWidth, 
    height: safeHeight 
  }, pixelRatio);
  
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

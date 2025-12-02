import { invoke } from '@tauri-apps/api/core';

export async function recognizeSelectionOcr(stageRef, selection) {
  if (!selection || !stageRef || !stageRef.current) {
    throw new Error('无效的选区或舞台引用');
  }

  const stage = stageRef.current.getStage ? stageRef.current.getStage() : stageRef.current;
  if (!stage || typeof stage.toDataURL !== 'function') {
    throw new Error('无法获取舞台对象');
  }

  const { x, y, width, height } = selection;
  const x1 = Math.round(x);
  const y1 = Math.round(y);
  const x2 = Math.round(x + width);
  const y2 = Math.round(y + height);

  const safeX = x1;
  const safeY = y1;
  const safeWidth = Math.max(1, x2 - x1);
  const safeHeight = Math.max(1, y2 - y1);

  // 隐藏UI层
  const overlayLayer = stage.findOne('#screenshot-overlay-layer');
  const uiLayer = stage.findOne('#screenshot-ui-layer');

  const overlayVisible = overlayLayer?.visible();
  const uiVisible = uiLayer?.visible();
  
  if (overlayLayer) overlayLayer.visible(false);
  if (uiLayer) uiLayer.visible(false);

  let stagePixelRatio;
  let imageData;
  
  try {
    stagePixelRatio = stage.pixelRatio?.() || window.devicePixelRatio || 1;
    
    const dataURL = stage.toDataURL({
      x: safeX,
      y: safeY,
      width: safeWidth,
      height: safeHeight,
      pixelRatio: stagePixelRatio,
    });
    
    const base64Data = dataURL.split(',')[1];
    imageData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  } finally {
    if (overlayLayer && overlayVisible !== undefined) overlayLayer.visible(overlayVisible);
    if (uiLayer && uiVisible !== undefined) uiLayer.visible(uiVisible);
  }

  // 调用后端OCR识别
  const result = await invoke('recognize_image_ocr', { 
    imageData: Array.from(imageData)
  });

  // 将物理像素坐标转换为逻辑像素坐标
  const convertedResult = {
    text: result.text,
    lines: result.lines.map(line => ({
      text: line.text,
      x: line.x / stagePixelRatio,
      y: line.y / stagePixelRatio,
      width: line.width / stagePixelRatio,
      height: line.height / stagePixelRatio,
      words: line.words.map(word => ({
        text: word.text,
        x: word.x / stagePixelRatio,
        y: word.y / stagePixelRatio,
        width: word.width / stagePixelRatio,
        height: word.height / stagePixelRatio,
      })),
      word_gaps: line.word_gaps.map(gap => gap / stagePixelRatio),
    }))
  };

  return convertedResult;
}

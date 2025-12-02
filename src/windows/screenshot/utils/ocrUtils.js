import { invoke } from '@tauri-apps/api/core';
import { compositeSelectionImage } from './imageCompositor';

export async function recognizeSelectionOcr(stageRef, selection, { screens = [] } = {}) {
  if (!selection || !stageRef || !stageRef.current) {
    throw new Error('无法获取 Konva Stage 实例');
  }

  const stage = stageRef.current.getStage ? stageRef.current.getStage() : stageRef.current;
  if (!stage || typeof stage.toDataURL !== 'function') {
    throw new Error('Konva Stage 或选区无效');
  }

  const stagePixelRatio = stage.pixelRatio?.() || window.devicePixelRatio || 1;

  const canvas = await compositeSelectionImage({ stage, selection, screens });
  const dataURL = canvas.toDataURL('image/png');
  const base64Data = dataURL.split(',')[1];
  const imageData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

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

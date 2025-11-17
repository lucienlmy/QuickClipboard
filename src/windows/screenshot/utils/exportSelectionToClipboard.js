import { cancelScreenshotSession } from '@shared/api/system';

export async function exportSelectionToClipboard(stageRef, selection) {
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

  if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
    console.error('当前环境不支持图片剪贴板写入');
    return;
  }

  const response = await fetch(dataURL);
  const blob = await response.blob();
  if (!blob) return;

  const item = new window.ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);

  await cancelScreenshotSession();
}

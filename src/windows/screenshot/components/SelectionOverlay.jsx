import { useState } from 'react';
import { Layer, Rect } from 'react-konva';
import { cancelScreenshotSession } from '@shared/api/system';

function SelectionOverlay({ stageWidth, stageHeight }) {
  const stageW = stageWidth;
  const stageH = stageHeight;
  if (stageW <= 0 || stageH <= 0) return null;

  const [selection, setSelection] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [moveOffset, setMoveOffset] = useState(null);

  const overlayColor = 'black';
  const overlayOpacity = 0.4;
  const cornerRadius = 0;

  const handleMouseDown = (e) => {
    const button = e.evt?.button;
    if (button !== undefined && button !== 0) {
      return;
    }

    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    // 如果已有选区且点击在选区内，则进入移动模式
    if (selection) {
      const inside =
        pos.x >= selection.x &&
        pos.x <= selection.x + selection.width &&
        pos.y >= selection.y &&
        pos.y <= selection.y + selection.height;

      if (inside) {
        setIsMoving(true);
        setIsDrawing(false);
        setMoveOffset({ dx: pos.x - selection.x, dy: pos.y - selection.y });
        return;
      }
    }

    // 否则开始绘制新的选区
    setIsDrawing(true);
    setIsMoving(false);
    setStartPos(pos);
    setSelection({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    // 移动已有选区
    if (isMoving && selection && moveOffset) {
      const x = pos.x - moveOffset.dx;
      const y = pos.y - moveOffset.dy;
      setSelection((prev) => (prev ? { ...prev, x, y } : prev));
      return;
    }

    // 绘制新选区
    if (!isDrawing || !startPos) return;

    const x = Math.min(startPos.x, pos.x);
    const y = Math.min(startPos.y, pos.y);
    const width = Math.abs(pos.x - startPos.x);
    const height = Math.abs(pos.y - startPos.y);

    setSelection({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isDrawing && !isMoving) return;
    setIsDrawing(false);
    setIsMoving(false);
  };

  const handleContextMenu = async (e) => {
    e.evt?.preventDefault?.();

    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    setIsDrawing(false);
    setIsMoving(false);

    if (selection) {
      const inside =
        pos.x >= selection.x &&
        pos.x <= selection.x + selection.width &&
        pos.y >= selection.y &&
        pos.y <= selection.y + selection.height;

      if (!inside) {
        setSelection(null);
      }
      return;
    }

    try {
      await cancelScreenshotSession();
    } catch (err) {
      console.error('取消截屏会话失败:', err);
    }
  };

  const hasSelection = selection && selection.width > 0 && selection.height > 0;

  return (
    <Layer>
      {/* 半透明遮罩 */}
      <Rect
        x={0}
        y={0}
        width={stageW}
        height={stageH}
        fill={overlayColor}
        opacity={overlayOpacity}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />
      {hasSelection && (
        <>
          {/* 遮罩上镂空矩形选区 */}
          <Rect
            x={selection.x}
            y={selection.y}
            width={selection.width}
            height={selection.height}
            cornerRadius={cornerRadius}
            fill={overlayColor}
            globalCompositeOperation="destination-out"
            listening={false}
          />
          {/* 选区边框 */}
          <Rect
            x={selection.x}
            y={selection.y}
            width={selection.width}
            height={selection.height}
            cornerRadius={cornerRadius}
            stroke="deepskyblue"
            strokeWidth={2}
            listening={false}
          />
        </>
      )}
    </Layer>
  );
}

export default SelectionOverlay;

import { useState, useEffect } from 'react';
import { Layer, Rect, Circle } from 'react-konva';
import { cancelScreenshotSession } from '@shared/api/system';
import SelectionInfoBar from './SelectionInfoBar';
import SelectionToolbar from './SelectionToolbar';
import { exportSelectionToClipboard } from '../utils/exportSelectionToClipboard';
import { exportSelectionToPin } from '../utils/exportSelectionToPin';
import { ensureAutoSelectionStarted, subscribe as subscribeAutoSelection } from '../utils/autoSelectionManager';

function SelectionOverlay({ stageWidth, stageHeight, stageRef }) {
  const stageW = stageWidth;
  const stageH = stageHeight;
  if (stageW <= 0 || stageH <= 0) return null;

  const [selection, setSelection] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [startPos, setStartPos] = useState(null);
  const [moveOffset, setMoveOffset] = useState(null);
  const [initialSelection, setInitialSelection] = useState(null);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [isAdjustingRadius, setIsAdjustingRadius] = useState(false);
  const [initialRadius, setInitialRadius] = useState(0);
  const [radiusHandleType, setRadiusHandleType] = useState(null);
  const [aspectRatio, setAspectRatio] = useState('free');
  const [autoSelectionRect, setAutoSelectionRect] = useState(null);

  const overlayColor = 'black';
  const overlayOpacity = 0.4;
  const handleSize = 4;
  const radiusHandleSize = 3;
  const handleColor = 'deepskyblue';
  const handleStrokeColor = 'white';
  const handleStrokeWidth = 1;
  const radiusHandleColor = 'orange';
  const radiusHandleOffset = 12;

  useEffect(() => {
    let unsub = null;
    (async () => {
      await ensureAutoSelectionStarted();
      unsub = subscribeAutoSelection((hier) => {
        if (selection || isDrawing || isMoving || isResizing || isAdjustingRadius) {
          return;
        }

        if (!hier || !Array.isArray(hier.hierarchy) || hier.hierarchy.length === 0) {
          setAutoSelectionRect(null);
          return;
        }

        const b = hier.hierarchy[0];
        if (!b || b.width <= 0 || b.height <= 0) {
          setAutoSelectionRect(null);
          return;
        }

        setAutoSelectionRect({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        });
      });
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [selection, isDrawing, isMoving, isResizing, isAdjustingRadius]);

  const checkHandleHit = (pos) => {
    if (!selection) return null;
    
    const handles = getHandlePositions();
    const hitRadius = handleSize + 4;
    
    for (const handle of handles) {
      const dx = pos.x - handle.x;
      const dy = pos.y - handle.y;
      if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
        return handle.type;
      }
    }
    return null;
  };

  const handleMouseDown = (e) => {
    const button = e.evt?.button;
    if (button !== undefined && button !== 0) {
      return;
    }

    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    if (!selection && autoSelectionRect && autoSelectionRect.width > 0 && autoSelectionRect.height > 0) {
      setSelection({
        x: autoSelectionRect.x,
        y: autoSelectionRect.y,
        width: autoSelectionRect.width,
        height: autoSelectionRect.height,
      });
      setAutoSelectionRect(null);
      return;
    }

    if (selection) {
      const handleType = checkHandleHit(pos);
      if (handleType) {
        if (handleType.startsWith('radius-')) {
          setIsAdjustingRadius(true);
          setRadiusHandleType(handleType);
          setStartPos(pos);
          setInitialRadius(cornerRadius);
          return;
        }
        
        setIsResizing(true);
        setResizeHandle(handleType);
        setStartPos(pos);
        setInitialSelection({ ...selection });
        return;
      }

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

    if (!isDrawing && !isMoving && !isResizing && !isAdjustingRadius && selection) {
      const handleType = checkHandleHit(pos);
      if (handleType) {
        if (handleType.startsWith('radius-')) {
          stage.container().style.cursor = 'pointer';
        } else {
          const cursorMap = {
            'nw': 'nwse-resize',
            'n': 'ns-resize',
            'ne': 'nesw-resize',
            'e': 'ew-resize',
            'se': 'nwse-resize',
            's': 'ns-resize',
            'sw': 'nesw-resize',
            'w': 'ew-resize',
          };
          stage.container().style.cursor = cursorMap[handleType] || 'default';
        }
      } else {
        const inside =
          pos.x >= selection.x &&
          pos.x <= selection.x + selection.width &&
          pos.y >= selection.y &&
          pos.y <= selection.y + selection.height;
        stage.container().style.cursor = inside ? 'move' : 'crosshair';
      }
    } else if (!isDrawing && !isMoving && !isResizing && !isAdjustingRadius) {
      stage.container().style.cursor = 'crosshair';
    }

    if (isAdjustingRadius && startPos && radiusHandleType) {
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      
      let delta = 0;
      switch (radiusHandleType) {
        case 'radius-nw': // 左上：往右下为正
          delta = dx + dy;
          break;
        case 'radius-ne': // 右上：往左下为正
          delta = -dx + dy;
          break;
        case 'radius-se': // 右下：往左上为正
          delta = -dx - dy;
          break;
        case 'radius-sw': // 左下：往右上为正
          delta = dx - dy;
          break;
      }
      
      let newRadius = initialRadius + delta * 0.3;
      
      const maxRadius = selection ? Math.min(selection.width, selection.height) / 2 : 0;
      newRadius = Math.max(0, Math.min(newRadius, maxRadius));
      setCornerRadius(newRadius);
      return;
    }

    if (isResizing && resizeHandle && startPos && initialSelection) {
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      let newSelection = { ...initialSelection };

      switch (resizeHandle) {
        case 'nw': 
          newSelection.x = initialSelection.x + dx;
          newSelection.y = initialSelection.y + dy;
          newSelection.width = initialSelection.width - dx;
          newSelection.height = initialSelection.height - dy;
          break;
        case 'n': 
          newSelection.y = initialSelection.y + dy;
          newSelection.height = initialSelection.height - dy;
          break;
        case 'ne':
          newSelection.y = initialSelection.y + dy;
          newSelection.width = initialSelection.width + dx;
          newSelection.height = initialSelection.height - dy;
          break;
        case 'e':
          newSelection.width = initialSelection.width + dx;
          break;
        case 'se':
          newSelection.width = initialSelection.width + dx;
          newSelection.height = initialSelection.height + dy;
          break;
        case 's':
          newSelection.height = initialSelection.height + dy;
          break;
        case 'sw': 
          newSelection.x = initialSelection.x + dx;
          newSelection.width = initialSelection.width - dx;
          newSelection.height = initialSelection.height + dy;
          break;
        case 'w':
          newSelection.x = initialSelection.x + dx;
          newSelection.width = initialSelection.width - dx;
          break;
      }

      if (newSelection.width < 0) {
        newSelection.x += newSelection.width;
        newSelection.width = Math.abs(newSelection.width);
      }
      if (newSelection.height < 0) {
        newSelection.y += newSelection.height;
        newSelection.height = Math.abs(newSelection.height);
      }

      setSelection(newSelection);
      return;
    }

    if (isMoving && selection && moveOffset) {
      const x = pos.x - moveOffset.dx;
      const y = pos.y - moveOffset.dy;
      setSelection((prev) => (prev ? { ...prev, x, y } : prev));
      return;
    }

    if (!isDrawing || !startPos) return;

    const x = Math.min(startPos.x, pos.x);
    const y = Math.min(startPos.y, pos.y);
    const width = Math.abs(pos.x - startPos.x);
    const height = Math.abs(pos.y - startPos.y);

    setSelection({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isDrawing && !isMoving && !isResizing && !isAdjustingRadius) return;
    setIsDrawing(false);
    setIsMoving(false);
    setIsResizing(false);
    setResizeHandle(null);
    setIsAdjustingRadius(false);
    setRadiusHandleType(null);
  };

  const handleContextMenu = async (e) => {
    e.evt?.preventDefault?.();

    setIsDrawing(false);
    setIsMoving(false);
    setIsResizing(false);
    setResizeHandle(null);
    setIsAdjustingRadius(false);
    setRadiusHandleType(null);

    if (selection) {
      setSelection(null);
      setCornerRadius(0);
      setAspectRatio('free');
      return;
    }

    try {
      await cancelScreenshotSession();
    } catch (err) {
      console.error('取消截屏会话失败:', err);
    }
  };

  const getHandlePositions = () => {
    if (!selection) return [];
    
    const { x, y, width, height } = selection;
    const handles = [
      { type: 'nw', x: x, y: y }, 
      { type: 'n', x: x + width / 2, y: y }, 
      { type: 'ne', x: x + width, y: y },
      { type: 'e', x: x + width, y: y + height / 2 },
      { type: 'se', x: x + width, y: y + height },
      { type: 's', x: x + width / 2, y: y + height }, 
      { type: 'sw', x: x, y: y + height }, 
      { type: 'w', x: x, y: y + height / 2 }, 
    ];
    
    const radiusHandles = [
      { type: 'radius-nw', x: x + radiusHandleOffset, y: y + radiusHandleOffset },
      { type: 'radius-ne', x: x + width - radiusHandleOffset, y: y + radiusHandleOffset },
      { type: 'radius-se', x: x + width - radiusHandleOffset, y: y + height - radiusHandleOffset },
      { type: 'radius-sw', x: x + radiusHandleOffset, y: y + height - radiusHandleOffset },
    ];
    
    return [...handles, ...radiusHandles];
  };

  const handleAspectRatioChange = (value) => {
    setAspectRatio(value);
    
    if (value !== 'free' && selection) {
      const ratio = parseFloat(value);
      if (!isNaN(ratio) && ratio > 0) {
        const newHeight = selection.width / ratio;
        setSelection({ ...selection, height: newHeight });
      }
    }
  };

  const handleCornerRadiusChange = (value) => {
    setCornerRadius(value);
  };

  const hasSelection = selection && selection.width > 0 && selection.height > 0;
  const hasAutoSelection = !hasSelection && autoSelectionRect && autoSelectionRect.width > 0 && autoSelectionRect.height > 0;

  const handleCancelSelection = () => {
    if (!selection) return;
    setSelection(null);
    setCornerRadius(0);
    setAspectRatio('free');
  };

  const handleConfirmSelection = async () => {
    if (!selection) return;
    try {
      await exportSelectionToClipboard(stageRef, selection);
    } catch (err) {
      console.error('复制选区到剪贴板失败:', err);
    }
  };

  const handlePinSelection = async () => {
    if (!selection) return;
    try {
      await exportSelectionToPin(stageRef, selection);
    } catch (err) {
      console.error('创建贴图失败:', err);
    }
  };

  return (
    <Layer>
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
      {hasAutoSelection && (
        <>
          <Rect
            x={autoSelectionRect.x}
            y={autoSelectionRect.y}
            width={autoSelectionRect.width}
            height={autoSelectionRect.height}
            fill={overlayColor}
            globalCompositeOperation="destination-out"
            listening={false}
          />
          <Rect
            x={autoSelectionRect.x}
            y={autoSelectionRect.y}
            width={autoSelectionRect.width}
            height={autoSelectionRect.height}
            stroke="deepskyblue"
            strokeWidth={2}
            listening={false}
          />
        </>
      )}
      {hasSelection && (
        <>
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
          {!isDrawing && !isMoving && getHandlePositions().map((handle) => {
            const isRadiusHandle = handle.type.startsWith('radius-');
            return (
              <Circle
                key={handle.type}
                x={handle.x}
                y={handle.y}
                radius={isRadiusHandle ? radiusHandleSize : handleSize}
                fill={isRadiusHandle ? radiusHandleColor : handleColor}
                stroke={handleStrokeColor}
                strokeWidth={handleStrokeWidth}
                listening={false}
              />
            );
          })}
        </>
      )}
      <SelectionInfoBar
        selection={selection}
        cornerRadius={cornerRadius}
        aspectRatio={aspectRatio}
        isMoving={isMoving}
        onCornerRadiusChange={handleCornerRadiusChange}
        onAspectRatioChange={handleAspectRatioChange}
      />
      <SelectionToolbar
        selection={selection}
        isDrawing={isDrawing}
        isMoving={isMoving}
        isResizing={isResizing}
        onCancel={handleCancelSelection}
        onConfirm={handleConfirmSelection}
        onPin={handlePinSelection}
      />
    </Layer>
  );
}

export default SelectionOverlay;

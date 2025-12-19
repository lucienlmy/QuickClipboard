//选区覆盖层组件

import { Layer, Rect } from 'react-konva';
import SelectionRect from './SelectionRect';
import SelectionHandles from './SelectionHandles';
import AutoSelectionRect from './AutoSelectionRect';
import { useCursorStyle } from '../hooks/useCursorStyle';
import { OVERLAY_COLOR, OVERLAY_OPACITY } from '../constants/selectionConstants';

function SelectionOverlay({ 
  stageWidth, 
  stageHeight, 
  stageRef, 
  selection,
  cornerRadius,
  hasValidSelection,
  isDrawing,
  isMoving,
  isInteracting,
  autoSelectionRect,
  displayAutoSelectionRect,
  hasAutoSelection,
  listening = true,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleRightClick,
  handleWheel,
  activeToolId = null,
  toolStyle = {},
  longScreenshotMode = false,
  pinEditMode = false,
  isHoveringShape = false
}) {
  if (stageWidth <= 0 || stageHeight <= 0) return null;

  // 光标样式管理
  useCursorStyle(stageRef, selection, isInteracting, activeToolId, toolStyle, isHoveringShape);

  return (
    <Layer id="screenshot-overlay-layer" listening={listening}>
      {/* 遮罩层 */}
      {!pinEditMode && (
        <Rect
          x={0}
          y={0}
          width={stageWidth}
          height={stageHeight}
          fill={OVERLAY_COLOR}
          opacity={OVERLAY_OPACITY}
          listening={listening}
          onMouseDown={listening ? handleMouseDown : undefined}
          onMouseMove={listening ? handleMouseMove : undefined}
          onMouseUp={listening ? handleMouseUp : undefined}
          onMouseLeave={listening ? handleMouseUp : undefined}
          onContextMenu={listening ? handleRightClick : undefined}
          onWheel={listening ? handleWheel : undefined}
        />
      )}

      {/* 自动选择矩形 */}
      {hasAutoSelection && !hasValidSelection && !pinEditMode && (
        <AutoSelectionRect rect={displayAutoSelectionRect} />
      )}

      {/* 选区矩形 */}
      {hasValidSelection && <SelectionRect selection={selection} cornerRadius={cornerRadius} />}

      {/* 选区控制手柄 */}
      {hasValidSelection && !longScreenshotMode && (
        <SelectionHandles 
          selection={selection} 
          visible={!isDrawing && !isMoving} 
          pinEditMode={pinEditMode}
        />
      )}

    </Layer>
  );
}

export default SelectionOverlay;

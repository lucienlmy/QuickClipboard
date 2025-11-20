//选区覆盖层组件

import { useCallback, useEffect } from 'react';
import { Layer, Rect } from 'react-konva';
import { cancelScreenshotSession } from '@shared/api/system';
import SelectionRect from './SelectionRect';
import SelectionHandles from './SelectionHandles';
import AutoSelectionRect from './AutoSelectionRect';
import { exportToClipboard, exportToPin, exportToFile } from '../utils/exportUtils';
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
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleRightClick,
  handleWheel
}) {
  if (stageWidth <= 0 || stageHeight <= 0) return null;


  // 光标样式管理
  useCursorStyle(stageRef, selection, isInteracting);



  return (
    <Layer id="screenshot-overlay-layer">
      {/* 遮罩层 */}
      <Rect
        x={0}
        y={0}
        width={stageWidth}
        height={stageHeight}
        fill={OVERLAY_COLOR}
        opacity={OVERLAY_OPACITY}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleRightClick}
        onWheel={handleWheel}
      />

      {/* 自动选择矩形 */}
      {hasAutoSelection && !hasValidSelection && (
        <AutoSelectionRect rect={displayAutoSelectionRect} />
      )}

      {/* 选区矩形 */}
      {hasValidSelection && <SelectionRect selection={selection} cornerRadius={cornerRadius} />}

      {/* 选区控制手柄 */}
      {hasValidSelection && (
        <SelectionHandles selection={selection} visible={!isDrawing && !isMoving} />
      )}

    </Layer>
  );
}

export default SelectionOverlay;

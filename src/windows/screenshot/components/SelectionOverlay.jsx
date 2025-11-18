//选区覆盖层组件

import { useCallback, useEffect } from 'react';
import { Layer, Rect } from 'react-konva';
import { cancelScreenshotSession } from '@shared/api/system';
import SelectionInfoBar from './SelectionInfoBar';
import SelectionToolbar from './SelectionToolbar';
import SelectionRect from './SelectionRect';
import SelectionHandles from './SelectionHandles';
import AutoSelectionRect from './AutoSelectionRect';
import { exportSelectionToClipboard } from '../utils/exportSelectionToClipboard';
import { exportSelectionToPin } from '../utils/exportSelectionToPin';
import { useSelection } from '../hooks/useSelection';
import { useAutoSelection } from '../hooks/useAutoSelection';
import { useSelectionInteraction } from '../hooks/useSelectionInteraction';
import { useCursorStyle } from '../hooks/useCursorStyle';
import { OVERLAY_COLOR, OVERLAY_OPACITY } from '../constants/selectionConstants';

function SelectionOverlay({ stageWidth, stageHeight, stageRef, stageRegionManager, onSelectionChange }) {
  if (stageWidth <= 0 || stageHeight <= 0) return null;

  // 选区状态管理
  const {
    selection,
    cornerRadius,
    aspectRatio,
    hasValidSelection,
    updateSelection,
    clearSelection,
    updateCornerRadius,
    updateAspectRatio,
  } = useSelection();

  useEffect(() => {
    onSelectionChange?.(hasValidSelection);
  }, [hasValidSelection, onSelectionChange]);

  // 选区交互管理
  const {
    isDrawing,
    isMoving,
    isResizing,
    isInteracting,
    handleMouseDown: interactionMouseDown,
    handleMouseMove: interactionMouseMove,
    handleMouseUp: interactionMouseUp,
    resetInteractionState,
  } = useSelectionInteraction(selection, updateSelection, cornerRadius, updateCornerRadius, stageRegionManager);

  // 自动选择管理
  const {
    autoSelectionRect,
    displayAutoSelectionRect,
    hasAutoSelection,
    clearAutoSelection,
    forceRefresh: refreshAutoSelection,
  } = useAutoSelection(isInteracting || hasValidSelection);

  // 光标样式管理
  useCursorStyle(stageRef, selection, isInteracting);

  // 鼠标事件处理
  const handleMouseDown = useCallback(
    (e) => {
      const button = e.evt?.button;
      if (button !== undefined && button !== 0) return;

      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      interactionMouseDown(pos, autoSelectionRect);
    },
    [interactionMouseDown, autoSelectionRect]
  );

  const handleMouseMove = useCallback(
    (e) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;

      interactionMouseMove(pos, autoSelectionRect);
      
      // 如果鼠标移动触发了从自动选择开始绘制，清除自动选择
      if (isDrawing && !selection) {
        clearAutoSelection();
      }
    },
    [interactionMouseMove, autoSelectionRect, isDrawing, selection, clearAutoSelection]
  );

  const handleMouseUp = useCallback(() => {
    const onSelectFromAuto = (rect) => {
      updateSelection({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
      clearAutoSelection();
    };

    interactionMouseUp(autoSelectionRect, onSelectFromAuto);
  }, [interactionMouseUp, autoSelectionRect, updateSelection, clearAutoSelection]);

  // 右键点击处理
  const handleRightClick = useCallback(
    async (e) => {
      e.evt?.preventDefault?.();
      resetInteractionState();

      if (selection) {
        clearSelection();
        refreshAutoSelection();
        return;
      }

      try {
        await cancelScreenshotSession();
      } catch (err) {
        console.error('取消截屏会话失败:', err);
      }
    },
    [selection, clearSelection, resetInteractionState, refreshAutoSelection]
  );

  // 工具栏操作
  const handleCancelSelection = useCallback(() => {
    if (!selection) return;
    clearSelection();
    refreshAutoSelection();
  }, [selection, clearSelection, refreshAutoSelection]);

  const handleConfirmSelection = useCallback(async () => {
    if (!selection) return;
    try {
      await exportSelectionToClipboard(stageRef, selection);
    } catch (err) {
      console.error('复制选区到剪贴板失败:', err);
    }
  }, [selection, stageRef]);

  const handlePinSelection = useCallback(async () => {
    if (!selection) return;
    try {
      await exportSelectionToPin(stageRef, selection);
    } catch (err) {
      console.error('创建贴图失败:', err);
    }
  }, [selection, stageRef]);

  return (
    <Layer>
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

      {/* 信息栏 */}
      <SelectionInfoBar
        selection={selection}
        cornerRadius={cornerRadius}
        aspectRatio={aspectRatio}
        isMoving={isMoving}
        stageRegionManager={stageRegionManager}
        onCornerRadiusChange={updateCornerRadius}
        onAspectRatioChange={updateAspectRatio}
      />

      {/* 工具栏 */}
      <SelectionToolbar
        selection={selection}
        isDrawing={isDrawing}
        isMoving={isMoving}
        isResizing={isResizing}
        stageRegionManager={stageRegionManager}
        onCancel={handleCancelSelection}
        onConfirm={handleConfirmSelection}
        onPin={handlePinSelection}
      />
    </Layer>
  );
}

export default SelectionOverlay;

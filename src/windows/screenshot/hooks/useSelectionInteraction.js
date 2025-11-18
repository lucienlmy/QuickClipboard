//选区交互逻辑

import { useState, useCallback } from 'react';
import { checkHandleHit, isRadiusHandle } from '../utils/handleDetection';
import {
  calculateSelectionFromPoints,
  calculateMovedSelection,
  calculateResizedSelection,
  calculateRadiusDelta,
  calculateNewRadius,
} from '../utils/selectionOperations';
import { DRAG_THRESHOLD } from '../constants/selectionConstants';

export function useSelectionInteraction(
  selection,
  updateSelection,
  cornerRadius,
  updateCornerRadius,
  stageRegionManager
) {
  // 交互状态
  const [isDrawing, setIsDrawing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isAdjustingRadius, setIsAdjustingRadius] = useState(false);
  const [isDraggingFromAuto, setIsDraggingFromAuto] = useState(false);

  // 交互数据
  const [resizeHandle, setResizeHandle] = useState(null);
  const [radiusHandleType, setRadiusHandleType] = useState(null);
  const [startPos, setStartPos] = useState(null);
  const [moveOffset, setMoveOffset] = useState(null);
  const [initialSelection, setInitialSelection] = useState(null);
  const [initialRadius, setInitialRadius] = useState(0);

  // 是否正在交互
  const isInteracting = isDrawing || isMoving || isResizing || isAdjustingRadius || isDraggingFromAuto;

  // 重置所有交互状态
  const resetInteractionState = useCallback(() => {
    setIsDrawing(false);
    setIsMoving(false);
    setIsResizing(false);
    setIsAdjustingRadius(false);
    setIsDraggingFromAuto(false);
    setResizeHandle(null);
    setRadiusHandleType(null);
    setStartPos(null);
    setMoveOffset(null);
    setInitialSelection(null);
    setInitialRadius(0);
  }, []);

  // 开始从自动选择拖拽
  const startDragFromAuto = useCallback((pos) => {
    setStartPos(pos);
    setIsDraggingFromAuto(true);
  }, []);

  // 开始调整圆角
  const startRadiusAdjustment = useCallback((pos, handleType) => {
    setIsAdjustingRadius(true);
    setRadiusHandleType(handleType);
    setStartPos(pos);
    setInitialRadius(cornerRadius);
  }, [cornerRadius]);

  // 开始调整大小
  const startResizing = useCallback((pos, handleType) => {
    setIsResizing(true);
    setResizeHandle(handleType);
    setStartPos(pos);
    setInitialSelection({ ...selection });
  }, [selection]);

  // 开始移动
  const startMoving = useCallback((pos) => {
    setIsMoving(true);
    setIsDrawing(false);
    setMoveOffset({ dx: pos.x - selection.x, dy: pos.y - selection.y });
  }, [selection]);

  // 开始绘制
  const startDrawing = useCallback((pos) => {
    setIsDrawing(true);
    setIsMoving(false);
    setStartPos(pos);
    updateSelection({ x: pos.x, y: pos.y, width: 0, height: 0 });
  }, [updateSelection]);

  // 处理鼠标按下
  const handleMouseDown = useCallback(
    (pos, autoSelectionRect) => {
      if (!selection && autoSelectionRect && autoSelectionRect.width > 0 && autoSelectionRect.height > 0) {
        startDragFromAuto(pos);
        return;
      }

      if (selection) {
        const handleType = checkHandleHit(pos, selection);
        if (handleType) {
          if (isRadiusHandle(handleType)) {
            startRadiusAdjustment(pos, handleType);
          } else {
            startResizing(pos, handleType);
          }
          return;
        }

        const inside =
          pos.x >= selection.x &&
          pos.x <= selection.x + selection.width &&
          pos.y >= selection.y &&
          pos.y <= selection.y + selection.height;

        if (inside) {
          startMoving(pos);
          return;
        }
      }

      startDrawing(pos);
    },
    [selection, startDragFromAuto, startRadiusAdjustment, startResizing, startMoving, startDrawing]
  );

  // 处理鼠标移动
  const handleMouseMove = useCallback(
    (pos, autoSelectionRect) => {
      if (isDraggingFromAuto && startPos && autoSelectionRect) {
        const dx = Math.abs(pos.x - startPos.x);
        const dy = Math.abs(pos.y - startPos.y);

        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          setIsDraggingFromAuto(false);
          setIsDrawing(true);
          updateSelection({ x: startPos.x, y: startPos.y, width: 0, height: 0 });
        }
        return;
      }

      // 处理圆角调整
      if (isAdjustingRadius && startPos && radiusHandleType) {
        const dx = pos.x - startPos.x;
        const dy = pos.y - startPos.y;
        const delta = calculateRadiusDelta(radiusHandleType, dx, dy);
        const newRadius = calculateNewRadius(initialRadius, delta, selection);
        updateCornerRadius(newRadius);
        return;
      }

      // 处理大小调整
      if (isResizing && resizeHandle && startPos && initialSelection) {
        const dx = pos.x - startPos.x;
        const dy = pos.y - startPos.y;
        let newSelection = calculateResizedSelection(initialSelection, resizeHandle, dx, dy);
        
        if (stageRegionManager) {
          newSelection = stageRegionManager.constrainRect(newSelection);
        }
        
        updateSelection(newSelection);
        return;
      }

      // 处理移动
      if (isMoving && selection && moveOffset) {
        let newSelection = calculateMovedSelection(selection, pos, moveOffset);
        
        if (stageRegionManager) {
          newSelection = stageRegionManager.constrainRect(newSelection);
        }
        
        updateSelection(newSelection);
        return;
      }

      // 处理绘制
      if (isDrawing && startPos) {
        let newSelection = calculateSelectionFromPoints(startPos, pos);
        
        if (stageRegionManager) {
          newSelection = stageRegionManager.constrainRect(newSelection);
        }
        
        updateSelection(newSelection);
        return;
      }
    },
    [
      isDraggingFromAuto,
      isAdjustingRadius,
      isResizing,
      isMoving,
      isDrawing,
      startPos,
      radiusHandleType,
      resizeHandle,
      initialSelection,
      initialRadius,
      selection,
      moveOffset,
      updateSelection,
      updateCornerRadius,
      stageRegionManager,
    ]
  );

  // 处理鼠标松开
  const handleMouseUp = useCallback(
    (autoSelectionRect, onSelectFromAuto) => {
      if (isDraggingFromAuto && autoSelectionRect) {
        onSelectFromAuto(autoSelectionRect);
        setIsDraggingFromAuto(false);
        setStartPos(null);
        return;
      }

      if (isDrawing || isMoving || isResizing || isAdjustingRadius) {
        setIsDrawing(false);
        setIsMoving(false);
        setIsResizing(false);
        setResizeHandle(null);
        setIsAdjustingRadius(false);
        setRadiusHandleType(null);
      }
    },
    [isDraggingFromAuto, isDrawing, isMoving, isResizing, isAdjustingRadius]
  );

  return {
    isDrawing,
    isMoving,
    isResizing,
    isAdjustingRadius,
    isDraggingFromAuto,
    isInteracting,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetInteractionState,
  };
}

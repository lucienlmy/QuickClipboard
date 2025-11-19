import { useCallback } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useSelection } from './useSelection';
import { useSelectionInteraction } from './useSelectionInteraction';
import { useAutoSelection } from './useAutoSelection';
import { exportToClipboard, exportToPin, exportToFile } from '../utils/exportUtils';

export function useScreenshotSession(stageRef, stageRegionManager) {
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

  const {
    autoSelectionRect,
    displayAutoSelectionRect,
    hasAutoSelection,
    clearAutoSelection,
    forceRefresh: refreshAutoSelection,
    navigateHierarchy,
  } = useAutoSelection(isInteracting || hasValidSelection);

  const handleMouseDown = useCallback((e) => {
    const button = e.evt?.button;
    if (button !== undefined && button !== 0) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    interactionMouseDown(pos, autoSelectionRect);
  }, [interactionMouseDown, autoSelectionRect]);


  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    interactionMouseMove(pos, autoSelectionRect);
    if (isDrawing && !selection) {
      clearAutoSelection();
    }
  };

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

  const handleRightClick = useCallback(async (e) => {
    e.evt?.preventDefault?.();
    resetInteractionState();
    if (selection) {
      clearSelection();
      refreshAutoSelection();
      return;
    }
    try {
      await getCurrentWebviewWindow().close();
    } catch (err) {
      console.error('关闭窗口失败:', err);
    }
  }, [selection, clearSelection, resetInteractionState, refreshAutoSelection]);

  const handleWheel = useCallback((e) => {
    if (hasValidSelection || isInteracting) return;
    const delta = e.evt.deltaY;
    if (delta < 0) {
      navigateHierarchy(1);
    } else {
      navigateHierarchy(-1);
    }
  }, [hasValidSelection, isInteracting, navigateHierarchy]);

  const handleCancelSelection = useCallback(() => {
    if (!selection) return;
    clearSelection();
    refreshAutoSelection();
  }, [selection, clearSelection, refreshAutoSelection]);

  const handleConfirmSelection = useCallback(async () => {
    if (!selection) return;
    try {
      await exportToClipboard(stageRef, selection, cornerRadius);
    } catch (err) {
      console.error('复制选区到剪贴板失败:', err);
    }
  }, [selection, stageRef, cornerRadius]);

  const handlePinSelection = useCallback(async () => {
    if (!selection) return;
    try {
      await exportToPin(stageRef, selection, cornerRadius);
    } catch (err) {
      console.error('创建贴图失败:', err);
    }
  }, [selection, stageRef, cornerRadius]);

  const handleSaveSelection = useCallback(async () => {
    if (!selection) return;
    try {
      await exportToFile(stageRef, selection, cornerRadius);
    } catch (err) {
      console.error('保存文件失败:', err);
    }
  }, [selection, stageRef, cornerRadius]);

  return {
    selection,
    cornerRadius,
    aspectRatio,
    hasValidSelection,
    updateCornerRadius,
    updateAspectRatio,
    isDrawing,
    isMoving,
    isResizing,
    isInteracting,
    autoSelectionRect,
    displayAutoSelectionRect,
    hasAutoSelection,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleRightClick,
    handleWheel,
    handleCancelSelection,
    handleConfirmSelection,
    handlePinSelection,
    handleSaveSelection,
  };
}

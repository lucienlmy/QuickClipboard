import { useCallback, useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { cancelScreenshotSession } from '@shared/api/system';
import { useSelection } from './useSelection';
import { useSelectionInteraction } from './useSelectionInteraction';
import { useAutoSelection } from './useAutoSelection';
import { exportToClipboard, exportToPin, exportToFile } from '../utils/exportUtils';
import { recognizeSelectionOcr } from '../utils/ocrUtils';

export function useScreenshotSession(stageRef, stageRegionManager, { screens = [] } = {}) {
  const [quickMode, setQuickMode] = useState(0);
  const quickModeExecutedRef = useRef(false);
  
  const {
    selection,
    cornerRadius,
    aspectRatio,
    hasValidSelection,
    updateSelection,
    clearSelection,
    updateCornerRadius,
    updateAspectRatio,
    updateSelectionSize,
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
  } = useSelectionInteraction(
    selection,
    updateSelection,
    cornerRadius,
    updateCornerRadius,
    aspectRatio,
    stageRegionManager
  );

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
    const shiftKey = Boolean(e.evt?.shiftKey);
    interactionMouseMove(pos, autoSelectionRect, { shiftKey });
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

  const isSelectionComplete = hasValidSelection && !isDrawing && !isMoving && !isResizing;

  useEffect(() => {
    let unlisten;
    let mounted = true;
    
    (async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const win = getCurrentWebviewWindow();
      unlisten = await win.listen('screenshot:new-session', (event) => {
        if (!mounted) return;
        const mode = event.payload?.quickMode ?? 0;
        setQuickMode(mode);
        quickModeExecutedRef.current = false;
      });

      try {
        const mode = await invoke('get_screenshot_quick_mode');
        if (mounted) {
          setQuickMode(mode);
          quickModeExecutedRef.current = false;
        }
      } catch (err) {
        console.error('获取快捷模式失败:', err);
      }
    })();
    
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  const handleRightClick = useCallback(async (e) => {
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

  const handleCancelSelection = useCallback(async () => {
    try {
      await cancelScreenshotSession();
    } catch (err) {
      console.error('取消截屏会话失败:', err);
    }
  }, []);

  const getEffectiveSelection = useCallback(() => {
    if (selection) return selection;
    if (autoSelectionRect) {
      return {
        x: autoSelectionRect.x,
        y: autoSelectionRect.y,
        width: autoSelectionRect.width,
        height: autoSelectionRect.height,
      };
    }
    return null;
  }, [selection, autoSelectionRect]);

  const handleConfirmSelection = useCallback(async () => {
    const effectiveSelection = getEffectiveSelection();
    if (!effectiveSelection) return;
    try {
      await exportToClipboard(stageRef, effectiveSelection, cornerRadius, { screens });
    } catch (err) {
      console.error('复制选区到剪贴板失败:', err);
    }
  }, [getEffectiveSelection, stageRef, cornerRadius, screens]);

  const handlePinSelection = useCallback(async () => {
    const effectiveSelection = getEffectiveSelection();
    if (!effectiveSelection) return;
    try {
      await exportToPin(stageRef, effectiveSelection, cornerRadius, { screens });
    } catch (err) {
      console.error('创建贴图失败:', err);
    }
  }, [getEffectiveSelection, stageRef, cornerRadius, screens]);

  const handleSaveSelection = useCallback(async () => {
    const effectiveSelection = getEffectiveSelection();
    if (!effectiveSelection) return;
    try {
      await exportToFile(stageRef, effectiveSelection, cornerRadius, { screens });
    } catch (err) {
      console.error('保存文件失败:', err);
    }
  }, [getEffectiveSelection, stageRef, cornerRadius, screens]);

  const handleQuickOcr = useCallback(async () => {
    const effectiveSelection = getEffectiveSelection();
    if (!effectiveSelection) return;
    try {
      const result = await recognizeSelectionOcr(stageRef, effectiveSelection, { screens });
      if (result?.text) {
        const { copyTextToClipboard } = await import('@shared/api/system');
        await copyTextToClipboard(result.text);
      }
    } catch (err) {
      console.error('OCR识别失败:', err);
    }
  }, [getEffectiveSelection, stageRef, screens]);

  useEffect(() => {
    if (!isSelectionComplete || quickModeExecutedRef.current || quickMode === 0) return;
    
    const executeQuickMode = async () => {
      quickModeExecutedRef.current = true;

      await new Promise(r => setTimeout(r, 50));
      
      try {
        if (quickMode === 1) {
          await handleConfirmSelection();
        } else if (quickMode === 2) {
          await handlePinSelection();
        } else if (quickMode === 3) {
          await handleQuickOcr();
        }
      } catch (err) {
        console.error('快捷模式执行失败:', err);
      }
      await cancelScreenshotSession();
    };
    
    executeQuickMode();
  }, [isSelectionComplete, quickMode, handleConfirmSelection, handlePinSelection, handleQuickOcr]);

  return {
    selection,
    cornerRadius,
    aspectRatio,
    hasValidSelection,
    updateCornerRadius,
    updateAspectRatio,
    updateSelectionSize,
    isDrawing,
    isMoving,
    isResizing,
    isInteracting,
    autoSelectionRect,
    displayAutoSelectionRect,
    hasAutoSelection,
    quickMode,
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

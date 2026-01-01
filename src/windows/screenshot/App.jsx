import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSnapshot } from 'valtio';

import { Stage, Layer } from 'react-konva';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { settingsStore } from '@shared/store/settingsStore';
import { useSettingsSync } from '@shared/hooks/useSettingsSync';
import { getEffectiveTheme } from '@shared/hooks/useTheme';
import useScreenshotStage from './hooks/useScreenshotStage';
import useCursorMovement from './hooks/useCursorMovement';
import WebGLBackgroundLayer from './components/WebGLBackgroundLayer';
import SelectionOverlay from './components/SelectionOverlay';
import Magnifier from './components/Magnifier';
import SelectionInfoBar from './components/SelectionInfoBar';
import SelectionToolbar from './components/SelectionToolbar';
import EditingLayer from './components/EditingLayer';
import useScreenshotEditing from './hooks/useScreenshotEditing';
import { useScreenshotSession } from './hooks/useScreenshotSession';
import useLongScreenshot from './hooks/useLongScreenshot';
import { usePinEditMode } from './hooks/usePinEditMode';
import { ensureAutoSelectionStarted } from './utils/autoSelectionManager';
import { createStageRegionManager } from './utils/stageRegionManager';
import ToolParameterPanel from './components/ToolParameterPanel';
import LongScreenshotPanel from './components/LongScreenshotPanel';
import OcrOverlay from './components/OcrOverlay';
import { recognizeSelectionOcr } from './utils/ocrUtils';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';
import RadialToolPicker from './components/RadialToolPicker';
import { checkHandleHit, isRadiusHandle } from './utils/handleDetection';
import { calculateRadiusDelta, calculateNewRadius } from './utils/selectionOperations';

function App() {
  useSettingsSync();
  const settings = useSnapshot(settingsStore);
  const effectiveTheme = getEffectiveTheme(settings.theme, settings.systemIsDark);
  const isDark = effectiveTheme === 'dark';

  const { screens, stageSize: screenshotStageSize, stageRegionManager: screenshotStageRegionManager, reloadFromLastCapture } = useScreenshotStage();
  const pinEditMode = usePinEditMode();
  const isPinEdit = pinEditMode.isPinEditMode;

  const stageRef = useRef(null);
  const magnifierUpdateRef = useRef(null);
  const [ocrResult, setOcrResult] = useState(null);
  const lastClickRef = useRef({ x: 0, y: 0, time: 0 });

  const virtualScreenOffset = useMemo(() => {
    if (!isPinEdit || !pinEditMode.screenInfos?.length) return { x: 0, y: 0 };
    const minX = Math.min(...pinEditMode.screenInfos.map(([px]) => px));
    const minY = Math.min(...pinEditMode.screenInfos.map(([, py]) => py));
    return { x: minX, y: minY };
  }, [isPinEdit, pinEditMode.screenInfos]);

  const pinEditSelection = useMemo(() => {
    if (!isPinEdit || !pinEditMode.pinEditData || !pinEditMode.pinImage) return null;
    const baseSelection = pinEditMode.calculateSelection(pinEditMode.pinEditData, pinEditMode.pinImage);
    if (!baseSelection) return null;
    
    const dpr = window.devicePixelRatio || 1;
    return {
      ...baseSelection,
      x: (pinEditMode.pinEditData.x - virtualScreenOffset.x) / dpr,
      y: (pinEditMode.pinEditData.y - virtualScreenOffset.y) / dpr,
    };
  }, [isPinEdit, pinEditMode.pinEditData, pinEditMode.pinImage, pinEditMode.calculateSelection, virtualScreenOffset]);

  const pinImageAsScreen = useMemo(() => {
    if (!isPinEdit || !pinEditMode.pinImage || !pinEditSelection) return null;
    return {
      image: pinEditMode.pinImage,
      x: pinEditSelection.x,
      y: pinEditSelection.y,
      width: pinEditSelection.width,
      height: pinEditSelection.height,
      physicalX: 0,
      physicalY: 0,
      physicalWidth: pinEditSelection.physicalWidth,
      physicalHeight: pinEditSelection.physicalHeight,
      scaleFactor: pinEditSelection.physicalWidth / pinEditSelection.width,
    };
  }, [isPinEdit, pinEditMode.pinImage, pinEditSelection]);

  const effectiveScreens = useMemo(() => {
    return isPinEdit && pinImageAsScreen ? [pinImageAsScreen] : screens;
  }, [isPinEdit, pinImageAsScreen, screens]);

  const stageSize = useMemo(() => {
    if (isPinEdit && pinEditMode.screenInfos?.length) {
      const dpr = window.devicePixelRatio || 1;
      const cssScreens = pinEditMode.screenInfos.map(([px, py, pw, ph]) => ({
        x: px / dpr, y: py / dpr, width: pw / dpr, height: ph / dpr,
      }));
      const minX = Math.min(...cssScreens.map(s => s.x));
      const minY = Math.min(...cssScreens.map(s => s.y));
      const maxX = Math.max(...cssScreens.map(s => s.x + s.width));
      const maxY = Math.max(...cssScreens.map(s => s.y + s.height));
      return { width: maxX - minX, height: maxY - minY };
    }
    return screenshotStageSize;
  }, [isPinEdit, pinEditMode.screenInfos, screenshotStageSize]);

  const pinEditStageRegionManager = useMemo(() => {
    if (!isPinEdit || !pinEditMode.screenInfos?.length) return null;
    const dpr = window.devicePixelRatio || 1;
    const screens = pinEditMode.screenInfos.map(([px, py, pw, ph, scaleFactor]) => ({
      x: (px - virtualScreenOffset.x) / dpr,
      y: (py - virtualScreenOffset.y) / dpr,
      width: pw / dpr,
      height: ph / dpr,
      physicalX: px - virtualScreenOffset.x,
      physicalY: py - virtualScreenOffset.y,
      physicalWidth: pw,
      physicalHeight: ph,
      scaleFactor,
    }));
    return createStageRegionManager(screens);
  }, [isPinEdit, pinEditMode.screenInfos, virtualScreenOffset]);

  const stageRegionManager = isPinEdit ? pinEditStageRegionManager : screenshotStageRegionManager;

  const { handleMouseMove: handleCursorMove, initializePosition } = useCursorMovement(screens, magnifierUpdateRef, stageRegionManager);
  
  const initializePositionRef = useRef(initializePosition);
  useEffect(() => {
    initializePositionRef.current = initializePosition;
  }, [initializePosition]);
  
  const quickPinCallbackRef = useRef(null);
  
  const session = useScreenshotSession(stageRef, stageRegionManager, { 
    screens,
    onQuickPin: () => quickPinCallbackRef.current?.(),
  });
  const longScreenshot = useLongScreenshot(session.selection, screens, stageRegionManager);
  const editing = useScreenshotEditing(effectiveScreens, stageRef, {
    clipBounds: isPinEdit ? pinEditSelection : null,
    initialShapes: isPinEdit ? pinEditMode.initialShapes : null,
  });

  const effectiveSelection = isPinEdit ? pinEditSelection : session.selection;
  const effectiveHasValidSelection = isPinEdit ? !!pinEditSelection : session.hasValidSelection;

  const handleConfirm = useCallback(async () => {
    if (!effectiveSelection) return;
    try {
      const { exportPinEditImage } = await import('./utils/exportUtils');
      const editShapes = editing.getSerializableShapes();
      const hasEdits = editShapes.length > 0 || session.cornerRadius > 0;
      const result = await exportPinEditImage(stageRef, effectiveSelection, {
        originalImage: pinEditMode.pinImage,
        cornerRadius: session.cornerRadius,
      });

      if (result) {
        const editDataJson = hasEdits ? JSON.stringify(editShapes) : null;

        await pinEditMode.confirmPinEdit(result.compositeFilePath, editDataJson);
      }
    } catch (err) {
      console.error('确认贴图编辑失败:', err);
    }
  }, [effectiveSelection, pinEditMode, stageRef, editing, session.cornerRadius]);

  const handleCancel = useCallback(() => {
    if (isPinEdit) {
      pinEditMode.exitPinEditMode();
    } else {
      session.handleCancelSelection();
    }
  }, [isPinEdit, pinEditMode, session]);
  const handlePinSelection = useCallback(async () => {
    const targetSelection = session.selection || session.autoSelectionRect;
    if (!targetSelection) return;
    try {
      const { exportToPin } = await import('./utils/exportUtils');
      const editShapes = editing.getSerializableShapes(targetSelection);
      const hasBorder = editing.borderConfig?.enabled;
      const hasWatermark = editing.watermarkConfig?.enabled;
      const hasEdits = editShapes.length > 0 || hasBorder || hasWatermark;
      const editDataJson = hasEdits ? JSON.stringify(editShapes) : null;

      await exportToPin(stageRef, targetSelection, session.cornerRadius, {
        screens,
        editData: editDataJson,
        hasBorder,
        hasWatermark,
      });
    } catch (err) {
      console.error('创建贴图失败:', err);
    }
  }, [session.selection, session.autoSelectionRect, session.cornerRadius, stageRef, screens, editing]);

  useEffect(() => {
    quickPinCallbackRef.current = handlePinSelection;
  }, [handlePinSelection]);

  // 快捷键管理
  useKeyboardShortcuts({
    activeToolId: editing.activeToolId,
    setActiveToolId: editing.setActiveToolId,
    onUndo: editing.undo,
    onRedo: editing.redo,
    onDelete: editing.deleteSelectedShapes,
    onClearCanvas: editing.clearCanvas,
    onCancel: handleCancel,
    onSave: isPinEdit ? undefined : session.handleSaveSelection,
    onConfirm: isPinEdit ? handleConfirm : session.handleConfirmSelection,
    onPin: isPinEdit ? undefined : handlePinSelection,
    onSelectAll: () => {
      if (editing.shapes.length > 0) {
        editing.setSelectedShapeIndices?.(editing.shapes.map((_, i) => i));
      }
    },
    canUndo: editing.canUndo,
    canRedo: editing.canRedo,
    canDelete: editing.selectedShapeIndices?.length > 0,
    canClearCanvas: editing.canClearCanvas,
    longScreenshotMode: longScreenshot.isActive,
    hasValidSelection: effectiveHasValidSelection,
    hasAutoSelection: session.hasAutoSelection,
    editingTextIndex: editing.editingTextIndex,
    pinEditMode: isPinEdit,
  });

  // 贴图编辑模式圆角调整状态
  const pinEditRadiusRef = useRef({ 
    isAdjusting: false, 
    startPos: null, 
    initialRadius: 0,
    handleType: null,
  });

  // 鼠标事件处理
  const handleMouseDown = (e) => {
    if (longScreenshot.isActive) return;
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (isPinEdit && !editing.activeToolId && effectiveSelection) {
      const handleType = checkHandleHit(pos, effectiveSelection);
      if (handleType && isRadiusHandle(handleType)) {
        pinEditRadiusRef.current = {
          isAdjusting: true,
          startPos: pos,
          initialRadius: session.cornerRadius,
          handleType,
        };
        return;
      }
    }
    
    if (editing.activeToolId) {
      if (e.evt?.button !== undefined && e.evt.button !== 0) return;
      editing.handleMouseDown(e, pos);
    } else {
      session.handleMouseDown(e);
    }
  };

  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (longScreenshot.isActive) {
      handleCursorMove(e);
      return;
    }
    
    // 贴图编辑模式圆角调整
    if (pinEditRadiusRef.current.isAdjusting && effectiveSelection) {
      const { startPos, initialRadius, handleType } = pinEditRadiusRef.current;
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      const delta = calculateRadiusDelta(handleType, dx, dy);
      const newRadius = calculateNewRadius(initialRadius, delta, effectiveSelection);
      session.updateCornerRadius(newRadius);
      return;
    }
    
    if (editing.activeToolId) {
      if (e.evt?.button !== undefined && e.evt.button !== 0) return;
      editing.handleMouseMove(e, pos);
    } else {
      session.handleMouseMove(e);
    }
    handleCursorMove(e);
  };

  const handleMouseUp = (e) => {
    if (longScreenshot.isActive) return;

    if (pinEditRadiusRef.current.isAdjusting) {
      pinEditRadiusRef.current = { isAdjusting: false, startPos: null, initialRadius: 0, handleType: null };
      return;
    }
    
    if (editing.activeToolId) {
      editing.handleMouseUp(e);
    } else {
      session.handleMouseUp(e);
    }
  };

  const handleClick = (e) => {
    if (longScreenshot.isActive || editing.activeToolId) return;
    const stage = e.target.getStage();
    const { x, y } = stage.getPointerPosition();
    const now = Date.now();
    const last = lastClickRef.current;
    const isDoubleClick = now - last.time < 500 && now - last.time > 50 && Math.hypot(x - last.x, y - last.y) < 5;
    lastClickRef.current = { x, y, time: now };
    if (isDoubleClick && session.hasValidSelection) {
      session.handleConfirmSelection();
    }
  };

  const handleDoubleClick = (e) => {
    if (longScreenshot.isActive) return;
    if (editing.activeToolId && editing.handleDoubleClick) {
      editing.handleDoubleClick(e, e.target.getStage().getPointerPosition());
    }
  };

  const handleContextMenu = useCallback((e) => {
    if (longScreenshot.isActive) {
      e.evt?.preventDefault();
      return;
    }
    if (isPinEdit) {
      e.evt?.preventDefault();
      editing.activeToolId ? editing.setActiveToolId(null) : pinEditMode.exitPinEditMode(true);
      return;
    }
    if (editing.activeToolId) {
      editing.setActiveToolId(null);
    }
    session.handleRightClick(e);
  }, [editing, session, longScreenshot.isActive, isPinEdit, pinEditMode]);


  // OCR识别
  useEffect(() => {
    if (editing.activeToolId !== 'ocr' || !effectiveSelection) {
      if (ocrResult) setOcrResult(null);
      return;
    }
    if (ocrResult) return;
    (async () => {
      try {
        const result = await recognizeSelectionOcr(stageRef, effectiveSelection, { screens: effectiveScreens });
        setOcrResult(result);
        editing.handleToolParameterChange('recognizedText', result.text);
      } catch (error) {
        console.error('OCR识别失败:', error);
        editing.handleToolParameterChange('recognizedText', `识别失败: ${error.message}`);
      }
    })();
  }, [editing.activeToolId, effectiveSelection, ocrResult, editing, effectiveScreens]);

  // 初始化
  useEffect(() => {
    if (isPinEdit) return;
    let unlisten;
    const init = async () => {
      await Promise.all([reloadFromLastCapture(), ensureAutoSelectionStarted()]);
      setTimeout(() => {
        const stage = stageRef.current;
        const pos = stage?.getPointerPosition?.();
        if (pos) {
          initializePositionRef.current?.(pos);
          setTimeout(() => magnifierUpdateRef.current?.(pos), 0);
        }
      }, 0);
    };
    (async () => {
      try {
        const win = getCurrentWebviewWindow();
        unlisten = await win.listen('screenshot:new-session', init);
        if (!pinEditMode.isChecking) {
          init();
        }
      } catch (err) {
        console.error('初始化截屏失败:', err);
      }
    })();
    return () => unlisten?.();
  }, [reloadFromLastCapture, isPinEdit, pinEditMode.isChecking]);

  // 贴图编辑模式穿透控制
  useEffect(() => {
    if (!isPinEdit || !pinEditSelection) return;
    pinEditMode.startPassthrough(pinEditSelection, virtualScreenOffset);
    return () => pinEditMode.stopPassthrough();
  }, [isPinEdit, pinEditSelection, pinEditMode, virtualScreenOffset]);

  return (
    <div className={`w-screen h-screen bg-transparent relative ${isDark ? 'dark' : ''}`}>
      {/* 背景层 */}
      {!longScreenshot.isActive && (
        <WebGLBackgroundLayer screens={effectiveScreens} stageWidth={stageSize.width} stageHeight={stageSize.height} />
      )}

      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        pixelRatio={window.devicePixelRatio || 1}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onDblClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onWheel={session.handleWheel}
      >
        {!longScreenshot.isActive && (
          <EditingLayer
            shapes={editing.shapes}
            listening={!!editing.activeToolId}
            selectedShapeIndices={editing.selectedShapeIndices}
            activeToolId={editing.activeToolId}
            onSelect={editing.handleShapeClick}
            onShapeTransform={editing.updateSelectedShape}
            onShapeTransformByIndex={editing.updateShapeByIndex}
            selectionBox={editing.selectionBox}
            isSelectToolActive={editing.activeToolId === 'select'}
            onTextEdit={editing.startEditingText}
            editingTextIndex={editing.editingTextIndex}
            onTextChange={(text, index) => editing.updateTextContent(index, text)}
            onTextEditClose={editing.stopEditingText}
            watermarkConfig={editing.watermarkConfig}
            borderConfig={editing.borderConfig}
            selection={effectiveSelection}
            cornerRadius={session.cornerRadius}
            stageSize={stageSize}
            pinEditMode={isPinEdit}
            onHoverChange={editing.setIsHoveringShape}
            isDrawingShape={editing.isDrawingShape}
          />
        )}
        <SelectionOverlay
          stageWidth={stageSize.width}
          stageHeight={stageSize.height}
          stageRef={stageRef}
          selection={effectiveSelection}
          cornerRadius={session.cornerRadius}
          hasValidSelection={effectiveHasValidSelection}
          isDrawing={session.isDrawing}
          isMoving={session.isMoving}
          isInteracting={session.isInteracting}
          autoSelectionRect={session.autoSelectionRect}
          displayAutoSelectionRect={session.displayAutoSelectionRect}
          hasAutoSelection={session.hasAutoSelection}
          listening={!editing.activeToolId && !longScreenshot.isActive && !isPinEdit}
          handleMouseDown={session.handleMouseDown}
          handleMouseMove={session.handleMouseMove}
          handleMouseUp={session.handleMouseUp}
          handleRightClick={longScreenshot.isActive ? undefined : session.handleRightClick}
          handleWheel={session.handleWheel}
          activeToolId={editing.activeToolId}
          toolStyle={editing.toolStyle}
          longScreenshotMode={longScreenshot.isActive}
          pinEditMode={isPinEdit}
          isHoveringShape={editing.isHoveringShape}
        />
        <Layer id="screenshot-ui-layer" listening={false}>
          <Magnifier
            screens={screens}
            visible={settings.screenshotMagnifierEnabled && !session.hasValidSelection && !session.isInteracting && !editing.activeToolId && !isPinEdit}
            stageRegionManager={stageRegionManager}
            colorIncludeFormat={settings.screenshotColorIncludeFormat}
            onMousePosUpdate={(fn) => { magnifierUpdateRef.current = fn; }}
            isDark={isDark}
          />
        </Layer>
      </Stage>


      {/* 选区信息栏 */}
      {!longScreenshot.isActive && !isPinEdit && !session.screenshotMode && (
        <SelectionInfoBar
          selection={session.selection}
          cornerRadius={session.cornerRadius}
          aspectRatio={session.aspectRatio}
          isMoving={session.isMoving}
          isDrawing={session.isDrawing}
          isResizing={session.isResizing}
          isDrawingShape={editing.isDrawingShape}
          stageRegionManager={stageRegionManager}
          onCornerRadiusChange={session.updateCornerRadius}
          onAspectRatioChange={session.updateAspectRatio}
          onSizeChange={session.updateSelectionSize}
        />
      )}

      {/* 工具栏 */}
      {(isPinEdit || !session.screenshotMode) && (
        <SelectionToolbar
          selection={effectiveSelection}
          isDrawing={session.isDrawing}
          isMoving={session.isMoving}
          isResizing={session.isResizing}
          isDrawingShape={editing.isDrawingShape}
          stageRegionManager={stageRegionManager}
          onCancel={handleCancel}
          onConfirm={isPinEdit ? handleConfirm : session.handleConfirmSelection}
          onPin={handlePinSelection}
          onSave={session.handleSaveSelection}
          activeToolId={editing.activeToolId}
          onToolChange={editing.setActiveToolId}
          undo={editing.undo}
          redo={editing.redo}
          canUndo={editing.canUndo}
          canRedo={editing.canRedo}
          clearCanvas={editing.clearCanvas}
          canClearCanvas={editing.canClearCanvas}
          longScreenshotMode={longScreenshot.isActive}
          isLongScreenshotCapturing={longScreenshot.isCapturing}
          isLongScreenshotSaving={longScreenshot.isSaving}
          hasLongScreenshotPreview={!!longScreenshot.preview}
          onLongScreenshotEnter={longScreenshot.enter}
          onLongScreenshotStart={longScreenshot.start}
          onLongScreenshotStop={longScreenshot.stop}
          onLongScreenshotCopy={longScreenshot.copy}
          onLongScreenshotSave={longScreenshot.save}
          onLongScreenshotCancel={longScreenshot.cancel}
          pinEditMode={isPinEdit}
          screens={screens}
        />
      )}

      {/* 工具参数面板 */}
      {!longScreenshot.isActive && (isPinEdit || !session.screenshotMode) && (
        <ToolParameterPanel
          selection={effectiveSelection}
          activeTool={editing.activeTool}
          parameters={editing.toolParameters}
          values={editing.toolStyle}
          isSelectMode={editing.isSelectMode}
          isDrawingShape={editing.isDrawingShape}
          stageRegionManager={stageRegionManager}
          onParameterChange={editing.handleToolParameterChange}
          onTogglePersistence={editing.handleTogglePersistence}
          onAction={async (action) => {
            if (action === 'delete') {
              editing.deleteSelectedShapes();
            } else if (action === 'copyAll' || action === 'copySelected') {
              const text = action === 'copyAll' 
                ? editing.toolStyle?.recognizedText || ''
                : window.getSelection().toString();
              if (text) {
                try {
                  const { copyTextToClipboard } = await import('@shared/api/system');
                  await copyTextToClipboard(text);
                } catch (error) {
                  console.error('复制失败:', error);
                }
              }
            }
          }}
        />
      )}

      {/* 长截屏面板 */}
      {longScreenshot.isActive && (
        <LongScreenshotPanel
          selection={session.selection}
          stageRegionManager={stageRegionManager}
          isCapturing={longScreenshot.isCapturing}
          isSaving={longScreenshot.isSaving}
          previewImage={longScreenshot.preview}
          previewSize={longScreenshot.previewSize}
          capturedCount={longScreenshot.capturedCount}
          screens={screens}
        />
      )}

      {/* OCR 结果 */}
      {ocrResult && <OcrOverlay result={ocrResult} selection={effectiveSelection} />}

      {/* 快捷键提示 */}
      {settings.screenshotHintsEnabled && !isPinEdit && !session.screenshotMode && screens.length > 0 && (
        <KeyboardShortcutsHelp
          stageRegionManager={stageRegionManager}
          longScreenshotMode={longScreenshot.isActive}
          isDrawingShape={editing.isDrawingShape}
          hasValidSelection={session.hasValidSelection}
          isDrawing={session.isDrawing}
          isInteracting={session.isInteracting}
          selection={session.selection}
        />
      )}

      {/* 径向工具选择器*/}
      {effectiveHasValidSelection && !longScreenshot.isActive && !isPinEdit && !session.screenshotMode && (
        <RadialToolPicker
          activeToolId={editing.activeToolId}
          onToolSelect={(toolId) => editing.setActiveToolId(editing.activeToolId === toolId ? null : toolId)}
          actions={{
            undo: editing.undo,
            redo: editing.redo,
            clear: editing.clearCanvas,
            save: session.handleSaveSelection,
            pin: handlePinSelection,
            confirm: session.handleConfirmSelection,
            cancel: session.handleCancelSelection,
          }}
          disabledActions={{
            undo: !editing.canUndo,
            redo: !editing.canRedo,
            clear: !editing.canClearCanvas,
          }}
          disabled={editing.isDrawingShape || session.isDrawing || session.isMoving || session.isResizing}
          longScreenshotMode={longScreenshot.isActive}
        />
      )}
    </div>
  );
}

export default App;
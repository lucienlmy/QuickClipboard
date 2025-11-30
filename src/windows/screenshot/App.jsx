import { useCallback, useEffect, useRef, useState } from 'react';
import { useSnapshot } from 'valtio';

import { Stage, Layer } from 'react-konva';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { settingsStore } from '@shared/store/settingsStore';
import { useSettingsSync } from '@shared/hooks/useSettingsSync';
import useScreenshotStage from './hooks/useScreenshotStage';
import useCursorMovement from './hooks/useCursorMovement';
import BackgroundLayer from './components/BackgroundLayer';
import SelectionOverlay from './components/SelectionOverlay';
import Magnifier from './components/Magnifier';
import SelectionInfoBar from './components/SelectionInfoBar';
import SelectionToolbar from './components/SelectionToolbar';
import EditingLayer from './components/EditingLayer';
import useScreenshotEditing from './hooks/useScreenshotEditing';
import { useScreenshotSession } from './hooks/useScreenshotSession';
import useLongScreenshot from './hooks/useLongScreenshot';
import { ensureAutoSelectionStarted } from './utils/autoSelectionManager';
import ToolParameterPanel from './components/ToolParameterPanel';
import LongScreenshotPanel from './components/LongScreenshotPanel';
import OcrOverlay from './components/OcrOverlay';
import { recognizeSelectionOcr } from './utils/ocrUtils';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';

function App() {
  useSettingsSync();
  const settings = useSnapshot(settingsStore);

  const { screens, stageSize, stageRegionManager, reloadFromLastCapture } = useScreenshotStage();
  const stageRef = useRef(null);
  const magnifierUpdateRef = useRef(null);
  const [ocrResult, setOcrResult] = useState(null);

  const { handleMouseMove: handleCursorMove, initializePosition } = useCursorMovement(screens, magnifierUpdateRef, stageRegionManager);
  const session = useScreenshotSession(stageRef, stageRegionManager);
  const editing = useScreenshotEditing(screens, stageRef);
  const longScreenshot = useLongScreenshot(session.selection, screens, stageRegionManager);

  // 快捷键管理
  useKeyboardShortcuts({
    activeToolId: editing.activeToolId,
    setActiveToolId: editing.setActiveToolId,
    onUndo: editing.undo,
    onRedo: editing.redo,
    onDelete: editing.deleteSelectedShapes,
    onClearCanvas: editing.clearCanvas,
    onCancel: session.handleCancelSelection,
    onSave: session.handleSaveSelection,
    onConfirm: session.handleConfirmSelection,
    onPin: session.handlePinSelection,
    onSelectAll: () => {
      if (editing.shapes.length > 0) {
        const allIndices = editing.shapes.map((_, index) => index);
        editing.setSelectedShapeIndices?.(allIndices);
      }
    },
    canUndo: editing.canUndo,
    canRedo: editing.canRedo,
    canDelete: editing.selectedShapeIndices?.length > 0,
    canClearCanvas: editing.canClearCanvas,
    longScreenshotMode: longScreenshot.isActive,
    hasValidSelection: session.hasValidSelection,
    editingTextIndex: editing.editingTextIndex,
  });

  const handleMouseDown = (e) => {
    // 长截屏模式下禁用选区交互
    if (longScreenshot.isActive) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    if (editing.activeToolId) {
      const button = e.evt?.button;
      if (button !== undefined && button !== 0) {
        return;
      }
      editing.handleMouseDown(e, pos);
    } else {
      session.handleMouseDown(e);
    }
  };

  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    // 长截屏模式下只更新光标，不处理选区交互
    if (longScreenshot.isActive) {
      handleCursorMove(e);
      return;
    }

    if (editing.activeToolId) {
      const button = e.evt?.button;
      if (button !== undefined && button !== 0) {
        return;
      }
      editing.handleMouseMove(e, pos);
      handleCursorMove(e);
    } else {
      session.handleMouseMove(e);
      handleCursorMove(e);
    }
  };

  const handleMouseUp = (e) => {
    // 长截屏模式下禁用选区交互
    if (longScreenshot.isActive) return;

    if (editing.activeToolId) {
      editing.handleMouseUp(e);
    } else {
      session.handleMouseUp(e);
    }
  };

  const handleContextMenu = useCallback((e) => {
    // 长截屏模式下禁用右键取消
    if (longScreenshot.isActive) {
      e.evt?.preventDefault();
      return;
    }
    if (editing.activeToolId) {
      editing.setActiveToolId(null);
    }
    session.handleRightClick(e);
  }, [editing, session, longScreenshot.isActive]);

  // OCR激活时自动识别
  useEffect(() => {
    if (editing.activeToolId !== 'ocr' || !session.selection) {
      if (ocrResult) setOcrResult(null);
      return;
    }
    if (ocrResult) return;
    const performOcr = async () => {
      try {
        const result = await recognizeSelectionOcr(stageRef, session.selection);
        setOcrResult(result);
        editing.handleToolParameterChange('recognizedText', result.text);
      } catch (error) {
        console.error('OCR识别失败:', error);
        alert(`OCR识别失败: ${error.message}`);
        editing.setActiveToolId(null);
      }
    };

    performOcr();
  }, [editing.activeToolId, session.selection, ocrResult, editing]);

  useEffect(() => {
    let unlisten;

    const initializeScreenshot = async () => {
      await Promise.all([
        reloadFromLastCapture(),
        ensureAutoSelectionStarted()
      ]);
      setTimeout(() => {
        if (stageRef.current) {
          const stage = stageRef.current;
          const pos = stage.getPointerPosition();
          if (pos) {
            initializePosition(pos);
            setTimeout(() => magnifierUpdateRef.current?.(pos), 50);
          }
        }
      }, 0);
    };

    (async () => {
      try {
        const win = getCurrentWebviewWindow();
        unlisten = await win.listen('screenshot:new-session', initializeScreenshot);
        await initializeScreenshot();
      } catch (err) {
        console.error('监听 screenshot:new-session 事件失败:', err);
      }
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [reloadFromLastCapture]);

  return (
    <div className="w-screen h-screen bg-transparent relative">
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        pixelRatio={window.devicePixelRatio || 1}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        onWheel={session.handleWheel}
      >
        {!longScreenshot.isActive && <BackgroundLayer screens={screens} />}
        {!longScreenshot.isActive && <EditingLayer
          shapes={editing.shapes}
          listening={!!editing.activeToolId}
          selectedShapeIndices={editing.selectedShapeIndices}
          onSelectShape={editing.toggleSelectShape}
          onShapeTransform={editing.updateSelectedShape}
          isSelectMode={editing.activeToolId === 'select'}
          selectionBox={editing.selectionBox}
          onTextEdit={editing.startEditingText}
          editingTextIndex={editing.editingTextIndex}
          onTextChange={(text, index) => editing.updateTextContent(index, text)}
          onTextEditClose={editing.stopEditingText}
          watermarkConfig={editing.watermarkConfig}
          selection={session.selection}
          stageSize={stageSize}
        />}
        <SelectionOverlay
          stageWidth={stageSize.width}
          stageHeight={stageSize.height}
          stageRef={stageRef}
          selection={session.selection}
          cornerRadius={session.cornerRadius}
          hasValidSelection={session.hasValidSelection}
          isDrawing={session.isDrawing}
          isMoving={session.isMoving}
          isInteracting={session.isInteracting}
          autoSelectionRect={session.autoSelectionRect}
          displayAutoSelectionRect={session.displayAutoSelectionRect}
          hasAutoSelection={session.hasAutoSelection}
          listening={!editing.activeToolId && !longScreenshot.isActive}
          handleMouseDown={session.handleMouseDown}
          handleMouseMove={session.handleMouseMove}
          handleMouseUp={session.handleMouseUp}
          handleRightClick={longScreenshot.isActive ? undefined : session.handleRightClick}
          handleWheel={session.handleWheel}
          activeToolId={editing.activeToolId}
          toolStyle={editing.toolStyle}
          longScreenshotMode={longScreenshot.isActive}
        />
        <Layer id="screenshot-ui-layer" listening={false}>
          <Magnifier
            screens={screens}
            visible={settings.screenshotMagnifierEnabled && !session.hasValidSelection && !session.isInteracting && !editing.activeToolId}
            stageRegionManager={stageRegionManager}
            colorIncludeFormat={settings.screenshotColorIncludeFormat}
            onMousePosUpdate={(updateFn) => { magnifierUpdateRef.current = updateFn; }}
          />
        </Layer>
      </Stage>

      {!longScreenshot.isActive && (
        <SelectionInfoBar
          selection={session.selection}
          cornerRadius={session.cornerRadius}
          aspectRatio={session.aspectRatio}
          isMoving={session.isMoving}
          stageRegionManager={stageRegionManager}
          onCornerRadiusChange={session.updateCornerRadius}
          onAspectRatioChange={session.updateAspectRatio}
        />
      )}

      <SelectionToolbar
        selection={session.selection}
        isDrawing={session.isDrawing}
        isMoving={session.isMoving}
        isResizing={session.isResizing}
        stageRegionManager={stageRegionManager}
        onCancel={session.handleCancelSelection}
        onConfirm={session.handleConfirmSelection}
        onPin={session.handlePinSelection}
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
      />

      {!longScreenshot.isActive && (
        <ToolParameterPanel
          selection={session.selection}
          activeTool={editing.activeTool}
          parameters={editing.toolParameters}
          values={editing.toolStyle}
          isSelectMode={editing.isSelectMode}
          stageRegionManager={stageRegionManager}
          onParameterChange={editing.handleToolParameterChange}
          onTogglePersistence={editing.handleTogglePersistence}
          onAction={async (action) => {
            if (action === 'delete') {
              editing.deleteSelectedShapes();
            } else if (action === 'copyAll') {
              const text = editing.toolStyle?.recognizedText || '';
              if (text) {
                try {
                  const { copyTextToClipboard } = await import('@shared/api/system');
                  await copyTextToClipboard(text);
                } catch (error) {
                  console.error('复制失败:', error);
                }
              }
            } else if (action === 'copySelected') {
              const selectedText = window.getSelection().toString();
              if (selectedText) {
                try {
                  const { copyTextToClipboard } = await import('@shared/api/system');
                  await copyTextToClipboard(selectedText);
                } catch (error) {
                  console.error('复制失败:', error);
                }
              }
            }
          }}
        />
      )}

      {longScreenshot.isActive && (
        <LongScreenshotPanel
          selection={session.selection}
          stageRegionManager={stageRegionManager}
          isCapturing={longScreenshot.isCapturing}
          isSaving={longScreenshot.isSaving}
          previewImage={longScreenshot.preview}
          capturedCount={longScreenshot.capturedCount}
        />
      )}

      {ocrResult && (
        <OcrOverlay
          result={ocrResult}
          selection={session.selection}
        />
      )}

      {/* 快捷键帮助 */}
      {settings.screenshotHintsEnabled && (
        <KeyboardShortcutsHelp
          stageRegionManager={stageRegionManager}
          longScreenshotMode={longScreenshot.isActive}
        />
      )}
    </div>
  );
}

export default App;
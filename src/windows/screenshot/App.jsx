import { useCallback, useEffect, useRef, useState } from 'react';

import { Stage, Layer } from 'react-konva';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
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
import { ensureAutoSelectionStarted } from './utils/autoSelectionManager';
import ToolParameterPanel from './components/ToolParameterPanel';

function App() {
  const { screens, stageSize, stageRegionManager, reloadFromLastCapture } = useScreenshotStage();
  const stageRef = useRef(null);
  const [mousePos, setMousePos] = useState(null);
  const magnifierUpdateRef = useRef(null);

  const handleCursorMove = useCursorMovement(screens, setMousePos, magnifierUpdateRef, stageRegionManager);
  const session = useScreenshotSession(stageRef, stageRegionManager);
  const editing = useScreenshotEditing(screens, stageRef);

  const handleMouseDown = (e) => {
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
    if (editing.activeToolId) {
      editing.handleMouseUp(e);
    } else {
      session.handleMouseUp(e);
    }
  };

  const handleContextMenu = useCallback((e) => {
    if (editing.activeToolId) {
      editing.setActiveToolId(null);
    }
    session.handleRightClick(e);
  }, [editing, session]);

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
            setMousePos(pos);
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
        <BackgroundLayer screens={screens} />
        <EditingLayer 
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
        />
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
          listening={!editing.activeToolId}
          handleMouseDown={session.handleMouseDown}
          handleMouseMove={session.handleMouseMove}
          handleMouseUp={session.handleMouseUp}
          handleRightClick={session.handleRightClick}
          handleWheel={session.handleWheel}
        />
        <Layer id="screenshot-ui-layer" listening={false}>
          <Magnifier
            screens={screens}
            mousePos={mousePos}
            visible={!session.hasValidSelection && !session.isInteracting && !editing.activeToolId}
            stageRegionManager={stageRegionManager}
            onMousePosUpdate={(updateFn) => { magnifierUpdateRef.current = updateFn; }}
          />
        </Layer>
      </Stage>

      <SelectionInfoBar
        selection={session.selection}
        cornerRadius={session.cornerRadius}
        aspectRatio={session.aspectRatio}
        isMoving={session.isMoving}
        stageRegionManager={stageRegionManager}
        onCornerRadiusChange={session.updateCornerRadius}
        onAspectRatioChange={session.updateAspectRatio}
      />

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
      />

      <ToolParameterPanel
        selection={session.selection}
        activeTool={editing.activeTool}
        parameters={editing.toolParameters}
        values={editing.toolStyle}
        stageRegionManager={stageRegionManager}
        onParameterChange={editing.handleToolParameterChange}
        onAction={(action) => {
          if (action === 'delete') {
            editing.deleteSelectedShapes();
          }
        }}
      />
    </div>
  );
}

export default App;
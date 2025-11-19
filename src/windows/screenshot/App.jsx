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
import { useScreenshotSession } from './hooks/useScreenshotSession';
import { ensureAutoSelectionStarted } from './utils/autoSelectionManager';

function App() {
  const { screens, stageSize, stageRegionManager, reloadFromLastCapture } = useScreenshotStage();
  const stageRef = useRef(null);
  const [mousePos, setMousePos] = useState(null);
  const magnifierUpdateRef = useRef(null);

  const handleCursorMove = useCursorMovement(screens, setMousePos, magnifierUpdateRef, stageRegionManager);
  const session = useScreenshotSession(stageRef, stageRegionManager);

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
        onMouseDown={session.handleMouseDown}
        onMouseMove={(e) => {
          session.handleMouseMove(e);
          handleCursorMove(e);
        }}
        onMouseUp={session.handleMouseUp}
        onMouseLeave={session.handleMouseUp}
        onContextMenu={session.handleRightClick}
        onWheel={session.handleWheel}
      >
        <BackgroundLayer screens={screens} />
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
        />
        <Layer listening={false}>
          <Magnifier
            screens={screens}
            mousePos={mousePos}
            visible={!session.hasValidSelection && !session.isInteracting}
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
      />
    </div>
  );
}

export default App;
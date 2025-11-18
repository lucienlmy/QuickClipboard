import { useEffect, useRef, useState } from 'react';

import { Stage, Layer } from 'react-konva';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import useScreenshotStage from './hooks/useScreenshotStage';
import BackgroundLayer from './components/BackgroundLayer';
import SelectionOverlay from './components/SelectionOverlay';
import Magnifier from './components/Magnifier';

function App() {
  const { screens, stageSize, stageRegionManager, reloadFromLastCapture } = useScreenshotStage();
  const stageRef = useRef(null);
  const [mousePos, setMousePos] = useState(null);
  const [hasSelection, setHasSelection] = useState(false);
  const magnifierUpdateRef = useRef(null);

  useEffect(() => {
    let unlisten;
    (async () => {
      try {
        const win = getCurrentWebviewWindow();
        unlisten = await win.listen('screenshot:new-session', async () => {
          await reloadFromLastCapture();
          // 截屏开始，获取当前鼠标位置并初始化放大镜
          setTimeout(() => {
            if (stageRef.current) {
              const stage = stageRef.current;
              const pos = stage.getPointerPosition();
              if (pos) {
                setMousePos(pos);
                setTimeout(() => magnifierUpdateRef.current?.(pos), 50);
              }
            }
          }, 100);
        });
        await reloadFromLastCapture();
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

  const handleStageMouseMove = (e) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) {
      magnifierUpdateRef.current?.(pos);
      setMousePos(pos);
    }
  };

  return (
    <div className="w-screen h-screen bg-transparent">
      <Stage 
        ref={stageRef} 
        width={stageSize.width} 
        height={stageSize.height} 
        pixelRatio={window.devicePixelRatio || 1}
        onMouseMove={handleStageMouseMove}
      >
        <BackgroundLayer screens={screens} />
        <SelectionOverlay 
          stageWidth={stageSize.width}
          stageHeight={stageSize.height}
          stageRef={stageRef}
          stageRegionManager={stageRegionManager}
          onSelectionChange={setHasSelection}
        />
        <Layer listening={false}>
          <Magnifier
            screens={screens}
            mousePos={mousePos}
            visible={!hasSelection}
            stageRegionManager={stageRegionManager}
            onMousePosUpdate={(updateFn) => { magnifierUpdateRef.current = updateFn; }}
          />
        </Layer>
      </Stage>
    </div>
  );
}

export default App;
import { useEffect, useRef } from 'react';

import { Stage } from 'react-konva';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import useScreenshotStage from './hooks/useScreenshotStage';
import BackgroundLayer from './components/BackgroundLayer';
import SelectionOverlay from './components/SelectionOverlay';

function App() {
  const { screens, stageSize, stageRegionManager, reloadFromLastCapture } = useScreenshotStage();
  const stageRef = useRef(null);

  useEffect(() => {
    let unlisten;
    (async () => {
      try {
        const win = getCurrentWebviewWindow();
        unlisten = await win.listen('screenshot:new-session', () => {
          reloadFromLastCapture();
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

  return (
    <div className="w-screen h-screen bg-transparent">
      <Stage ref={stageRef} width={stageSize.width} height={stageSize.height} pixelRatio={window.devicePixelRatio || 1}>
        <BackgroundLayer screens={screens} />
        <SelectionOverlay 
          stageWidth={stageSize.width} 
          stageHeight={stageSize.height} 
          stageRef={stageRef}
          stageRegionManager={stageRegionManager}
        />
      </Stage>
    </div>
  );
}

export default App;
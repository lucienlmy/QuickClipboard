import { useEffect } from 'react';
import { Stage } from 'react-konva';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import useScreenshotStage from './hooks/useScreenshotStage';
import BackgroundLayer from './components/BackgroundLayer';
import SelectionOverlay from './components/SelectionOverlay';

function App() {
  const { screens, stageSize, reloadFromLastCapture } = useScreenshotStage();

  useEffect(() => {
    let unlisten;
    (async () => {
      try {
        const win = getCurrentWebviewWindow();
        unlisten = await win.listen('screenshot:new-session', () => {
          reloadFromLastCapture();
        });
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
      <Stage width={stageSize.width} height={stageSize.height}>
        <BackgroundLayer screens={screens} />
        <SelectionOverlay stageWidth={stageSize.width} stageHeight={stageSize.height} />
      </Stage>
    </div>
  );
}

export default App;
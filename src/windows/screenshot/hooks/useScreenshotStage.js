import { useState, useCallback, useMemo } from 'react';
import { getLastScreenshotCaptures } from '@shared/api/system';
import { createStageRegionManager } from '../utils/stageRegionManager';

export default function useScreenshotStage() {
  const [screens, setScreens] = useState([]);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const stageRegionManager = useMemo(() => createStageRegionManager(screens), [screens]);

  const reloadFromLastCapture = useCallback(async () => {
    try {
      const infos = await getLastScreenshotCaptures();

      if (!infos || !infos.length) {
        return;
      }

      const windowScale = window.devicePixelRatio || 1;

      const meta = infos.map((m, index) => {
        const logicalWidth = m.physical_width / windowScale;
        const logicalHeight = m.physical_height / windowScale;
        const logicalX = m.physical_x / windowScale;
        const logicalY = m.physical_y / windowScale;
        return {
          index,
          filePath: m.file_path,
          logicalX,
          logicalY,
          logicalWidth,
          logicalHeight,
        };
      });

      const minX = Math.min(...meta.map((m) => m.logicalX));
      const minY = Math.min(...meta.map((m) => m.logicalY));
      const maxX = Math.max(...meta.map((m) => m.logicalX + m.logicalWidth));
      const maxY = Math.max(...meta.map((m) => m.logicalY + m.logicalHeight));

      const offsetX = isFinite(minX) ? minX : 0;
      const offsetY = isFinite(minY) ? minY : 0;

      const stageWidth = maxX - offsetX;
      const stageHeight = maxY - offsetY;

      setStageSize({ width: stageWidth, height: stageHeight });

      const loadedScreens = await Promise.all(
        meta.map((m) => {
          return new Promise(async (resolve, reject) => {
            try {
              const img = new window.Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                const screen = {
                  image: img,
                  x: m.logicalX - offsetX,
                  y: m.logicalY - offsetY,
                  width: m.logicalWidth,
                  height: m.logicalHeight,
                };
                resolve(screen);
              };
              img.onerror = (e) => {
                reject(e);
              };
              img.src = m.filePath;
            } catch (e) {
              reject(e);
            }
          });
        })
      );

      setScreens(loadedScreens);
    } catch (error) {
      console.error('加载截屏数据失败:', error);
    }
  }, []);

  return { screens, stageSize, stageRegionManager, reloadFromLastCapture };
}

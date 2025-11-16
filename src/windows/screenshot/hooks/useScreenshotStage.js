import { useEffect, useState, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getLastScreenshotCaptures } from '@shared/api/system';

export default function useScreenshotStage() {
  const [screens, setScreens] = useState([]);
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  const reloadFromLastCapture = useCallback(async () => {
    try {
      setScreens([]);

      const infos = await getLastScreenshotCaptures();
      if (!infos || !infos.length) {
        return;
      }

      const windowScale = window.devicePixelRatio || 1;

      const meta = infos.map((m) => {
        const logicalWidth = m.physical_width / windowScale;
        const logicalHeight = m.physical_height / windowScale;
        const logicalX = m.physical_x / windowScale;
        const logicalY = m.physical_y / windowScale;
        return {
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
          return new Promise((resolve, reject) => {
            const url = convertFileSrc(m.filePath);
            const img = new window.Image();
            img.onload = () => {
              resolve({
                image: img,
                x: m.logicalX - offsetX,
                y: m.logicalY - offsetY,
                width: m.logicalWidth,
                height: m.logicalHeight,
              });
            };
            img.onerror = reject;
            img.src = url;
          });
        })
      );

      setScreens(loadedScreens);
    } catch (error) {
      console.error('加载截屏数据失败:', error);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setStageSize((prev) => ({ ...prev }));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return { screens, stageSize, reloadFromLastCapture };
}

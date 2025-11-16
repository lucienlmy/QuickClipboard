import { useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getLastScreenshotCaptures } from '@shared/api/system';

function App() {
  const [screens, setScreens] = useState([]);
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    let isMounted = true;

    const loadFromLastCapture = async () => {
      try {
        const infos = await getLastScreenshotCaptures();
        if (!isMounted) return;

        if (!infos || !infos.length) {
          return;
        }

        try {
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

          // 根据虚拟桌面尺寸设置画布大小
          setStageSize({ width: stageWidth, height: stageHeight });
          
          // 加载所有图片
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

          if (!isMounted) return;
          setScreens(loadedScreens);
        } catch (error) {
          console.error('处理多屏截屏数据失败:', error);
        }
      } catch (error) {
        console.error('getLastScreenshotCaptures failed:', error);
      }
    };

    loadFromLastCapture();

    const handleResize = () => {
      setStageSize((prev) => ({ ...prev }));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="w-screen h-screen bg-transparent">
      <Stage width={stageSize.width} height={stageSize.height}>
        <Layer>
          {screens.map((s, idx) => (
            <KonvaImage
              key={idx}
              image={s.image}
              x={s.x}
              y={s.y}
              width={s.width}
              height={s.height}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

export default App;
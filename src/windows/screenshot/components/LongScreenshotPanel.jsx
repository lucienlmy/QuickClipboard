import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

export default function LongScreenshotPanel({
  selection,
  stageRegionManager,
  isCapturing,
  previewImage,
  capturedCount = 0,
}) {
  const panelRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [position, setPosition] = useState({ x: -9999, y: -9999 });
  const [panelHeight, setPanelHeight] = useState(0);

  // 获取面板实际高度
  useLayoutEffect(() => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPanelHeight(rect.height);
  }, [previewImage]);

  // 自动滚动到底部显示最新内容
  useEffect(() => {
    if (previewImage && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [previewImage, capturedCount]);

  useEffect(() => {
    if (!selection || panelHeight === 0) return;

    const padding = 12;
    const panelWidth = 240;

    const centerY = selection.y + selection.height / 2;
    const screen = stageRegionManager?.getNearestScreen(
      selection.x + selection.width,
      centerY
    );

    const screenBounds = screen || {
      x: 0,
      y: 0,
      width: window.innerWidth || 1920,
      height: window.innerHeight || 1080,
    };

    // 定位在选区右侧，面板底部对齐选区底部
    let x = selection.x + selection.width + padding;
    let y = selection.y + selection.height - panelHeight;

    // 如果右侧空间不够，尝试左侧
    if (x + panelWidth > screenBounds.x + screenBounds.width) {
      x = selection.x - panelWidth - padding;
    }

    // 确保不超出屏幕边界
    if (stageRegionManager) {
      const constrained = stageRegionManager.constrainRect(
        {
          x,
          y,
          width: panelWidth,
          height: panelHeight,
        },
        'move'
      );
      x = constrained.x;
      y = constrained.y;
    }

    setPosition({ x, y });
  }, [selection, stageRegionManager, panelHeight]);

  if (!selection) return null;

  return (
    <div
      ref={panelRef}
      className="absolute z-20 select-none"
      style={{ left: position.x, top: position.y }}
    >
      <div className="w-[240px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
          <i className="ti ti-capture text-sm text-gray-600 dark:text-gray-300"></i>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            长截屏预览
          </span>
        </div>

        {/* 状态栏 */}
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs">
            {isCapturing ? (
              <>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-gray-600 dark:text-gray-300">正在捕获... ({capturedCount} 帧)</span>
              </>
            ) : (
              <>
                <i className="ti ti-check text-green-500"></i>
                <span className="text-gray-500 dark:text-gray-400">
                  {capturedCount > 0 ? `已完成 ${capturedCount} 帧` : '等待开始'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 预览区域 */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 p-3 max-h-[450px] overflow-y-auto scroll-smooth"
        >
          {previewImage ? (
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              <img
                src={previewImage}
                alt="长截屏预览"
                className="w-full h-auto block"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[100px] bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className="text-center text-gray-400 dark:text-gray-500">
                <i className="ti ti-photo text-4xl mb-2 block"></i>
                <span className="text-xs">暂无预览</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

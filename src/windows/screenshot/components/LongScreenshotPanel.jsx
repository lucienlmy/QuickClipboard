import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';

export default function LongScreenshotPanel({
  selection,
  stageRegionManager,
  isCapturing,
  isSaving,
  previewImage,
  previewSize = { width: 0, height: 0 },
  capturedCount = 0,
  screens,
  getScaleForPosition,
}) {
  const panelRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const imgRef = useRef(null);
  const [position, setPosition] = useState({ x: -9999, y: -9999 });
  const [realtimeImage, setRealtimeImage] = useState('');
  const [maxPreviewHeight, setMaxPreviewHeight] = useState(300);
  const [panelHeight, setPanelHeight] = useState(200);

  const [hoverInfo, setHoverInfo] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });

  // 监听实时预览事件
  useEffect(() => {
    const unlisten = listen('long-screenshot-realtime', (event) => {
      setRealtimeImage(event.payload || '');
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    if (!isCapturing) {
      setRealtimeImage('');
    }
  }, [isCapturing]);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  // 每次帧数变化或图片变化时滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [capturedCount, previewImage, realtimeImage]);

  useEffect(() => {
    if (!panelRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPanelHeight(entry.contentRect.height);
      }
    });
    
    observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, []);

  // 计算面板位置
  useEffect(() => {
    if (!selection || !stageRegionManager) return;

    const padding = 12;
    const panelWidth = 240;

    const screen = stageRegionManager.getNearestScreen(
      selection.x + selection.width / 2,
      selection.y + selection.height / 2
    );
    if (!screen) return;

    const screenTop = screen.y + padding;
    const screenBottom = screen.y + screen.height - padding;
    const screenLeft = screen.x + padding;
    const screenRight = screen.x + screen.width - padding;

    const selectionCenterY = selection.y + selection.height / 2;

    let y = selectionCenterY - panelHeight / 2;

    y = Math.max(screenTop, Math.min(y, screenBottom - panelHeight));

    // X 位置：选区右侧，放不下则左侧
    let x = selection.x + selection.width + padding;
    if (x + panelWidth > screenRight) {
      x = selection.x - panelWidth - padding;
    }
    x = Math.max(screenLeft, x);

    setPosition({ x, y });
    if (screens && screens.length > 0) {
      const dpr = window.devicePixelRatio || 1;
      const stageOffsetX = screens[0].physicalX - screens[0].x * dpr;
      const stageOffsetY = screens[0].physicalY - screens[0].y * dpr;
      
      invoke('update_long_screenshot_preview_panel', {
        x: x * dpr + stageOffsetX,
        y: y * dpr + stageOffsetY,
        width: panelWidth * dpr,
        height: panelHeight * dpr,
      }).catch(() => { });
    }
  }, [selection, stageRegionManager, panelHeight, screens]);

  // 计算最大预览高度
  useEffect(() => {
    if (!selection || !stageRegionManager) return;

    const padding = 12;
    const headerHeight = 90;

    const screen = stageRegionManager.getNearestScreen(
      selection.x + selection.width / 2,
      selection.y + selection.height / 2
    );
    if (!screen) return;

    const screenTop = screen.y + padding;
    const screenBottom = screen.y + screen.height - padding;
    const screenAvailable = screenBottom - screenTop - headerHeight;
    
    setMaxPreviewHeight(Math.max(200, screenAvailable * 0.7));
  }, [selection, stageRegionManager]);

  const handleImageLoad = useCallback((e) => {
    scrollToBottom();
    const img = e.target;
    setImageSize({
      width: img.clientWidth,
      height: img.clientHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    });
  }, []);

  const handleMouseEnter = useCallback(async () => {
    if (isCapturing) {
      await invoke('stop_long_screenshot_capture').catch(() => { });
    }
  }, [isCapturing]);

  // 鼠标在预览图上移动
  const handleMouseMove = useCallback((e) => {
    if (!imgRef.current || !selection || imageSize.naturalHeight === 0) return;

    const rect = imgRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const scale = imageSize.naturalHeight / imageSize.height;
    const naturalY = y * scale;

    const contentWidth = selection.width - 6;
    const contentHeight = selection.height - 6;

    const imgScale = imageSize.naturalWidth / contentWidth;
    const viewportHeight = contentHeight * imgScale;

    let viewportY = naturalY - viewportHeight / 2;
    viewportY = Math.max(0, Math.min(viewportY, imageSize.naturalHeight - viewportHeight));

    setHoverInfo({ y, viewportY, viewportHeight, imgScale });

    // 边缘自动滚动
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const imgRect = rect;

      const boxScale = imageSize.height / imageSize.naturalHeight;
      const boxY = viewportY * boxScale;
      const boxHeight = viewportHeight * boxScale;
      const boxTopInContainer = imgRect.top - containerRect.top + boxY;
      const boxBottomInContainer = boxTopInContainer + boxHeight;

      const edgeThreshold = 30;
      const scrollSpeed = 8;
      
      if (boxTopInContainer < edgeThreshold) {
        container.scrollTop -= scrollSpeed;
      } else if (boxBottomInContainer > containerRect.height - edgeThreshold) {
        container.scrollTop += scrollSpeed;
      }
    }
  }, [selection, imageSize]);

  const handleMouseLeave = useCallback(async () => {
    setHoverInfo(null);
    if (isCapturing) {
      await invoke('start_long_screenshot_capture').catch(() => { });
    }
  }, [isCapturing]);
  const getViewportBoxStyle = useCallback(() => {
    if (!hoverInfo || !imageSize.naturalHeight || !imageSize.height) return null;

    const scale = imageSize.height / imageSize.naturalHeight;
    const boxHeight = hoverInfo.viewportHeight * scale;
    const boxY = hoverInfo.viewportY * scale;

    return {
      top: boxY,
      height: boxHeight,
    };
  }, [hoverInfo, imageSize]);

  const viewportBoxStyle = getViewportBoxStyle();

  const uiScale = useMemo(() => {
    if (!getScaleForPosition) return 1;
    return getScaleForPosition(position.x, position.y);
  }, [getScaleForPosition, position.x, position.y]);

  if (!selection) return null;
  const hoverPreview = hoverInfo && previewImage && selection && imageSize.naturalWidth > 0 ? (
    <div
      className="fixed overflow-hidden pointer-events-none z-50"
      style={{
        left: selection.x + 3,
        top: selection.y + 3,
        width: selection.width - 6,
        height: selection.height - 6,
        backgroundImage: `url(${previewImage})`,
        backgroundSize: `${imageSize.naturalWidth / hoverInfo.imgScale}px auto`,
        backgroundPosition: `0px ${-hoverInfo.viewportY / hoverInfo.imgScale}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }}
    />
  ) : null;

  return (
    <>
      {hoverPreview}
      <div
        ref={panelRef}
        className="absolute z-20 select-none"
        style={{ 
          left: position.x, 
          top: position.y,
          transform: `scale(${uiScale})`,
          transformOrigin: 'top left',
        }}
      >
      <div className="w-[240px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden flex flex-col relative">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
          <i className="ti ti-capture text-sm text-gray-600 dark:text-gray-300"></i>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            长截屏预览
          </span>
        </div>

        {/* 状态栏 */}
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {isSaving ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                  <span className="text-gray-600 dark:text-gray-300">正在处理中...</span>
                </>
              ) : isCapturing ? (
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
            {previewSize.width > 0 && previewSize.height > 0 && (
              <div className="text-gray-500 dark:text-gray-400">
                {previewSize.width} × {previewSize.height}
              </div>
            )}
          </div>
        </div>

        {/* 预览区域 */}
        <div
          ref={scrollContainerRef}
          className="flex-1 p-3 overflow-y-auto"
          style={{ maxHeight: maxPreviewHeight }}
        >
          {previewImage ? (
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
              {/* 主拼接图 */}
              <div className="relative">
                <img
                  ref={imgRef}
                  src={previewImage}
                  alt="长截屏预览"
                  className="w-full h-auto block"
                  draggable={false}
                  onLoad={handleImageLoad}
                  onMouseEnter={handleMouseEnter}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                />
                {viewportBoxStyle && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none border-2 border-blue-500 bg-blue-500/10"
                    style={viewportBoxStyle}
                  />
                )}
              </div>
              {/* 实时当前帧预览 */}
              {realtimeImage && (
                <div className="relative border-t-2 border-dashed border-orange-400/70 bg-orange-50/50 dark:bg-orange-900/20">
                  {/* 提示用户回滚 */}
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
                    <i className="ti ti-alert-circle text-xs"></i>
                    <span className="text-[10px]">拼接中断，请回到中断位置继续</span>
                  </div>
                  <img
                    src={realtimeImage}
                    alt="实时预览"
                    className="w-full h-auto block opacity-60"
                    draggable={false}
                    onLoad={scrollToBottom}
                  />
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-orange-500/80 rounded text-[10px] text-white">
                    待拼接
                  </div>
                </div>
              )}
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

        {/* 保存/复制中遮罩层 */}
        {isSaving && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
            <div className="text-center">
              <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin mb-2"></div>
              <span className="text-white text-sm font-medium">处理中...</span>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

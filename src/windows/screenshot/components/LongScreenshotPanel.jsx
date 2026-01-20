import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import LongScreenshotPreview from './LongScreenshotPreview';

export default function LongScreenshotPanel({
  selection,
  stageRegionManager,
  isCapturing,
  isSaving,
  wsPort,
  previewSize = { width: 0, height: 0 },
  capturedCount = 0,
  screens,
  getScaleForPosition,
  onPreviewSizeChange,
}) {
  const panelRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const imgRef = useRef(null);
  const [position, setPosition] = useState({ x: -9999, y: -9999 });
  const [realtimeData, setRealtimeData] = useState(null);
  const [maxPreviewHeight, setMaxPreviewHeight] = useState(300);
  const [panelHeight, setPanelHeight] = useState(200);
  const [hasPreview, setHasPreview] = useState(false);

  const [hoverInfo, setHoverInfo] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
  const previewCanvasRef = useRef(null);
  const largePreviewCanvasRef = useRef(null);
  const [cropMode, setCropMode] = useState(false);
  const [isUpwardStitch, setIsUpwardStitch] = useState(false);

  useEffect(() => {
    if (!isCapturing) {
      setRealtimeData(null);
    }
  }, [isCapturing]);

  useEffect(() => {
    if (capturedCount === 0) {
      setHasPreview(false);
      previewCanvasRef.current = null;
    }
  }, [capturedCount]);

  const handlePreviewImageReady = useCallback((info) => {
    previewCanvasRef.current = info;
    setHasPreview(true);
  }, []);

  const handleRealtimeData = useCallback((data) => {
    setRealtimeData(data);
  }, []);

  const handleStitchDirectionChange = useCallback((isUpward) => {
    setIsUpwardStitch(isUpward);
  }, []);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  const scrollToTop = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  // 变化时根据拼接方向滚动
  useEffect(() => {
    if (scrollContainerRef.current) {
      if (isUpwardStitch) {
        scrollToTop();
      } else {
        scrollToBottom();
      }
    }
  }, [capturedCount, realtimeData, isUpwardStitch]);

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

  const handleImageLoad = useCallback((size) => {
    setImageSize(size);
    onPreviewSizeChange?.({ width: size.naturalWidth, height: size.naturalHeight });
  }, [onPreviewSizeChange]);

  const handleMouseEnter = useCallback(async () => {
    if (isCapturing && !cropMode) {
      await invoke('stop_long_screenshot_capture').catch(() => { });
    }
  }, [isCapturing, cropMode]);

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

    if (!cropMode && scrollContainerRef.current) {
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
  }, [selection, imageSize, cropMode]);

  const handleMouseLeave = useCallback(async () => {
    if (!cropMode) {
      setHoverInfo(null);
      if (isCapturing) {
        await invoke('start_long_screenshot_capture').catch(() => { });
      }
    }
  }, [isCapturing, cropMode]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    if (!hasPreview || imageSize.naturalHeight === 0 || !hoverInfo) return;
    
    setCropMode(true);
  }, [hasPreview, imageSize.naturalHeight, hoverInfo]);

  const handleCropTop = useCallback(async (e) => {
    e.stopPropagation();
    if (!hoverInfo) return;
    
    const cropHeight = Math.round(hoverInfo.viewportY);
    
    try {
      await invoke('crop_long_screenshot_from_top', { height: cropHeight });
      setCropMode(false);
    } catch (error) {
      console.error('裁剪失败:', error);
    }
  }, [hoverInfo]);

  const handleCropBottom = useCallback(async (e) => {
    e.stopPropagation();
    if (!hoverInfo) return;
    
    const cropHeight = Math.round(imageSize.naturalHeight - (hoverInfo.viewportY + hoverInfo.viewportHeight));
    
    try {
      await invoke('crop_long_screenshot_from_bottom', { height: cropHeight });
      setCropMode(false);
    } catch (error) {
      console.error('裁剪失败:', error);
    }
  }, [hoverInfo, imageSize]);

  const handleCropCancel = useCallback(() => {
    setCropMode(false);
  }, []);
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

  useEffect(() => {
    if (!hoverInfo || !previewCanvasRef.current || !largePreviewCanvasRef.current) return;
    
    const info = previewCanvasRef.current;
    if (!info || !info.data || info.width === 0 || info.height === 0) return;
    
    const destCanvas = largePreviewCanvasRef.current;
    const ctx = destCanvas.getContext('2d');
    if (!ctx) return;

    const srcY = Math.round(hoverInfo.viewportY);
    const srcHeight = Math.round(hoverInfo.viewportHeight);
    const srcWidth = info.width;

    destCanvas.width = srcWidth;
    destCanvas.height = srcHeight;

    const startByte = srcY * srcWidth * 4;
    const byteLength = srcHeight * srcWidth * 4;
    
    if (startByte + byteLength <= info.data.length) {
      const imageData = new ImageData(
        new Uint8ClampedArray(info.data.buffer, info.data.byteOffset + startByte, byteLength),
        srcWidth,
        srcHeight
      );
      ctx.putImageData(imageData, 0, 0);
    }
  }, [hoverInfo]);
  
  const hoverPreview = hoverInfo && previewCanvasRef.current && selection && imageSize.naturalWidth > 0 ? (
    <div
      className="fixed overflow-hidden pointer-events-none z-50"
      style={{
        left: selection.x + 3,
        top: selection.y + 3,
        width: selection.width - 6,
        height: selection.height - 6,
      }}
    >
      <canvas
        ref={largePreviewCanvasRef}
        style={{
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  ) : null;

  // 实时帧渲染组件
  const RealtimePreview = realtimeData ? (
    <div className="relative border-t-2 border-dashed border-orange-400/70 bg-orange-50/50 dark:bg-orange-900/20">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400">
        <i className="ti ti-alert-circle text-xs"></i>
        <span className="text-[10px]">拼接中断，请回到中断位置继续</span>
      </div>
      <RealtimeCanvas data={realtimeData} />
      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-orange-500/80 rounded text-[10px] text-white">
        待拼接
      </div>
    </div>
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
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
          <i className="ti ti-capture text-sm text-gray-600 dark:text-gray-300"></i>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            长截屏预览
          </span>
        </div>

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

        <div
          ref={scrollContainerRef}
          className="flex-1 p-3 overflow-y-auto"
          style={{ maxHeight: maxPreviewHeight }}
        >
          {wsPort && (
            <div className={`bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden ${hasPreview ? '' : 'hidden'}`}>
              <div className="relative" ref={imgRef}>
                <LongScreenshotPreview
                  wsPort={wsPort}
                  onLoad={handleImageLoad}
                  onMouseEnter={handleMouseEnter}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onContextMenu={handleContextMenu}
                  onImageReady={handlePreviewImageReady}
                  onRealtimeData={handleRealtimeData}
                  onStitchDirectionChange={handleStitchDirectionChange}
                />
                {viewportBoxStyle && !cropMode && (
                  <div
                    className="absolute left-0 right-0 pointer-events-none border-2 border-blue-500 bg-blue-500/10"
                    style={viewportBoxStyle}
                  />
                )}
                {viewportBoxStyle && cropMode && (
                  <div
                    className="absolute left-0 right-0 pointer-events-auto"
                    style={viewportBoxStyle}
                  >
                    <div
                      className="absolute left-0 right-0 top-0 h-1/2 cursor-pointer border-2 border-red-500 bg-red-500/30 hover:bg-red-500/50 flex items-center justify-center transition-all"
                      onClick={handleCropTop}
                      onContextMenu={(e) => { e.preventDefault(); handleCropCancel(); }}
                    >
                      <div className="text-white text-[10px] font-semibold bg-red-600/90 px-1.5 py-0.5 rounded pointer-events-none">
                        <i className="ti ti-cut mr-0.5"></i>
                        裁剪上方
                      </div>
                    </div>
                    <div
                      className="absolute left-0 right-0 bottom-0 h-1/2 cursor-pointer border-2 border-red-500 bg-red-500/30 hover:bg-red-500/50 flex items-center justify-center transition-all"
                      onClick={handleCropBottom}
                      onContextMenu={(e) => { e.preventDefault(); handleCropCancel(); }}
                    >
                      <div className="text-white text-[10px] font-semibold bg-red-600/90 px-1.5 py-0.5 rounded pointer-events-none">
                        <i className="ti ti-cut mr-0.5"></i>
                        裁剪下方
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {RealtimePreview}
            </div>
          )}
          {!hasPreview && (
            <div className="flex items-center justify-center h-full min-h-[100px] bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className="text-center text-gray-400 dark:text-gray-500">
                <i className="ti ti-photo text-4xl mb-2 block"></i>
                <span className="text-xs">暂无预览</span>
              </div>
            </div>
          )}
        </div>

        {hasPreview && (
          <div className="px-3 pb-2 pt-1 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
            <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed space-y-0.5 text-center">
              <div className="flex items-center justify-center gap-1">
                <i className="ti ti-hand-move text-xs"></i>
                <span>鼠标悬停进行预览</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <i className="ti ti-click text-xs"></i>
                <span>鼠标右键进行裁剪</span>
              </div>
            </div>
          </div>
        )}

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

// 实时帧 Canvas 渲染
function RealtimeCanvas({ data }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = data.width;
    canvas.height = data.height;

    const imageData = new ImageData(
      new Uint8ClampedArray(data.data.buffer, data.data.byteOffset, data.data.length),
      data.width,
      data.height
    );
    ctx.putImageData(imageData, 0, 0);
  }, [data]);

  if (!data) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
      }}
    />
  );
}

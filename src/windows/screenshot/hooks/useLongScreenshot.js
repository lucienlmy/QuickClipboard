import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { cancelScreenshotSession } from '@shared/api/system';
//长截屏模式管理 Hook
export default function useLongScreenshot(selection, screens, stageRegionManager) {
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [wsPort, setWsPort] = useState(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [capturedCount, setCapturedCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [autoScrollDirection, setAutoScrollDirection] = useState(null);

  // 进入长截屏模式
  const enter = useCallback(async (toolbarPosition) => {
    setIsActive(true);
    setIsCapturing(false);
    setWsPort(null);
    setPreviewSize({ width: 0, height: 0 });

    // 启用后端鼠标穿透控制
    if (selection && toolbarPosition && screens && screens.length > 0) {
      try {
        const centerX = selection.x + selection.width / 2;
        const centerY = selection.y + selection.height / 2;
        const screen = stageRegionManager?.getNearestScreen(centerX, centerY);
        
        if (!screen) return;
        
        const scaleX = screen.physicalWidth / screen.width;
        const scaleY = screen.physicalHeight / screen.height;
        
        const relX = selection.x - screen.x;
        const relY = selection.y - screen.y;
        
        const border = 3;
        const contentRelX = relX + border;
        const contentRelY = relY + border;
        const contentWidth = selection.width - border * 2;
        const contentHeight = selection.height - border * 2;
        
        const physicalX = screen.physicalX + Math.round(contentRelX * scaleX);
        const physicalY = screen.physicalY + Math.round(contentRelY * scaleY);
        const physicalWidth = Math.round(contentWidth * scaleX);
        const physicalHeight = Math.round(contentHeight * scaleY);
        
        const toolbarRelX = toolbarPosition.x - screen.x;
        const toolbarRelY = toolbarPosition.y - screen.y;
        const physicalToolbarX = screen.physicalX + Math.round(toolbarRelX * scaleX);
        const physicalToolbarY = screen.physicalY + Math.round(toolbarRelY * scaleY);
        const physicalToolbarWidth = Math.round(toolbarPosition.width * scaleX);
        const physicalToolbarHeight = Math.round(toolbarPosition.height * scaleY);
        
        const port = await invoke('enable_long_screenshot_passthrough', {
          physicalX,
          physicalY,
          physicalWidth,
          physicalHeight,
          physicalToolbarX,
          physicalToolbarY,
          physicalToolbarWidth,
          physicalToolbarHeight,
          selectionScaleFactor: scaleX,
        });

        if (port) {
          setWsPort(port);
        }
      } catch (err) {
        console.error('启用鼠标穿透失败:', err);
      }
    }
  }, [selection, screens, stageRegionManager]);

  // 开始捕获
  const start = useCallback(async () => {
    try {
      await invoke('start_long_screenshot_capture');
      setIsCapturing(true);
      setCapturedCount(0);
    } catch (err) {
      console.error('开始捕获失败:', err);
    }
  }, []);

  // 停止捕获
  const stop = useCallback(async () => {
    try {
      await invoke('stop_long_screenshot_capture');
      setIsCapturing(false);
      if (isAutoScrolling && autoScrollDirection) {
        await invoke('long_screenshot_auto_scroll', { direction: autoScrollDirection });
        setIsAutoScrolling(false);
        setAutoScrollDirection(null);
      }
    } catch (err) {
      console.error('停止捕获失败:', err);
    }
  }, [isAutoScrolling, autoScrollDirection]);

  // 停止自动滚动
  const stopAutoScroll = useCallback(async () => {
    if (!isAutoScrolling || !autoScrollDirection) return;
    try {
      await invoke('long_screenshot_auto_scroll', { direction: autoScrollDirection });
    } catch (e) {
      console.error('停止自动滚动失败:', e);
    }
    setIsAutoScrolling(false);
    setAutoScrollDirection(null);
  }, [isAutoScrolling, autoScrollDirection]);

  // 开始自动滚动
  const startAutoScroll = useCallback(async (direction) => {
    setIsAutoScrolling(true);
    setAutoScrollDirection(direction);
    try {
      await invoke('long_screenshot_auto_scroll', { direction });
    } catch (e) {
      console.error('启动自动滚动失败:', e);
      setIsAutoScrolling(false);
      setAutoScrollDirection(null);
    }
  }, []);

  // 切换自动滚动
  const toggleAutoScroll = useCallback((direction) => {
    if (isAutoScrolling && autoScrollDirection === direction) {
      stopAutoScroll();
    } else {
      startAutoScroll(direction);
    }
  }, [isAutoScrolling, autoScrollDirection, startAutoScroll, stopAutoScroll]);

  // 复制到剪贴板
  const copyToClipboard = useCallback(async () => {
    try {
      if (capturedCount === 0) {
        alert('没有捕获的内容');
        return;
      }

      if (isCapturing) {
        await invoke('stop_long_screenshot_capture');
        setIsCapturing(false);
      }

      setIsSaving(true);

      await invoke('copy_long_screenshot_to_clipboard');

      setIsSaving(false);
      setIsActive(false);
      setWsPort(null);
      setCapturedCount(0);

      await invoke('disable_long_screenshot_passthrough');
      await cancelScreenshotSession();
    } catch (err) {
      console.error('复制失败:', err);
      alert(`复制失败: ${err}`);
      setIsSaving(false);
    }
  }, [capturedCount, isCapturing]);

  // 保存长截屏
  const saveScreenshot = useCallback(async () => {
    try {
      if (capturedCount === 0) {
        alert('没有捕获的内容');
        return;
      }

      if (isCapturing) {
        await invoke('stop_long_screenshot_capture');
        setIsCapturing(false);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultPath = `long-screenshot-${timestamp}.png`;
      
      const filePath = await saveFileDialog({
        title: '保存长截屏',
        defaultPath,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      
      if (!filePath) {
        return;
      }
    
      setIsSaving(true);
      
      await invoke('save_long_screenshot', { path: filePath });
      
      setIsSaving(false);
      setIsActive(false);
      setWsPort(null);
      setCapturedCount(0);
      
      await invoke('disable_long_screenshot_passthrough');
      await cancelScreenshotSession();
    } catch (err) {
      console.error('保存失败:', err);
      alert(`保存失败: ${err}`);
      setIsSaving(false);
    }
  }, [capturedCount, isCapturing]);

  const resetState = useCallback(() => {
    setIsCapturing(false);
    setIsAutoScrolling(false);
    setAutoScrollDirection(null);
    setCapturedCount(0);
  }, []);

  // 取消长截屏
  const cancel = useCallback(async () => {
    try {
      await invoke('disable_long_screenshot_passthrough');
      setIsActive(false);
      setWsPort(null);
      resetState();
    } catch (err) {
      console.error('取消失败:', err);
    }
  }, [resetState]);

  // 重置长截屏
  const reset = useCallback(async () => {
    try {
      await invoke('reset_long_screenshot');
      resetState();
    } catch (err) {
      console.error('重置失败:', err);
    }
  }, [resetState]);

  // 监听后端事件
  useEffect(() => {
    if (!isActive) return;

    const appWindow = getCurrentWebviewWindow();
    
    const unlistenProgress = appWindow.listen('long-screenshot-progress', (event) => {
      setCapturedCount(event.payload);
    });

    return () => {
      unlistenProgress.then(fn => fn());
    };
  }, [isActive]);

  const updatePreviewSize = useCallback((size) => {
    setPreviewSize(size);
  }, []);

  return {
    isActive,
    isCapturing,
    isSaving,
    isAutoScrolling,
    autoScrollDirection,
    wsPort,
    previewSize,
    capturedCount,
    enter,
    start,
    stop,
    copy: copyToClipboard,
    save: saveScreenshot,
    cancel,
    reset,
    toggleAutoScroll,
    updatePreviewSize,
  };
}

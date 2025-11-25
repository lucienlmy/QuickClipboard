import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { cancelScreenshotSession } from '@shared/api/system';
//长截屏模式管理 Hook
export default function useLongScreenshot(selection, screens, stageRegionManager) {
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [capturedCount, setCapturedCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // 进入长截屏模式
  const enter = useCallback(async (toolbarPosition) => {
    setIsActive(true);
    setIsCapturing(false);
    setPreview(null);
    
    // 启用后端鼠标穿透控制
    if (selection && toolbarPosition && screens && screens.length > 0) {
      try {
        const scale = window.devicePixelRatio || 1;
        const stageOffsetX = screens[0].physicalX / scale - screens[0].x;
        const stageOffsetY = screens[0].physicalY / scale - screens[0].y;
        
        const centerX = selection.x + selection.width / 2;
        const centerY = selection.y + selection.height / 2;
        const selectionScaleFactor = stageRegionManager?.getNearestScreen(centerX, centerY)?.scaleFactor || 1.0;
        
        const physicalX = (selection.x + stageOffsetX) * scale;
        const physicalY = (selection.y + stageOffsetY) * scale;
        const physicalWidth = selection.width * scale;
        const physicalHeight = selection.height * scale;
        
        const physicalToolbarX = (toolbarPosition.x + stageOffsetX) * scale;
        const physicalToolbarY = (toolbarPosition.y + stageOffsetY) * scale;
        const physicalToolbarWidth = toolbarPosition.width * scale;
        const physicalToolbarHeight = toolbarPosition.height * scale;
        
        await invoke('enable_long_screenshot_passthrough', {
          physicalX,
          physicalY,
          physicalWidth,
          physicalHeight,
          physicalToolbarX,
          physicalToolbarY,
          physicalToolbarWidth,
          physicalToolbarHeight,
          selectionScaleFactor,
        });
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
    } catch (err) {
      console.error('停止捕获失败:', err);
    }
  }, []);

  // 保存长截屏
  const saveScreenshot = useCallback(async () => {
    try {
      if (capturedCount === 0) {
        alert('没有捕获的内容');
        return;
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
    
      // 如果正在捕获，先停止
      if (isCapturing) {
        await invoke('stop_long_screenshot_capture');
        setIsCapturing(false);
      }
    
      // 显示保存中状态
      setIsSaving(true);
      
      // 保存文件
      await invoke('save_long_screenshot', { path: filePath });
      
      // 保存后关闭界面
      setIsSaving(false);
      setIsActive(false);
      setPreview(null);
      setCapturedCount(0);
      
      await invoke('disable_long_screenshot_passthrough');
      await cancelScreenshotSession();
    } catch (err) {
      console.error('保存失败:', err);
      alert(`保存失败: ${err}`);
      setIsSaving(false);
    }
  }, [capturedCount, isCapturing]);

  // 取消长截屏
  const cancel = useCallback(async () => {
    try {
      if (isCapturing) {
        await invoke('stop_long_screenshot_capture');
      }
      
      setIsActive(false);
      setIsCapturing(false);
      setPreview(null);
      setCapturedCount(0);
      
      await invoke('disable_long_screenshot_passthrough');
    } catch (err) {
      console.error('取消失败:', err);
    }
  }, [isCapturing]);

  // 监听后端进度和预览事件
  useEffect(() => {
    if (!isActive) return;

    const appWindow = getCurrentWebviewWindow();
    
    const unlistenProgress = appWindow.listen('long-screenshot-progress', (event) => {
      const count = event.payload;
      setCapturedCount(count);
    });

    const unlistenPreview = appWindow.listen('long-screenshot-preview', (event) => {
      const previewUrl = event.payload;
      setPreview(previewUrl);
    });

    return () => {
      unlistenProgress.then(fn => fn());
      unlistenPreview.then(fn => fn());
    };
  }, [isActive]);

  return {
    isActive,
    isCapturing,
    isSaving,
    preview,
    capturedCount,
    enter,
    start,
    stop,
    save: saveScreenshot,
    cancel,
  };
}

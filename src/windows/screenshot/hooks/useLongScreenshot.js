import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { cancelScreenshotSession } from '@shared/api/system';
//长截屏模式管理 Hook
export default function useLongScreenshot(selection) {
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [capturedCount, setCapturedCount] = useState(0);

  // 进入长截屏模式
  const enter = useCallback(async () => {
    setIsActive(true);
    setIsCapturing(false);
    setPreview(null);
    
    // 启用后端鼠标穿透控制
    if (selection) {
      try {
        await invoke('enable_long_screenshot_passthrough', {
          x: selection.x,
          y: selection.y,
          width: selection.width,
          height: selection.height,
        });
      } catch (err) {
        console.error('启用鼠标穿透失败:', err);
      }
    }
  }, [selection]);

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
    
      setIsActive(false);
      setPreview(null);
      setCapturedCount(0);
      
      await invoke('disable_long_screenshot_passthrough');
      await cancelScreenshotSession();
      
      invoke('save_long_screenshot', { path: filePath })
        .then(() => {
          console.log('长截图保存成功:', filePath);
        })
        .catch((err) => {
          console.error('保存失败:', err);
          alert(`保存失败: ${err}`);
        });
    } catch (err) {
      console.error('保存失败:', err);
      alert(`保存失败: ${err}`);
    }
  }, [capturedCount]);

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
    preview,
    capturedCount,
    enter,
    start,
    stop,
    save: saveScreenshot,
    cancel,
  };
}

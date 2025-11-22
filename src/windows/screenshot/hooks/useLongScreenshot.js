import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

//长截屏模式管理 Hook
export default function useLongScreenshot(selection) {
  const [isActive, setIsActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [preview, setPreview] = useState(null);

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
  const start = useCallback(() => {
    setIsCapturing(true);
    console.log('开始长截屏捕获');
  }, []);

  // 停止捕获
  const stop = useCallback(() => {
    setIsCapturing(false);
    console.log('停止长截屏捕获');
  }, []);

  // 保存长截屏
  const save = useCallback(async () => {
    console.log('保存长截屏');
    setIsActive(false);
    setPreview(null);
    
    // 禁用后端鼠标穿透控制
    try {
      await invoke('disable_long_screenshot_passthrough');
    } catch (err) {
      console.error('禁用鼠标穿透失败:', err);
    }
  }, []);

  // 取消长截屏
  const cancel = useCallback(async () => {
    setIsActive(false);
    setIsCapturing(false);
    setPreview(null);
    console.log('取消长截屏');
    
    // 禁用后端鼠标穿透控制
    try {
      await invoke('disable_long_screenshot_passthrough');
    } catch (err) {
      console.error('禁用鼠标穿透失败:', err);
    }
  }, []);

  return {
    isActive,
    isCapturing,
    preview,
    enter,
    start,
    stop,
    save,
    cancel,
  };
}

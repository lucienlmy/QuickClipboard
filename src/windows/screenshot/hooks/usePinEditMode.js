// 贴图编辑模式 Hook

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export function usePinEditMode() {
  const [isPinEditMode, setIsPinEditMode] = useState(false);
  const [pinEditData, setPinEditData] = useState(null);
  const [pinImage, setPinImage] = useState(null);
  const [screenInfos, setScreenInfos] = useState([]);
  const [isChecking, setIsChecking] = useState(true); 

  // 加载贴图图片
  const loadPinImage = useCallback(async (imagePath) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      import('@tauri-apps/api/core').then(({ convertFileSrc }) => {
        img.src = convertFileSrc(imagePath, 'asset');
      });
    });
  }, []);

  // 退出编辑模式
  const exitPinEditMode = useCallback(async () => {
    try {
      await invoke('cancel_pin_edit');
      await invoke('clear_pin_edit_mode');
      
      const { cancelScreenshotSession } = await import('@shared/api/system');
      await cancelScreenshotSession();
    } catch (error) {
      console.error('退出贴图编辑模式失败:', error);
    }
    setIsPinEditMode(false);
    setPinEditData(null);
    setPinImage(null);
  }, []);

  // 确认编辑
  const confirmPinEdit = useCallback(async (newFilePath) => {
    try {
      await invoke('confirm_pin_edit', { newFilePath });
      await invoke('clear_pin_edit_mode');
      
      const { cancelScreenshotSession } = await import('@shared/api/system');
      await cancelScreenshotSession();
    } catch (error) {
      console.error('确认贴图编辑失败:', error);
    }
    setIsPinEditMode(false);
    setPinEditData(null);
    setPinImage(null);
  }, []);

  const calculateSelection = useCallback((data, image) => {
    if (!data || !image) return null;
    
    const windowDpr = window.devicePixelRatio || 1;
    
    const imagePhysicalWidth = image.naturalWidth || image.width;
    const imagePhysicalHeight = image.naturalHeight || image.height;
    
    return {
      x: data.x / windowDpr,
      y: data.y / windowDpr,
      width: imagePhysicalWidth / windowDpr,
      height: imagePhysicalHeight / windowDpr,
      physicalWidth: imagePhysicalWidth,
      physicalHeight: imagePhysicalHeight,
    };
  }, []);

  const passthroughIntervalRef = useRef(null);

  // 启动穿透控制
  const startPassthrough = useCallback(async (selection) => {
    if (!selection) return;
    
    const dpr = window.devicePixelRatio || 1;
    
    const updateRects = async () => {
      const rects = [];
      
      rects.push([
        selection.x * dpr,
        selection.y * dpr,
        selection.width * dpr,
        selection.height * dpr,
      ]);
      
      const toolbar = document.querySelector('[data-toolbar="selection"]');
      if (toolbar) {
        const rect = toolbar.getBoundingClientRect();
        rects.push([rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr]);
      }
      
      const paramPanel = document.querySelector('[data-panel="tool-parameter"]');
      if (paramPanel) {
        const rect = paramPanel.getBoundingClientRect();
        rects.push([rect.left * dpr, rect.top * dpr, rect.width * dpr, rect.height * dpr]);
      }
      
      try {
        await invoke('update_pin_edit_passthrough_rects', { rects });
      } catch (error) {
        console.error('更新穿透区域失败:', error);
      }
    };
    
    const initRects = [[
      selection.x * dpr,
      selection.y * dpr,
      selection.width * dpr,
      selection.height * dpr,
    ]];
    
    try {
      await invoke('enable_pin_edit_passthrough', { rects: initRects });
    } catch (error) {
      console.error('启用穿透控制失败:', error);
    }
    
    passthroughIntervalRef.current = setInterval(updateRects, 100);
  }, []);

  // 停止穿透控制
  const stopPassthrough = useCallback(() => {
    if (passthroughIntervalRef.current) {
      clearInterval(passthroughIntervalRef.current);
      passthroughIntervalRef.current = null;
    }
  }, []);

  // 监听编辑模式事件
  useEffect(() => {
    let unlisten;
    let mounted = true;

    const handleEnterPinEditMode = async () => {
      try {
        const data = await invoke('get_pin_edit_mode_data');
        if (data && mounted) {
          const [image, screens] = await Promise.all([
            loadPinImage(data.image_path),
            invoke('get_all_screens'),
          ]);
          if (mounted) {
            setPinEditData(data);
            setPinImage(image);
            setScreenInfos(screens);
            setIsPinEditMode(true);
          }
        }
      } catch (error) {
        console.error('进入贴图编辑模式失败:', error);
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    };

    (async () => {
      try {
        const win = getCurrentWebviewWindow();
        unlisten = await win.listen('screenshot:pin-edit-mode', async () => {
          setIsChecking(true);
          await handleEnterPinEditMode();
        });

        await handleEnterPinEditMode();
      } catch (err) {
        console.error('监听 pin-edit-mode 事件失败:', err);
        if (mounted) {
          setIsChecking(false);
        }
      }
    })();

    return () => {
      mounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [loadPinImage]);

  return {
    isPinEditMode,
    isChecking,
    pinEditData,
    pinImage,
    screenInfos,
    calculateSelection,
    exitPinEditMode,
    confirmPinEdit,
    startPassthrough,
    stopPassthrough,
  };
}

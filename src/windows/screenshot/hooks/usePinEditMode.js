// 贴图编辑模式 Hook

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export function usePinEditMode() {
  const [isPinEditMode, setIsPinEditMode] = useState(false);
  const [pinEditData, setPinEditData] = useState(null);
  const [pinImage, setPinImage] = useState(null);          
  const [originalImage, setOriginalImage] = useState(null);
  const [initialShapes, setInitialShapes] = useState(null);
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
      if (pinEditData?.window_label?.startsWith('native-pin-')) {
        const windowId = parseInt(pinEditData.window_label.replace('native-pin-', ''), 10);
        await invoke('cancel_native_pin_edit', { windowId });
      } else {
        await invoke('cancel_pin_edit');
      }
      await invoke('clear_pin_edit_mode');
      
      const { cancelScreenshotSession } = await import('@shared/api/system');
      await cancelScreenshotSession();
    } catch (error) {
      console.error('退出贴图编辑模式失败:', error);
    }
    setIsPinEditMode(false);
    setPinEditData(null);
    setPinImage(null);
    setOriginalImage(null);
    setInitialShapes(null);
  }, [pinEditData]);

  // 确认编辑
  const confirmPinEdit = useCallback(async (newFilePath, editDataJson) => {
    try {
      if (pinEditData?.window_label?.startsWith('native-pin-')) {
        const windowId = parseInt(pinEditData.window_label.replace('native-pin-', ''), 10);
        await invoke('confirm_native_pin_edit', {
          windowId,
          newFilePath,
          originalImagePath: pinEditData.original_image_path || null,
          editData: editDataJson || null,
        });
        await new Promise(r => setTimeout(r, 150));
      } else {
        await invoke('confirm_pin_edit', {
          newFilePath,
          editDataJson: editDataJson || null,
        });
      }
      await invoke('clear_pin_edit_mode');

      const { cancelScreenshotSession } = await import('@shared/api/system');
      await cancelScreenshotSession();
    } catch (error) {
      console.error('确认贴图编辑失败:', error);
    }
    setIsPinEditMode(false);
    setPinEditData(null);
    setPinImage(null);
    setOriginalImage(null);
    setInitialShapes(null);
  }, [pinEditData]);

  const calculateSelection = useCallback((data, image) => {
    if (!data || !image) return null;
    
    const dpr = window.devicePixelRatio || 1;
    return {
      x: data.x / dpr,
      y: data.y / dpr,
      width: data.width / dpr,
      height: data.height / dpr,
      physicalWidth: data.width,
      physicalHeight: data.height,
      scaleFactor: data.scale_factor || 1,
    };
  }, []);

  const passthroughIntervalRef = useRef(null);

  // 启动穿透控制
  const startPassthrough = useCallback(async (selection, offset = { x: 0, y: 0 }) => {
    if (!selection) return;
    
    const dpr = window.devicePixelRatio || 1;
    
    const updateRects = async () => {
      const rects = [];
      
      rects.push([
        selection.x * dpr + offset.x,
        selection.y * dpr + offset.y,
        selection.width * dpr,
        selection.height * dpr,
      ]);
      
      const toolbar = document.querySelector('[data-toolbar="selection"]');
      if (toolbar) {
        const rect = toolbar.getBoundingClientRect();
        rects.push([rect.left * dpr + offset.x, rect.top * dpr + offset.y, rect.width * dpr, rect.height * dpr]);
      }
      
      const paramPanel = document.querySelector('[data-panel="tool-parameter"]');
      if (paramPanel) {
        const rect = paramPanel.getBoundingClientRect();
        rects.push([rect.left * dpr + offset.x, rect.top * dpr + offset.y, rect.width * dpr, rect.height * dpr]);
      }
      
      try {
        await invoke('update_pin_edit_passthrough_rects', { rects });
      } catch (error) {
        console.error('更新穿透区域失败:', error);
      }
    };
    
    const initRects = [[
      selection.x * dpr + offset.x,
      selection.y * dpr + offset.y,
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
          const hasOriginalImage = !!data.original_image_path;
          
          const imageToLoad = hasOriginalImage ? data.original_image_path : data.image_path;
          
          const [image, screens] = await Promise.all([
            loadPinImage(imageToLoad),
            invoke('get_all_screens'),
          ]);
          
          let origImage = null;
          if (hasOriginalImage) {
            origImage = image;
          }
          
          let shapes = null;
          if (data.edit_data) {
            try {
              shapes = JSON.parse(data.edit_data);
            } catch (e) {
              console.error('解析编辑数据失败:', e);
            }
          }
          
          if (mounted) {
            setPinEditData(data);
            setPinImage(image);
            setOriginalImage(origImage);
            setInitialShapes(shapes);
            setScreenInfos(screens);
            setIsPinEditMode(true);
            const { emit } = await import('@tauri-apps/api/event');
            emit('pin-edit-ready');
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

        handleEnterPinEditMode();
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
    originalImage,    
    initialShapes,    
    screenInfos,
    calculateSelection,
    exitPinEditMode,
    confirmPinEdit,
    startPassthrough,
    stopPassthrough,
  };
}

// 贴图编辑模式 Hook

import { useState, useCallback, useEffect } from 'react';
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
  const exitPinEditMode = useCallback(async (restorePin = true) => {
    const data = pinEditData;
    try {
      await invoke('clear_pin_edit_mode');

      if (restorePin && data) {
        const scaleFactor = data.scale_factor || 1;
        const logicalWidth = Math.round(data.width / scaleFactor);
        const logicalHeight = Math.round(data.height / scaleFactor);
        
        await invoke('pin_image_from_file', {
          filePath: data.image_path,
          x: data.x,
          y: data.y,
          width: logicalWidth,
          height: logicalHeight,
        });
      }
      
      const { cancelScreenshotSession } = await import('@shared/api/system');
      await cancelScreenshotSession();
    } catch (error) {
      console.error('退出贴图编辑模式失败:', error);
    }
    setIsPinEditMode(false);
    setPinEditData(null);
    setPinImage(null);
  }, [pinEditData]);

  const calculateSelection = useCallback((data, image) => {
    if (!data) return null;
    
    const dpr = window.devicePixelRatio || 1;
    
    const imgWidth = image?.naturalWidth || data.width;
    const imgHeight = image?.naturalHeight || data.height;
    
    return {
      x: data.x / dpr,
      y: data.y / dpr,
      width: imgWidth / dpr,
      height: imgHeight / dpr,
    };
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
  };
}

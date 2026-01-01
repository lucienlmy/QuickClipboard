import { useState, useCallback, useEffect, useMemo } from 'react';

const MIN_SCALE = 0.5;
const MAX_SCALE = 2;
const SCALE_STEP = 0.1;
const STORAGE_KEY_SCALE = 'screenshot_ui_scale';
const STORAGE_KEY_LOCKED = 'screenshot_ui_scale_locked';

export default function useUIScale(stageRegionManager) {
  const [isLocked, setIsLocked] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_LOCKED) === 'true';
  });

  const [baseScale, setBaseScale] = useState(() => {
    const locked = localStorage.getItem(STORAGE_KEY_LOCKED) === 'true';
    if (locked) {
      const saved = localStorage.getItem(STORAGE_KEY_SCALE);
      return saved ? parseFloat(saved) : 1;
    }
    return 1;
  });

  const baseScaleFactor = useMemo(() => {
    if (!stageRegionManager) return 1;
    const screens = stageRegionManager.getScreens?.() || [];
    return screens[0]?.scaleFactor || 1;
  }, [stageRegionManager]);

  const getScaleForPosition = useCallback((x, y) => {
    if (!stageRegionManager) {
      return baseScale;
    }
    
    const screen = stageRegionManager.getNearestScreen(x, y);
    if (!screen || !screen.scaleFactor) {
      return baseScale;
    }
    
    const relativeScale = screen.scaleFactor / baseScaleFactor;
    return Math.round(baseScale * relativeScale * 10) / 10;
  }, [baseScale, baseScaleFactor, stageRegionManager]);

  // Ctrl+滚轮缩放
  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey) return false;
    
    e.preventDefault();
    e.stopPropagation();
    
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    setBaseScale(prev => {
      const newScale = Math.round((prev + delta) * 10) / 10;
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    });
    
    return true;
  }, []);

  // 重置缩放
  const resetScale = useCallback(() => {
    setBaseScale(1);
  }, []);

  // 切换锁定状态
  const toggleLock = useCallback(() => {
    setIsLocked(prev => !prev);
  }, []);

  // 保存锁定状态
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LOCKED, isLocked.toString());
  }, [isLocked]);

  useEffect(() => {
    if (isLocked) {
      localStorage.setItem(STORAGE_KEY_SCALE, baseScale.toString());
    } else {
      localStorage.removeItem(STORAGE_KEY_SCALE);
    }
  }, [baseScale, isLocked]);

  // 监听全局滚轮事件
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey) {
        handleWheel(e);
      }
    };
    
    window.addEventListener('wheel', handler, { passive: false });
    return () => window.removeEventListener('wheel', handler);
  }, [handleWheel]);

  return {
    scale: baseScale, 
    getScaleForPosition, 
    resetScale,
    isLocked,
    toggleLock,
  };
}

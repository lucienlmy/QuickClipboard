//自动选择功能 Hook

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  subscribe as subscribeAutoSelection,
  getCurrentHierarchy,
} from '../utils/autoSelectionManager';
import { lerpRect } from '../utils/selectionOperations';
import { AUTO_SELECTION_ANIMATION_DURATION } from '../constants/selectionConstants';

export function useAutoSelection(isInteracting) {
  const [hierarchy, setHierarchy] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animatedAutoSelectionRect, setAnimatedAutoSelectionRect] = useState(null);
  const autoAnimationFrameRef = useRef(null);
  const autoAnimationStartRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeAutoSelection((hier) => {
      if (isInteracting) {
        return;
      }

      if (!hier || !Array.isArray(hier.hierarchy) || hier.hierarchy.length === 0) {
        setHierarchy([]);
        setCurrentIndex(0);
        return;
      }

      setHierarchy(hier.hierarchy);
      setCurrentIndex(0);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [isInteracting]);

  const autoSelectionRect = useMemo(() => {
    if (!hierarchy || hierarchy.length === 0) return null;
    
    const b = hierarchy[currentIndex];
    if (!b || b.width <= 0 || b.height <= 0) return null;

    const scale = window.devicePixelRatio || 1;
    return {
      x: b.x / scale,
      y: b.y / scale,
      width: b.width / scale,
      height: b.height / scale,
    };
  }, [hierarchy, currentIndex]);

  useEffect(() => {
    if (autoAnimationFrameRef.current) {
      cancelAnimationFrame(autoAnimationFrameRef.current);
      autoAnimationFrameRef.current = null;
    }

    if (!autoSelectionRect) {
      setAnimatedAutoSelectionRect(null);
      autoAnimationStartRef.current = null;
      return;
    }

    const fromRect = animatedAutoSelectionRect || autoSelectionRect;
    autoAnimationStartRef.current = null;

    const animate = (timestamp) => {
      if (!autoAnimationStartRef.current) {
        autoAnimationStartRef.current = timestamp;
      }
      const progress = Math.min(
        (timestamp - autoAnimationStartRef.current) / AUTO_SELECTION_ANIMATION_DURATION,
        1
      );

      setAnimatedAutoSelectionRect(lerpRect(fromRect, autoSelectionRect, progress));

      if (progress < 1) {
        autoAnimationFrameRef.current = requestAnimationFrame(animate);
      } else {
        autoAnimationFrameRef.current = null;
      }
    };

    autoAnimationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (autoAnimationFrameRef.current) {
        cancelAnimationFrame(autoAnimationFrameRef.current);
        autoAnimationFrameRef.current = null;
      }
    };
  }, [autoSelectionRect]);

  const displayRect = animatedAutoSelectionRect || autoSelectionRect;
  const hasAutoSelection = displayRect && displayRect.width > 0 && displayRect.height > 0;

  const forceRefresh = useCallback(() => {
    const hier = getCurrentHierarchy();
    if (hier && Array.isArray(hier.hierarchy) && hier.hierarchy.length > 0) {
      setHierarchy(hier.hierarchy);
      setCurrentIndex(0);
    }
  }, []);

  const navigateHierarchy = useCallback((direction) => {
    if (!hierarchy || hierarchy.length === 0) return;
    
    setCurrentIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return 0;
      if (next >= hierarchy.length) return hierarchy.length - 1;
      return next;
    });
  }, [hierarchy]);

  return {
    autoSelectionRect,
    displayAutoSelectionRect: displayRect,
    hasAutoSelection,
    clearAutoSelection: () => {
      setHierarchy([]);
      setCurrentIndex(0);
    },
    forceRefresh,
    navigateHierarchy,
  };
}

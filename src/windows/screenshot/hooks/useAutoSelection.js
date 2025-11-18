//自动选择功能 Hook

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ensureAutoSelectionStarted,
  subscribe as subscribeAutoSelection,
  getCurrentHierarchy,
} from '../utils/autoSelectionManager';
import { lerpRect } from '../utils/selectionOperations';
import { AUTO_SELECTION_ANIMATION_DURATION } from '../constants/selectionConstants';

export function useAutoSelection(isInteracting) {
  const [autoSelectionRect, setAutoSelectionRect] = useState(null);
  const [animatedAutoSelectionRect, setAnimatedAutoSelectionRect] = useState(null);
  const autoAnimationFrameRef = useRef(null);
  const autoAnimationStartRef = useRef(null);

  useEffect(() => {
    let unsub = null;
    (async () => {
      await ensureAutoSelectionStarted();
      unsub = subscribeAutoSelection((hier) => {
        if (isInteracting) {
          return;
        }

        if (!hier || !Array.isArray(hier.hierarchy) || hier.hierarchy.length === 0) {
          setAutoSelectionRect(null);
          return;
        }

        const b = hier.hierarchy[0];
        if (!b || b.width <= 0 || b.height <= 0) {
          setAutoSelectionRect(null);
          return;
        }

        setAutoSelectionRect({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        });
      });
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [isInteracting]);

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
      const b = hier.hierarchy[0];
      if (b && b.width > 0 && b.height > 0) {
        setAutoSelectionRect({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
        });
      }
    }
  }, []);

  return {
    autoSelectionRect,
    displayAutoSelectionRect: displayRect,
    hasAutoSelection,
    clearAutoSelection: () => setAutoSelectionRect(null),
    forceRefresh,
  };
}

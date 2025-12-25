import { useCallback, useEffect, useRef, useState } from 'react';

const SNAP_THRESHOLD = 12;

const clamp = (value, min, max) => {
  if (typeof min !== 'number' || typeof max !== 'number') return value;
  return Math.min(Math.max(value, min), max);
};

const getFallbackBounds = () => ({
  left: 0,
  top: 0,
  right: window.innerWidth || 1920,
  bottom: window.innerHeight || 1080,
});

// 计算吸附位置
function calculateSnapPosition(pos, size, selection, padding = 8) {
  if (!selection) return { position: pos, snapped: { x: false, y: false } };

  let { x, y } = pos;
  const snapped = { x: false, y: false };

  const selLeft = selection.x;
  const selRight = selection.x + selection.width;
  const selTop = selection.y;
  const selBottom = selection.y + selection.height;

  const panelRight = x + size.width;
  const panelBottom = y + size.height;

  const isNearSelectionY = !(panelBottom < selTop - SNAP_THRESHOLD * 3 || y > selBottom + SNAP_THRESHOLD * 3);

  const isNearSelectionX = !(panelRight < selLeft - SNAP_THRESHOLD * 3 || x > selRight + SNAP_THRESHOLD * 3);

  // X 轴吸附检测
  if (isNearSelectionY) {
    const snapPointsX = [
      // 面板左边缘 -> 选区左边缘
      { panelEdge: x, targetEdge: selLeft, newX: selLeft },
      // 面板左边缘 -> 选区右边缘 + padding
      { panelEdge: x, targetEdge: selRight + padding, newX: selRight + padding },
      // 面板右边缘 -> 选区右边缘
      { panelEdge: panelRight, targetEdge: selRight, newX: selRight - size.width },
      // 面板右边缘 -> 选区左边缘 - padding
      { panelEdge: panelRight, targetEdge: selLeft - padding, newX: selLeft - padding - size.width },
    ];

    for (const snap of snapPointsX) {
      if (Math.abs(snap.panelEdge - snap.targetEdge) < SNAP_THRESHOLD) {
        x = snap.newX;
        snapped.x = true;
        break;
      }
    }
  }

  // Y 轴吸附检测
  if (isNearSelectionX) {
    const snapPointsY = [
      // 面板顶边缘 -> 选区顶边缘
      { panelEdge: y, targetEdge: selTop, newY: selTop },
      // 面板顶边缘 -> 选区底边缘 + padding
      { panelEdge: y, targetEdge: selBottom + padding, newY: selBottom + padding },
      // 面板底边缘 -> 选区底边缘
      { panelEdge: panelBottom, targetEdge: selBottom, newY: selBottom - size.height },
      // 面板底边缘 -> 选区顶边缘 - padding
      { panelEdge: panelBottom, targetEdge: selTop - padding, newY: selTop - padding - size.height },
    ];

    for (const snap of snapPointsY) {
      if (Math.abs(snap.panelEdge - snap.targetEdge) < SNAP_THRESHOLD) {
        y = snap.newY;
        snapped.y = true;
        break;
      }
    }
  }

  return { position: { x, y }, snapped };
}

// 通用面板拖拽 Hook
export function usePanelDrag({
  panelRef,
  panelSize,
  selection,
  stageRegionManager,
  enableSnap = true,
  onMaxHeightChange,
  onPositionChange,
}) {
  const [position, setPosition] = useState(null);
  const [lockedPosition, setLockedPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapped, setIsSnapped] = useState({ x: false, y: false });
  const dragStateRef = useRef({ isDragging: false, offset: { x: 0, y: 0 } });

  useEffect(() => {
    setLockedPosition(null);
    setIsSnapped({ x: false, y: false });
  }, [selection?.x, selection?.y, selection?.width, selection?.height]);

  const getScreenBoundsForPosition = useCallback((x, y) => {
    const screen = stageRegionManager?.getNearestScreen(x, y);
    if (screen) {
      return {
        left: screen.x,
        right: screen.x + screen.width,
        top: screen.y,
        bottom: screen.y + screen.height,
      };
    }
    return getFallbackBounds();
  }, [stageRegionManager]);

  const handleDragMove = useCallback((event) => {
    if (!dragStateRef.current.isDragging) return;

    event.preventDefault();
    event.stopPropagation();

    const offset = dragStateRef.current.offset;
    let nextX = event.clientX - offset.x;
    let nextY = event.clientY - offset.y;

    const width = panelSize.width;
    const height = panelSize.height;

    let snapped = { x: false, y: false };
    if (enableSnap && selection) {
      const snapResult = calculateSnapPosition(
        { x: nextX, y: nextY },
        { width, height },
        selection
      );
      nextX = snapResult.position.x;
      nextY = snapResult.position.y;
      snapped = snapResult.snapped;
    }

    const screenWithin = getScreenBoundsForPosition(nextX + width / 2, nextY);
    const availableHeight = screenWithin.bottom - nextY;
    const effectiveHeight = Math.min(height, Math.max(200, availableHeight));

    if (stageRegionManager) {
      const constrained = stageRegionManager.constrainRect(
        { x: nextX, y: nextY, width, height: effectiveHeight },
        'move'
      );
      nextX = constrained.x;
      nextY = constrained.y;
    } else {
      const bounds = getFallbackBounds();
      nextX = clamp(nextX, bounds.left, bounds.right - width);
      nextY = clamp(nextY, bounds.top, bounds.bottom - effectiveHeight);
    }

    const nextPosition = { x: nextX, y: nextY };
    setPosition(nextPosition);
    setLockedPosition(nextPosition);
    setIsSnapped(snapped);

    if (onMaxHeightChange) {
      const finalScreenWithin = getScreenBoundsForPosition(nextX + width / 2, nextY);
      const finalAvailableHeight = finalScreenWithin.bottom - nextY;
      onMaxHeightChange(Math.max(200, finalAvailableHeight));
    }
  }, [panelSize.width, panelSize.height, selection, stageRegionManager, enableSnap, getScreenBoundsForPosition, onMaxHeightChange]);

  const stopDragging = useCallback(() => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    
    if (lockedPosition && onPositionChange) {
      onPositionChange({
        x: lockedPosition.x,
        y: lockedPosition.y,
        width: panelSize.width,
        height: panelSize.height,
      });
    }
  }, [lockedPosition, panelSize.width, panelSize.height, onPositionChange]);

  useEffect(() => {
    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointerleave', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handleDragMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointerleave', stopDragging);
    };
  }, [handleDragMove, stopDragging]);

  const handleDragStart = useCallback((event) => {
    if (!panelRef?.current) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = panelRef.current.getBoundingClientRect();
    const actualPosition = { x: rect.left, y: rect.top };

    dragStateRef.current = {
      isDragging: true,
      offset: {
        x: event.clientX - actualPosition.x,
        y: event.clientY - actualPosition.y,
      },
    };
    setIsDragging(true);
    setPosition(actualPosition);
    setLockedPosition(actualPosition);
  }, [panelRef]);

  const resetLockedPosition = useCallback(() => {
    setLockedPosition(null);
    setIsSnapped({ x: false, y: false });
  }, []);

  return {
    position,
    setPosition,
    lockedPosition,
    isDragging,
    isSnapped,
    handleDragStart,
    resetLockedPosition,
  };
}

export default usePanelDrag;

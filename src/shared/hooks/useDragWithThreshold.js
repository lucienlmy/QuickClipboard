import { useRef, useCallback } from 'react';
import { startDrag } from '@crabnebula/tauri-plugin-drag';

const DRAG_THRESHOLD = 5;

export function useDragWithThreshold(options = {}) {
  const { onDragStart, onDragEnd } = options;
  const dragStateRef = useRef(null);

  const handleMouseDown = useCallback((e, filePaths, iconPath) => {
    if (e.button !== 0) return;
    
    const paths = Array.isArray(filePaths) ? filePaths.filter(Boolean) : [];
    if (!paths.length) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let isDragging = false;

    const handleMouseMove = async (moveEvent) => {
      if (isDragging) return;

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= DRAG_THRESHOLD) {
        isDragging = true;
        cleanup();
        
        onDragStart?.();
        try {
          await startDrag({ 
            item: paths, 
            icon: iconPath || paths[0] 
          });
        } catch (err) {
          console.error('拖拽失败:', err);
        }
        onDragEnd?.();
      }
    };

    const handleMouseUp = () => {
      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragStateRef.current = null;
    };

    dragStateRef.current = { cleanup };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

  }, [onDragStart, onDragEnd]);

  return handleMouseDown;
}

export default useDragWithThreshold;

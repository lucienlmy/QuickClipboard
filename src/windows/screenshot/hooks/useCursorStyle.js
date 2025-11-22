//光标样式管理 Hook

import { useEffect } from 'react';
import { checkHandleHit, isRadiusHandle } from '../utils/handleDetection';
import { isPointInsideSelection } from '../utils/selectionOperations';
import { CURSOR_MAP } from '../constants/selectionConstants';
import { getCachedToolCursor } from '../utils/cursorGenerator';

export function useCursorStyle(
  stageRef,
  selection,
  isInteracting,
  activeToolId = null,
  toolStyle = {}
) {
  useEffect(() => {
    if (!stageRef?.current) return;

    const stage = stageRef.current;
    const container = stage.container();

    const handleMouseMove = (e) => {
      const pos = stage.getPointerPosition();
      if (!pos) return;

      if (isInteracting) return;

      // 编辑模式：使用工具专属光标
      if (activeToolId && activeToolId !== 'select') {
        const toolCursor = getCachedToolCursor(activeToolId, toolStyle);
        container.style.cursor = toolCursor;
        return;
      }

      // 选择模式或无工具：使用选区光标
      if (selection && selection.width > 0 && selection.height > 0) {
        const handleType = checkHandleHit(pos, selection);
        
        if (handleType) {
          if (isRadiusHandle(handleType)) {
            container.style.cursor = 'pointer';
          } else {
            container.style.cursor = CURSOR_MAP[handleType] || 'default';
          }
        } else {
          const inside = isPointInsideSelection(pos, selection);
          container.style.cursor = inside ? 'move' : 'crosshair';
        }
      } else {
        container.style.cursor = 'crosshair';
      }
    };

    container.addEventListener('mousemove', handleMouseMove);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
    };
  }, [stageRef, selection, isInteracting, activeToolId, toolStyle]);
}

//选区控制手柄渲染组件

import { Circle } from 'react-konva';
import { getHandlePositions, isRadiusHandle } from '../utils/handleDetection';
import {
  HANDLE_SIZE,
  HANDLE_COLOR,
  HANDLE_STROKE_COLOR,
  HANDLE_STROKE_WIDTH,
  RADIUS_HANDLE_SIZE,
  RADIUS_HANDLE_COLOR,
} from '../constants/selectionConstants';

function SelectionHandles({ selection, visible = true, pinEditMode = false }) {
  if (!visible || !selection || selection.width <= 0 || selection.height <= 0) {
    return null;
  }

  const handles = getHandlePositions(selection);

  return (
    <>
      {handles.map((handle) => {
        const isRadius = isRadiusHandle(handle.type);
        // 贴图编辑模式显示圆角手柄
        if (pinEditMode && !isRadius) {
          return null;
        }
        return (
          <Circle
            key={handle.type}
            x={handle.x}
            y={handle.y}
            radius={isRadius ? RADIUS_HANDLE_SIZE : HANDLE_SIZE}
            fill={isRadius ? RADIUS_HANDLE_COLOR : HANDLE_COLOR}
            stroke={HANDLE_STROKE_COLOR}
            strokeWidth={HANDLE_STROKE_WIDTH}
            listening={false}
          />
        );
      })}
    </>
  );
}

export default SelectionHandles;

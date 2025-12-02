//自动选择矩形渲染组件

import { Rect } from 'react-konva';
import {
  OVERLAY_COLOR,
  SELECTION_STROKE_COLOR,
  SELECTION_STROKE_WIDTH,
} from '../constants/selectionConstants';

function AutoSelectionRect({ rect }) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return (
    <>
      {/* 清空遮罩 */}
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill={OVERLAY_COLOR}
        globalCompositeOperation="destination-out"
        listening={false}
      />
      {/* 边框 */}
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        stroke={SELECTION_STROKE_COLOR}
        strokeWidth={SELECTION_STROKE_WIDTH}
        listening={false}
      />
    </>
  );
}

export default AutoSelectionRect;

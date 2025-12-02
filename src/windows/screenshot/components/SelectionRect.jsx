//选区矩形渲染组件

import { Rect } from 'react-konva';
import {
  OVERLAY_COLOR,
  SELECTION_STROKE_COLOR,
  SELECTION_STROKE_WIDTH,
} from '../constants/selectionConstants';

function SelectionRect({ selection, cornerRadius = 0 }) {
  if (!selection || selection.width <= 0 || selection.height <= 0) {
    return null;
  }

  return (
    <>
      {/* 清空遮罩 */}
      <Rect
        x={selection.x}
        y={selection.y}
        width={selection.width}
        height={selection.height}
        cornerRadius={cornerRadius}
        fill={OVERLAY_COLOR}
        globalCompositeOperation="destination-out"
        listening={false}
      />
      {/* 选区边框 */}
      <Rect
        x={selection.x}
        y={selection.y}
        width={selection.width}
        height={selection.height}
        cornerRadius={cornerRadius}
        stroke={SELECTION_STROKE_COLOR}
        strokeWidth={SELECTION_STROKE_WIDTH}
        listening={false}
      />
    </>
  );
}

export default SelectionRect;

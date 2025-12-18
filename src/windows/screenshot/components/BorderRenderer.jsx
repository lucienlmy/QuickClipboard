import { useMemo, memo } from 'react';
import { Rect } from 'react-konva';

// 边框渲染组件
const BorderRenderer = memo(({ borderConfig, selection, cornerRadius = 0 }) => {
  const {
    enabled = false,
    width = 4,
    color = '#ff4d4f',
    style = 'solid',
    opacity = 1,
    shadow = false,
    shadowColor = '#000000',
    shadowBlur = 10,
    shadowOffsetX = 0,
    shadowOffsetY = 4,
  } = borderConfig || {};

  const dash = useMemo(() => {
    if (style === 'dashed') {
      return [width * 3, width * 2];
    }
    if (style === 'dotted') {
      return [width, width];
    }
    return [];
  }, [style, width]);

  if (!enabled || !selection) {
    return null;
  }

  const { x, y, width: selWidth, height: selHeight } = selection;

  const halfWidth = width / 2;

  const effectiveRadius = Math.max(0, cornerRadius - halfWidth);

  return (
    <Rect
      x={x + halfWidth}
      y={y + halfWidth}
      width={selWidth - width}
      height={selHeight - width}
      stroke={color}
      strokeWidth={width}
      cornerRadius={effectiveRadius}
      opacity={opacity}
      dash={dash}
      shadowEnabled={shadow}
      shadowColor={shadowColor}
      shadowBlur={shadowBlur}
      shadowOffsetX={shadowOffsetX}
      shadowOffsetY={shadowOffsetY}
      listening={false}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={shadow}
    />
  );
});

BorderRenderer.displayName = 'BorderRenderer';

export default BorderRenderer;

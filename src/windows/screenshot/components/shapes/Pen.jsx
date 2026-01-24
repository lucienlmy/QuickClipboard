import { useState, useRef, useMemo } from 'react';
import { Line, Rect } from 'react-konva';
import { createCommonProps, HOVER_STROKE_COLOR, HOVER_STROKE_WIDTH, HOVER_DASH } from './CommonComponents';

export default function Pen({ shape, index, shapeRef, isSelected, activeToolId, onSelect, onShapeTransform, onHoverChange }) {
  const [isHovered, setIsHovered] = useState(false);
  const internalRef = useRef(null);

  const setRef = (node) => {
    internalRef.current = node;
    if (typeof shapeRef === 'function') {
      shapeRef(node);
    } else if (shapeRef) {
      shapeRef.current = node;
    }
  };

  const penProps = createCommonProps(isSelected, onSelect, index, activeToolId, 'select', setIsHovered, onHoverChange);
  const canSelect = activeToolId === 'select';
  const showHoverHighlight = isHovered && !isSelected && canSelect;

  const offsetX = shape.offsetX ?? 0;
  const offsetY = shape.offsetY ?? 0;

  const hoverBounds = useMemo(() => {
    if (!showHoverHighlight || !shape.points || shape.points.length < 2) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < shape.points.length; i += 2) {
      const x = shape.points[i] + offsetX;
      const y = shape.points[i + 1] + offsetY;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    
    const padding = 3;
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }, [shape.points, offsetX, offsetY, showHoverHighlight]);

  return (
    <>
      <Line
        ref={setRef}
        {...penProps}
        x={offsetX}
        y={offsetY}
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        tension={shape.tension}
        lineCap={shape.lineCap}
        lineJoin={shape.lineJoin}
        dash={shape.dash}
        opacity={shape.opacity}
        globalCompositeOperation={shape.globalCompositeOperation}
        hitStrokeWidth={20}
        onDragEnd={(e) => {
          if (isSelected && onShapeTransform) {
            onShapeTransform({ offsetX: e.target.x(), offsetY: e.target.y() });
          }
        }}
      />
      {hoverBounds && (
        <Rect
          x={hoverBounds.x}
          y={hoverBounds.y}
          width={hoverBounds.width}
          height={hoverBounds.height}
          stroke={HOVER_STROKE_COLOR}
          strokeWidth={HOVER_STROKE_WIDTH}
          dash={HOVER_DASH}
          listening={false}
        />
      )}
    </>
  );
}

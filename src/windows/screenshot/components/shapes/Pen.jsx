import { useState, useRef } from 'react';
import { Line } from 'react-konva';
import { createCommonProps, HoverHighlight } from './CommonComponents';

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

  return (
    <>
      <Line
        ref={setRef}
        {...penProps}
        x={shape.offsetX ?? 0}
        y={shape.offsetY ?? 0}
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
      <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
    </>
  );
}

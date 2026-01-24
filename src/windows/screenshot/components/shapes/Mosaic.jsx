import { useState } from 'react';
import { Line, Rect, Image as KonvaImage } from 'react-konva';
import { createCommonProps, HighlightBorder } from './CommonComponents';

export default function Mosaic({ shape, index, shapeRef, isSelected, activeToolId, onSelect, onHoverChange, isCreating }) {
  const [isHovered, setIsHovered] = useState(false);
  const canSelect = activeToolId === 'select';

  if (shape.processedImage) {
    const commonProps = createCommonProps(isSelected, onSelect, index, activeToolId, 'select', setIsHovered, onHoverChange);
    return (
      <>
        <KonvaImage
          ref={shapeRef}
          {...commonProps}
          image={shape.processedImage}
          x={shape.processedX}
          y={shape.processedY}
          width={shape.processedWidth}
          height={shape.processedHeight}
          opacity={shape.opacity}
          draggable={false}
        />
        <HighlightBorder nodeRef={shapeRef} visible={isHovered && !isSelected && !isCreating} />
        <HighlightBorder nodeRef={shapeRef} visible={isSelected} isSelection />
      </>
    );
  }

  const offsetX = shape.offsetX ?? 0;
  const offsetY = shape.offsetY ?? 0;

  if (shape.drawMode === 'brush') {
    const visualStyle = shape.renderMode === 'mosaic'
      ? { stroke: 'rgba(0, 0, 0, 0.6)' }
      : { stroke: 'rgba(100, 100, 100, 0.5)' };

    return (
      <Line
        ref={shapeRef}
        x={offsetX}
        y={offsetY}
        points={shape.points}
        stroke={visualStyle.stroke}
        strokeWidth={shape.brushSize || 20}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        opacity={shape.opacity}
        listening={false}
      />
    );
  }

  if (shape.drawMode === 'region') {
    const visualStyle = shape.renderMode === 'mosaic'
      ? { fill: 'rgba(0, 0, 0, 0.6)', stroke: 'rgba(0, 0, 0, 0.8)' }
      : { fill: 'rgba(100, 100, 100, 0.5)', stroke: 'rgba(100, 100, 100, 0.7)' };

    return (
      <Rect
        ref={shapeRef}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={visualStyle.fill}
        stroke={visualStyle.stroke}
        strokeWidth={2}
        opacity={shape.opacity}
        listening={false}
      />
    );
  }

  return null;
}

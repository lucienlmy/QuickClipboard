import { useState, useRef } from 'react';
import { Arrow, Circle, RegularPolygon, Ellipse, Rect, Line, Shape as KonvaShape } from 'react-konva';
import { createCommonProps, HoverHighlight, applyOpacity } from './CommonComponents';

export default function Shape({ shape, index, shapeRef, isSelected, activeToolId, onSelect, onShapeTransform, onHoverChange }) {
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

  const fillColor = applyOpacity(shape.fill, shape.fillOpacity);
  const strokeColor = applyOpacity(shape.stroke, shape.strokeOpacity);
  const commonProps = createCommonProps(isSelected, onSelect, index, activeToolId, 'shape', setIsHovered, onHoverChange);
  const canSelect = activeToolId === 'select' || activeToolId === 'shape';
  const showHoverHighlight = isHovered && !isSelected && canSelect;

  if (shape.shapeType === 'arrow') {
    return (
      <>
        <Arrow
          ref={setRef}
          points={shape.points}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={strokeColor}
          pointerLength={shape.pointerLength}
          pointerWidth={shape.pointerWidth}
          hitStrokeWidth={20}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelected && onShapeTransform) {
              onShapeTransform({ points: e.target.points() });
            }
          }}
        />
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  if (shape.shapeType === 'circle') {
    return (
      <>
        <Circle
          ref={setRef}
          x={shape.centerX ?? (shape.x + shape.width / 2)}
          y={shape.centerY ?? (shape.y + shape.height / 2)}
          radius={shape.radius ?? Math.abs(shape.width) / 2}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelected && onShapeTransform) {
              onShapeTransform({ centerX: e.target.x(), centerY: e.target.y() });
            }
          }}
        />
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  if (shape.shapeType === 'diamond') {
    const centerX = shape.centerX ?? (shape.x + shape.width / 2);
    const centerY = shape.centerY ?? (shape.y + shape.height / 2);

    return (
      <>
        <KonvaShape
          ref={setRef}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          sceneFunc={(context, shape) => {
            context.beginPath();
            const width = shape.width();
            const height = shape.height();
            context.moveTo(width / 2, 0);
            context.lineTo(width, height / 2);
            context.lineTo(width / 2, height);
            context.lineTo(0, height / 2);
            context.closePath();
            context.fillStrokeShape(shape);
          }}
          hitStrokeWidth={20}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelected && onShapeTransform) {
              onShapeTransform({ x: e.target.x(), y: e.target.y() });
            }
          }}
        />
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  if (shape.shapeType === 'triangle' || shape.shapeType === 'pentagon' || typeof shape.sides === 'number') {
    const sides = shape.sides || (shape.shapeType === 'triangle' ? 3 : 5);
    return (
      <>
        <RegularPolygon
          ref={setRef}
          x={shape.centerX ?? (shape.x + shape.width / 2)}
          y={shape.centerY ?? (shape.y + shape.height / 2)}
          sides={sides}
          radius={shape.radius ?? Math.abs(shape.width) / 2}
          rotation={shape.rotation || 0}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelected && onShapeTransform) {
              onShapeTransform({ centerX: e.target.x(), centerY: e.target.y() });
            }
          }}
        />
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  if (shape.shapeType === 'ellipse') {
    return (
      <>
        <Ellipse
          ref={setRef}
          x={shape.x + shape.width / 2}
          y={shape.y + shape.height / 2}
          radiusX={Math.abs(shape.width) / 2}
          radiusY={Math.abs(shape.height) / 2}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelected && onShapeTransform) {
              onShapeTransform({ x: e.target.x() - shape.width / 2, y: e.target.y() - shape.height / 2 });
            }
          }}
        />
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  return (
    <>
      <Rect
        ref={setRef}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        stroke={strokeColor}
        strokeWidth={shape.strokeWidth}
        fill={fillColor}
        cornerRadius={shape.cornerRadius}
        {...commonProps}
        onDragEnd={(e) => {
          if (isSelected && onShapeTransform) {
            onShapeTransform({ x: e.target.x(), y: e.target.y() });
          }
        }}
      />
      <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
    </>
  );
}

import { useState, useRef } from 'react';
import { Arrow, Circle, Line, RegularPolygon, Ellipse, Rect } from 'react-konva';
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
          onTransformEnd={(e) => {
            if (isSelected && onShapeTransform) {
              const node = e.target;
              const scale = Math.max(node.scaleX(), node.scaleY());
              node.scaleX(1);
              node.scaleY(1);
              onShapeTransform({
                centerX: node.x(),
                centerY: node.y(),
                radius: node.radius() * scale,
              });
            }
          }}
        />
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  if (shape.shapeType === 'diamond' && Array.isArray(shape.points)) {
    const centerX = shape.centerX ?? (shape.x + shape.width / 2);
    const centerY = shape.centerY ?? (shape.y + shape.height / 2);
    const width = shape.width ?? Math.abs(shape.points[2] - shape.points[6]);
    const height = shape.height ?? Math.abs(shape.points[5] - shape.points[1]);

    return (
      <>
        <Line
          ref={setRef}
          x={centerX}
          y={centerY}
          points={[0, -height / 2, width / 2, 0, 0, height / 2, -width / 2, 0]}
          closed
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          rotation={shape.rotation ?? 0}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelected && onShapeTransform) {
              onShapeTransform({ centerX: e.target.x(), centerY: e.target.y() });
            }
          }}
          onTransformEnd={(e) => {
            if (isSelected && onShapeTransform) {
              const node = e.target;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              onShapeTransform({
                centerX: node.x(),
                centerY: node.y(),
                width: width * scaleX,
                height: height * scaleY,
                rotation: node.rotation(),
              });
            }
          }}
        />
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  if (typeof shape.sides === 'number' && shape.sides >= 3) {
    return (
      <>
        <RegularPolygon
          ref={setRef}
          x={shape.centerX ?? (shape.x + shape.width / 2)}
          y={shape.centerY ?? (shape.y + shape.height / 2)}
          sides={shape.sides}
          radius={shape.radius ?? Math.min(Math.abs(shape.width), Math.abs(shape.height)) / 2}
          rotation={shape.rotation ?? 0}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelected && onShapeTransform) {
              onShapeTransform({ centerX: e.target.x(), centerY: e.target.y() });
            }
          }}
          onTransformEnd={(e) => {
            if (isSelected && onShapeTransform) {
              const node = e.target;
              const scale = Math.max(node.scaleX(), node.scaleY());
              node.scaleX(1);
              node.scaleY(1);
              onShapeTransform({
                centerX: node.x(),
                centerY: node.y(),
                radius: node.radius() * scale,
                rotation: node.rotation(),
              });
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
              const node = e.target;
              onShapeTransform({
                x: shape.x + node.x() - shape.width / 2,
                y: shape.y + node.y() - shape.height / 2,
              });
              node.position({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 });
            }
          }}
          onTransformEnd={(e) => {
            if (isSelected && onShapeTransform) {
              const node = e.target;
              const scaleX = node.scaleX();
              const scaleY = node.scaleY();
              node.scaleX(1);
              node.scaleY(1);
              onShapeTransform({
                x: node.x() - node.radiusX() * scaleX,
                y: node.y() - node.radiusY() * scaleY,
                width: node.radiusX() * scaleX * 2,
                height: node.radiusY() * scaleY * 2,
              });
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
        {...commonProps}
        onDragEnd={(e) => {
          if (isSelected && onShapeTransform) {
            onShapeTransform({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onTransformEnd={(e) => {
          if (isSelected && onShapeTransform) {
            const node = e.target;
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            onShapeTransform({
              x: node.x(),
              y: node.y(),
              width: Math.max(5, node.width() * scaleX),
              height: Math.max(5, node.height() * scaleY),
            });
          }
        }}
      />
      <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
    </>
  );
}

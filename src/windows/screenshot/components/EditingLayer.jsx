import React from 'react';
import { Layer, Line, Rect, Ellipse, Arrow, Circle, RegularPolygon } from 'react-konva';

const applyOpacity = (color, opacity = 1) => {
  if (!color) return undefined;
  if (opacity >= 1) return color;
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
};

const EditingLayer = ({ shapes, listening }) => {
  return (
    <Layer id="screenshot-editing-layer" listening={listening}>
      {shapes.map((shape, i) => {
        if (shape.tool === 'pen') {
          return (
            <Line
              key={i}
              points={shape.points}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              tension={shape.tension}
              lineCap={shape.lineCap}
              lineJoin={shape.lineJoin}
              dash={shape.dash}
              opacity={shape.opacity}
              globalCompositeOperation={shape.globalCompositeOperation}
            />
          );
        }
        if (shape.tool === 'shape') {
          if (shape.shapeType === 'arrow') {
            return (
              <Arrow
                key={i}
                points={shape.points}
                stroke={applyOpacity(shape.stroke, shape.strokeOpacity)}
                strokeWidth={shape.strokeWidth}
                fill={applyOpacity(shape.stroke, shape.strokeOpacity)}
                pointerLength={shape.pointerLength}
                pointerWidth={shape.pointerWidth}
                listening={false}
              />
            );
          }

          const fillColor = applyOpacity(shape.fill, shape.fillOpacity);
          const strokeColor = applyOpacity(shape.stroke, shape.strokeOpacity);

          if (shape.shapeType === 'circle') {
            return (
              <Circle
                key={i}
                x={shape.centerX ?? (shape.x + shape.width / 2)}
                y={shape.centerY ?? (shape.y + shape.height / 2)}
                radius={shape.radius ?? Math.abs(shape.width) / 2}
                stroke={strokeColor}
                strokeWidth={shape.strokeWidth}
                fill={fillColor}
                listening={false}
              />
            );
          }

          if (shape.shapeType === 'diamond' && Array.isArray(shape.points)) {
            return (
              <Line
                key={i}
                points={shape.points}
                closed
                stroke={strokeColor}
                strokeWidth={shape.strokeWidth}
                fill={fillColor}
                listening={false}
              />
            );
          }

          if (typeof shape.sides === 'number' && shape.sides >= 3) {
            return (
              <RegularPolygon
                key={i}
                x={shape.centerX ?? (shape.x + shape.width / 2)}
                y={shape.centerY ?? (shape.y + shape.height / 2)}
                sides={shape.sides}
                radius={shape.radius ?? Math.min(Math.abs(shape.width), Math.abs(shape.height)) / 2}
                rotation={shape.rotation ?? 0}
                stroke={strokeColor}
                strokeWidth={shape.strokeWidth}
                fill={fillColor}
                listening={false}
              />
            );
          }

          if (shape.shapeType === 'ellipse') {
            return (
              <Ellipse
                key={i}
                x={shape.x + shape.width / 2}
                y={shape.y + shape.height / 2}
                radiusX={Math.abs(shape.width) / 2}
                radiusY={Math.abs(shape.height) / 2}
                stroke={strokeColor}
                strokeWidth={shape.strokeWidth}
                fill={fillColor}
                listening={false}
              />
            );
          }

          return (
            <Rect
              key={i}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              stroke={strokeColor}
              strokeWidth={shape.strokeWidth}
              fill={fillColor}
              listening={false}
            />
          );
        }
        return null;
      })}
    </Layer>
  );
};

export default EditingLayer;

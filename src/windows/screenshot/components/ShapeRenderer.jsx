import React from 'react';
import { Line, Rect, Ellipse, Arrow, Circle, RegularPolygon, Group } from 'react-konva';

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

const createCommonProps = (index, isSelected, isSelectMode, onSelectShape, shapeListening) => ({
  listening: shapeListening,
  draggable: isSelectMode,
  onClick: (e) => {
    if (isSelectMode) {
      e.cancelBubble = true;
      const isMultiSelect = e.evt?.ctrlKey || e.evt?.metaKey;
      onSelectShape?.(index, isMultiSelect);
    }
  },
  onTap: (e) => {
    if (isSelectMode) {
      e.cancelBubble = true;
      const isMultiSelect = e.evt?.ctrlKey || e.evt?.metaKey;
      onSelectShape?.(index, isMultiSelect);
    }
  },
  onDragStart: () => {
    if (isSelectMode && !isSelected) {
      onSelectShape?.(index, false);
    }
  },
});

// 渲染单个形状
export const ShapeRenderer = ({ 
  shape, 
  index, 
  shapeRef, 
  isSelected, 
  isSelectMode, 
  shapeListening,
  onSelectShape, 
  onShapeTransform 
}) => {
  const commonProps = createCommonProps(index, isSelected, isSelectMode, onSelectShape, shapeListening);

  // 曲线箭头
  if (shape.tool === 'curveArrow') {
    return (
      <Group
        ref={shapeRef}
        x={shape.x || 0}
        y={shape.y || 0}
        {...commonProps}
        onDragEnd={(e) => {
          if (isSelectMode && onShapeTransform) {
            if (e.target === e.currentTarget) {
              onShapeTransform({ x: e.target.x(), y: e.target.y() });
            }
          }
        }}
      >
        <Arrow
          points={shape.points}
          stroke={shape.stroke}
          fill={shape.stroke}
          strokeWidth={shape.strokeWidth}
          tension={0.4}
          opacity={shape.opacity}
          dash={shape.dash}
          lineCap={shape.lineCap}
          lineJoin={shape.lineJoin}
          pointerLength={(shape.strokeWidth || 12) * 2.5}
          pointerWidth={(shape.strokeWidth || 12) * 2.5}
          hitStrokeWidth={20}
        />
        {isSelected && isSelectMode && (
          <>
            {[0, 2, 4].map((offset, i) => (
              <Circle
                key={i}
                x={shape.points[offset]}
                y={shape.points[offset + 1]}
                radius={5}
                fill="#fff"
                stroke="#1677ff"
                strokeWidth={1}
                draggable
                onDragStart={(e) => {
                  e.cancelBubble = true;
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  const node = e.target;
                  const newPoints = [...shape.points];
                  newPoints[offset] = node.x();
                  newPoints[offset + 1] = node.y();
                  onShapeTransform({ points: newPoints });
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  const node = e.target;
                  const newPoints = [...shape.points];
                  newPoints[offset] = node.x();
                  newPoints[offset + 1] = node.y();
                  onShapeTransform({ points: newPoints });
                }}
              />
            ))}
          </>
        )}
      </Group>
    );
  }

  // 画笔工具
  if (shape.tool === 'pen') {
    const offsetX = shape.offsetX ?? 0;
    const offsetY = shape.offsetY ?? 0;
    
    return (
      <Line
        ref={shapeRef}
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
        {...commonProps}
        onDragEnd={(e) => {
          if (isSelectMode && onShapeTransform) {
            const node = e.target;
            onShapeTransform({
              offsetX: node.x(),
              offsetY: node.y(),
            });
          }
        }}
      />
    );
  }

  // 形状工具
  if (shape.tool === 'shape') {
    const fillColor = applyOpacity(shape.fill, shape.fillOpacity);
    const strokeColor = applyOpacity(shape.stroke, shape.strokeOpacity);

    // 箭头
    if (shape.shapeType === 'arrow') {
      return (
        <Arrow
          ref={shapeRef}
          points={shape.points}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={strokeColor}
          pointerLength={shape.pointerLength}
          pointerWidth={shape.pointerWidth}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelectMode && onShapeTransform) {
              onShapeTransform({ points: e.target.points() });
            }
          }}
        />
      );
    }

    // 正圆
    if (shape.shapeType === 'circle') {
      return (
        <Circle
          ref={shapeRef}
          x={shape.centerX ?? (shape.x + shape.width / 2)}
          y={shape.centerY ?? (shape.y + shape.height / 2)}
          radius={shape.radius ?? Math.abs(shape.width) / 2}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelectMode && onShapeTransform) {
              const node = e.target;
              onShapeTransform({ centerX: node.x(), centerY: node.y() });
            }
          }}
          onTransformEnd={(e) => {
            if (isSelectMode && onShapeTransform) {
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
      );
    }

    // 菱形
    if (shape.shapeType === 'diamond' && Array.isArray(shape.points)) {
      const centerX = shape.centerX ?? (shape.x + shape.width / 2);
      const centerY = shape.centerY ?? (shape.y + shape.height / 2);
      const width = shape.width ?? Math.abs(shape.points[2] - shape.points[6]);
      const height = shape.height ?? Math.abs(shape.points[5] - shape.points[1]);
      
      const relativePoints = [
        0, -height / 2,      
        width / 2, 0,       
        0, height / 2,        
        -width / 2, 0,       
      ];

      return (
        <Line
          ref={shapeRef}
          x={centerX}
          y={centerY}
          points={relativePoints}
          closed
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          rotation={shape.rotation ?? 0}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelectMode && onShapeTransform) {
              const node = e.target;
              onShapeTransform({ 
                centerX: node.x(), 
                centerY: node.y() 
              });
            }
          }}
          onTransformEnd={(e) => {
            if (isSelectMode && onShapeTransform) {
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
      );
    }

    // 正多边形
    if (typeof shape.sides === 'number' && shape.sides >= 3) {
      return (
        <RegularPolygon
          ref={shapeRef}
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
            if (isSelectMode && onShapeTransform) {
              const node = e.target;
              onShapeTransform({ centerX: node.x(), centerY: node.y() });
            }
          }}
          onTransformEnd={(e) => {
            if (isSelectMode && onShapeTransform) {
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
      );
    }

    // 椭圆
    if (shape.shapeType === 'ellipse') {
      return (
        <Ellipse
          ref={shapeRef}
          x={shape.x + shape.width / 2}
          y={shape.y + shape.height / 2}
          radiusX={Math.abs(shape.width) / 2}
          radiusY={Math.abs(shape.height) / 2}
          stroke={strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={fillColor}
          {...commonProps}
          onDragEnd={(e) => {
            if (isSelectMode && onShapeTransform) {
              const node = e.target;
              onShapeTransform({
                x: shape.x + node.x() - shape.width / 2,
                y: shape.y + node.y() - shape.height / 2,
              });
              node.position({ x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 });
            }
          }}
          onTransformEnd={(e) => {
            if (isSelectMode && onShapeTransform) {
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
      );
    }

    // 矩形
    return (
      <Rect
        ref={shapeRef}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        stroke={strokeColor}
        strokeWidth={shape.strokeWidth}
        fill={fillColor}
        {...commonProps}
        onDragEnd={(e) => {
          if (isSelectMode && onShapeTransform) {
            const node = e.target;
            onShapeTransform({ x: node.x(), y: node.y() });
          }
        }}
        onTransformEnd={(e) => {
          if (isSelectMode && onShapeTransform) {
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
    );
  }

  return null;
};

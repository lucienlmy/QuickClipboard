import { useState, useRef, useMemo } from 'react';
import { Group, Line, Circle, Rect } from 'react-konva';
import { snapToAngle } from '../../utils/angleSnap';
import { HOVER_STROKE_COLOR, HOVER_STROKE_WIDTH, HOVER_DASH } from './CommonComponents';

export default function Polyline({ shape, index, shapeRef, isSelected, activeToolId, onSelect, onShapeTransform, onHoverChange }) {
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

  const offsetX = shape.offsetX ?? 0;
  const offsetY = shape.offsetY ?? 0;
  const tension = shape.connectionType === 'curve' ? 0.5 : 0;
  const canSelect = activeToolId === 'select' || activeToolId === 'polyline';
  const showHoverHighlight = isHovered && !isSelected && canSelect && !shape.isDrawing;

  const hoverBounds = useMemo(() => {
    if (!showHoverHighlight || shape.points.length < 2) return null;

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

  if (shape.isDrawing) {
    return (
      <>
        <Line
          ref={setRef}
          name={`shape-polyline-${index}`}
          points={shape.points.map((v, i) => i % 2 === 0 ? v + offsetX : v + offsetY)}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          opacity={shape.opacity}
          dash={shape.dash}
          lineCap={shape.lineCap}
          lineJoin={shape.lineJoin}
          tension={tension}
          hitStrokeWidth={20}
          listening={false}
        />
        {shape.points.length >= 2 &&
          Array.from({ length: shape.points.length / 2 }).map((_, i) => (
            <Circle
              key={`draw-${index}-${i}`}
              x={shape.points[i * 2] + offsetX}
              y={shape.points[i * 2 + 1] + offsetY}
              radius={4}
              fill={shape.stroke}
              stroke="#fff"
              strokeWidth={1}
              listening={false}
            />
          ))
        }
      </>
    );
  }

  return (
    <Group
      ref={setRef}
      name={`shape-polyline-${index}`}
      x={offsetX}
      y={offsetY}
      draggable={isSelected}
      onClick={(e) => {
        if (canSelect) {
          e.cancelBubble = true;
          onSelect?.(index, e.evt?.ctrlKey || e.evt?.metaKey);
        }
      }}
      onTap={(e) => {
        if (canSelect) {
          e.cancelBubble = true;
          onSelect?.(index, e.evt?.ctrlKey || e.evt?.metaKey);
        }
      }}
      onMouseEnter={() => {
        if (canSelect) {
          setIsHovered(true);
          onHoverChange?.(true);
        }
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHoverChange?.(false);
      }}
      onDragEnd={(e) => {
        if (isSelected && onShapeTransform) {
          const node = e.target;
          onShapeTransform({ offsetX: node.x(), offsetY: node.y() });
        }
      }}
    >
      <Line
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        opacity={shape.opacity}
        dash={shape.dash}
        lineCap={shape.lineCap}
        lineJoin={shape.lineJoin}
        tension={tension}
        hitStrokeWidth={20}
      />
      {isSelected &&
        Array.from({ length: shape.points.length / 2 }).map((_, i) => {
          const offset = i * 2;
          return (
            <Circle
              key={`handle-${index}-${i}`}
              name={`shape-anchor shape-polyline-${index}`}
              x={shape.points[offset]}
              y={shape.points[offset + 1]}
              radius={5}
              fill="#fff"
              stroke="#1890ff"
              strokeWidth={2}
              draggable
              onMouseDown={(e) => e.cancelBubble = true}
              onClick={(e) => e.cancelBubble = true}
              onTap={(e) => e.cancelBubble = true}
              onDragMove={(e) => {
                const newPoints = [...shape.points];
                let targetX = e.target.x();
                let targetY = e.target.y();

                if (e.evt?.shiftKey) {
                  let refX, refY;
                  if (offset > 0) {
                    refX = newPoints[offset - 2];
                    refY = newPoints[offset - 1];
                  } else if (offset + 2 < newPoints.length) {
                    refX = newPoints[offset + 2];
                    refY = newPoints[offset + 3];
                  }

                  if (refX !== undefined && refY !== undefined) {
                    const snapped = snapToAngle(refX, refY, targetX, targetY);
                    targetX = snapped.x;
                    targetY = snapped.y;
                    e.target.position({ x: targetX, y: targetY });
                  }
                }

                newPoints[offset] = targetX;
                newPoints[offset + 1] = targetY;
                onShapeTransform?.({ points: newPoints });
              }}
              onDragEnd={(e) => {
                const newPoints = [...shape.points];
                let targetX = e.target.x();
                let targetY = e.target.y();

                if (e.evt?.shiftKey) {
                  let refX, refY;
                  if (offset > 0) {
                    refX = newPoints[offset - 2];
                    refY = newPoints[offset - 1];
                  } else if (offset + 2 < newPoints.length) {
                    refX = newPoints[offset + 2];
                    refY = newPoints[offset + 3];
                  }

                  if (refX !== undefined && refY !== undefined) {
                    const snapped = snapToAngle(refX, refY, targetX, targetY);
                    targetX = snapped.x;
                    targetY = snapped.y;
                    e.target.position({ x: targetX, y: targetY });
                  }
                }

                newPoints[offset] = targetX;
                newPoints[offset + 1] = targetY;
                onShapeTransform?.({ points: newPoints });
              }}
            />
          );
        })
      }
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
    </Group>
  );
}

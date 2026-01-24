import { useState, useRef } from 'react';
import { Line, Circle } from 'react-konva';
import { snapToAngle } from '../../utils/angleSnap';
import { HoverHighlight } from './CommonComponents';

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
  const absPoints = shape.points.map((v, i) => i % 2 === 0 ? v + offsetX : v + offsetY);
  const canSelect = activeToolId === 'select' || activeToolId === 'polyline';
  const showHoverHighlight = isHovered && !isSelected && canSelect && !shape.isDrawing;

  return (
    <>
      <Line
        ref={setRef}
        name={`shape-polyline-${index}`}
        points={absPoints}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        opacity={shape.opacity}
        dash={shape.dash}
        lineCap={shape.lineCap}
        lineJoin={shape.lineJoin}
        tension={tension}
        hitStrokeWidth={20}
        draggable={isSelected && !shape.isDrawing}
        onClick={(e) => {
          if (shape.isDrawing) return;
          if (canSelect) {
            e.cancelBubble = true;
            onSelect?.(index, e.evt?.ctrlKey || e.evt?.metaKey);
          }
        }}
        onTap={(e) => {
          if (shape.isDrawing) return;
          if (canSelect) {
            e.cancelBubble = true;
            onSelect?.(index, e.evt?.ctrlKey || e.evt?.metaKey);
          }
        }}
        onMouseEnter={() => {
          if (shape.isDrawing) return;
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
            const dx = node.x();
            const dy = node.y();
            node.position({ x: 0, y: 0 });
            onShapeTransform({ offsetX: offsetX + dx, offsetY: offsetY + dy });
          }
        }}
      />
      {shape.isDrawing && shape.points.length >= 2 &&
        Array.from({ length: shape.points.length / 2 }).map((_, i) => (
          <Circle
            key={`draw-${index}-${i}`}
            x={absPoints[i * 2]}
            y={absPoints[i * 2 + 1]}
            radius={4}
            fill={shape.stroke}
            stroke="#fff"
            strokeWidth={1}
            listening={false}
          />
        ))
      }
      {isSelected && !shape.isDrawing &&
        Array.from({ length: shape.points.length / 2 }).map((_, i) => {
          const offset = i * 2;
          return (
            <Circle
              key={`handle-${index}-${i}`}
              name={`shape-anchor shape-polyline-${index}`}
              x={absPoints[offset]}
              y={absPoints[offset + 1]}
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
                let targetX = e.target.x() - offsetX;
                let targetY = e.target.y() - offsetY;

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
                    e.target.position({
                      x: targetX + offsetX,
                      y: targetY + offsetY
                    });
                  }
                }

                newPoints[offset] = targetX;
                newPoints[offset + 1] = targetY;
                onShapeTransform?.({ points: newPoints });
              }}
              onDragEnd={(e) => {
                const newPoints = [...shape.points];
                let targetX = e.target.x() - offsetX;
                let targetY = e.target.y() - offsetY;

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
                    e.target.position({
                      x: targetX + offsetX,
                      y: targetY + offsetY
                    });
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
      {!shape.isDrawing && <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />}
    </>
  );
}

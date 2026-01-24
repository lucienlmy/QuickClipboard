import { useState } from 'react';
import { Group, Shape, Line, Circle, Rect } from 'react-konva';
import { snapToAngle } from '../../utils/angleSnap';
import { HOVER_STROKE_COLOR, HOVER_STROKE_WIDTH, HOVER_DASH } from './CommonComponents';

export default function CurveArrow({ shape, index, shapeRef, isSelected, isSingleSelected, activeToolId, onSelect, onShapeTransform, onHoverChange, isCreating }) {
  const [hoveredAnchor, setHoveredAnchor] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const offsetX = shape.x || 0;
  const offsetY = shape.y || 0;
  const relPoints = shape.points || [0, 0, 0, 0, 0, 0];
  const x1 = relPoints[0];
  const y1 = relPoints[1];
  const cx = relPoints[2];
  const cy = relPoints[3];
  const x2 = relPoints[4];
  const y2 = relPoints[5];

  const pointerLength = (shape.strokeWidth || 12) * 2.5;

  const t = 0.95;
  const dx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
  const dy = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
  const angle = Math.atan2(dy, dx);

  const stopDistance = pointerLength * 0.8;
  const curveLength = Math.sqrt(dx * dx + dy * dy);
  const stopT = Math.max(0, 1 - stopDistance / curveLength * 0.3);

  const stopX = (1 - stopT) * (1 - stopT) * x1 + 2 * (1 - stopT) * stopT * cx + stopT * stopT * x2;
  const stopY = (1 - stopT) * (1 - stopT) * y1 + 2 * (1 - stopT) * stopT * cy + stopT * stopT * y2;

  const canSelect = activeToolId === 'select' || activeToolId === 'curveArrow';
  const showHoverHighlight = isHovered && !isSelected && canSelect && !isCreating;

  return (
    <Group
      ref={shapeRef}
      name={`shape-curveArrow-${index}`}
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
          onShapeTransform({ x: node.x(), y: node.y() });
        }
      }}
      onTransformEnd={(e) => {
        if (isSelected && onShapeTransform) {
          const node = e.target;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          const updates = {
            x: node.x(),
            y: node.y(),
          };

          if (scaleX !== 1 || scaleY !== 1) {
            node.scaleX(1);
            node.scaleY(1);

            const newPoints = shape.points.map((v, i) => {
              if (i % 2 === 0) {
                return v * scaleX;
              } else {
                return v * scaleY;
              }
            });

            updates.points = newPoints;
            updates.strokeWidth = (shape.strokeWidth || 12) * Math.max(scaleX, scaleY);
          }

          onShapeTransform(updates);
        }
      }}
    >
      <Shape
        sceneFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(cx, cy, stopX, stopY);
          ctx.strokeShape(shape);
        }}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        opacity={shape.opacity}
        dash={shape.dash}
        lineCap={shape.lineCap}
        lineJoin={shape.lineJoin}
        hitStrokeWidth={20}
      />
      <Line
        points={[
          x2 - Math.cos(angle) * pointerLength * 0.6 + Math.cos(angle - Math.PI / 2) * pointerLength * 0.3,
          y2 - Math.sin(angle) * pointerLength * 0.6 + Math.sin(angle - Math.PI / 2) * pointerLength * 0.3,
          x2,
          y2,
          x2 - Math.cos(angle) * pointerLength * 0.6 + Math.cos(angle + Math.PI / 2) * pointerLength * 0.3,
          y2 - Math.sin(angle) * pointerLength * 0.6 + Math.sin(angle + Math.PI / 2) * pointerLength * 0.3,
          x2 - Math.cos(angle) * pointerLength * 0.4,
          y2 - Math.sin(angle) * pointerLength * 0.4,
          x2 - Math.cos(angle) * pointerLength * 0.6 + Math.cos(angle - Math.PI / 2) * pointerLength * 0.3,
          y2 - Math.sin(angle) * pointerLength * 0.6 + Math.sin(angle - Math.PI / 2) * pointerLength * 0.3,
        ]}
        closed={true}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        fill={shape.stroke}
        opacity={shape.opacity}
        lineCap="square"
        lineJoin="miter"
      />

      {isSingleSelected && !isCreating && (
        <>
          <Line
            name="shape-anchor"
            points={[x1, y1, cx, cy]}
            dash={[8, 8]}
            dashOffset={8}
            strokeWidth={2}
            stroke="white"
            lineCap="butt"
            opacity={1}
            listening={false}
          />
          <Line
            name="shape-anchor"
            points={[cx, cy, x2, y2]}
            dash={[8, 8]}
            dashOffset={8}
            strokeWidth={2}
            stroke="white"
            lineCap="butt"
            opacity={1}
            listening={false}
          />
          <Line
            name="shape-anchor"
            points={[x1, y1, cx, cy]}
            dash={[8, 8]}
            strokeWidth={2}
            stroke="#666"
            lineCap="butt"
            opacity={1}
            listening={false}
          />
          <Line
            name="shape-anchor"
            points={[cx, cy, x2, y2]}
            dash={[8, 8]}
            strokeWidth={2}
            stroke="#666"
            lineCap="butt"
            opacity={1}
            listening={false}
          />
        </>
      )}

      {isSingleSelected && !isCreating && [
        { x: x1, y: y1, offset: 0 },
        { x: cx, y: cy, offset: 2 },
        { x: x2, y: y2, offset: 4 },
      ].map(({ x, y, offset }, i) => {
        const anchorId = `curveArrow-${index}-${i}`;
        const isHovered = hoveredAnchor === anchorId;

        return (
          <Circle
            key={`handle-${index}-${i}`}
            name={`shape-anchor`}
            x={x}
            y={y}
            radius={5}
            fill="#fff"
            stroke="#1677ff"
            strokeWidth={isHovered ? 2 : 1}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage();
              const group = e.target.getParent();

              const groupWasDraggable = group.draggable();
              group.draggable(false);

              const startPos = stage.getPointerPosition();
              const startX = x;
              const startY = y;

              const handleMouseMove = (moveEvent) => {
                const pos = stage.getPointerPosition();
                const dx = (pos.x - startPos.x) / stage.scaleX();
                const dy = (pos.y - startPos.y) / stage.scaleY();

                let newX = startX + dx;
                let newY = startY + dy;

                if (moveEvent.shiftKey && (offset === 0 || offset === 4)) {
                  const centerX = shape.points[2];
                  const centerY = shape.points[3];
                  const snapped = snapToAngle(centerX, centerY, newX, newY);
                  newX = snapped.x;
                  newY = snapped.y;
                }

                const newPoints = [...shape.points];
                newPoints[offset] = newX;
                newPoints[offset + 1] = newY;
                onShapeTransform?.({ points: newPoints });
              };

              const handleMouseUp = () => {
                group.draggable(groupWasDraggable);
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
              };

              window.addEventListener('mousemove', handleMouseMove);
              window.addEventListener('mouseup', handleMouseUp);
            }}
            onClick={(e) => e.cancelBubble = true}
            onTap={(e) => e.cancelBubble = true}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'pointer';
              setHoveredAnchor(anchorId);
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
              setHoveredAnchor(null);
            }}
          />
        );
      })}

      {showHoverHighlight && (
        <Rect
          x={Math.min(x1, cx, x2) - 3}
          y={Math.min(y1, cy, y2) - 3}
          width={Math.max(x1, cx, x2) - Math.min(x1, cx, x2) + 6}
          height={Math.max(y1, cy, y2) - Math.min(y1, cy, y2) + 6}
          stroke={HOVER_STROKE_COLOR}
          strokeWidth={HOVER_STROKE_WIDTH}
          dash={HOVER_DASH}
          listening={false}
        />
      )}
    </Group>
  );
}

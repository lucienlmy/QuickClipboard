import { useState, useRef, useEffect } from 'react';
import { Line, Rect, Ellipse, Arrow, Circle, RegularPolygon, Text, Image as KonvaImage } from 'react-konva';
import NumberMarker from './shapes/NumberMarker';

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

const HOVER_STROKE_COLOR = '#1677ff';
const HOVER_STROKE_WIDTH = 2;
const HOVER_DASH = [4, 4];

const createCommonProps = (isSelected, onSelect, index, activeToolId, shapeTool, setIsHovered, onHoverChange) => {
  const canSelect = activeToolId === 'select' || activeToolId === shapeTool;
  return {
    name: `shape-${shapeTool}-${index}`,
    listening: true,
    draggable: isSelected,
    onClick: (e) => {
      if (canSelect) {
        e.cancelBubble = true;
        onSelect?.(index, e.evt?.ctrlKey || e.evt?.metaKey);
      }
    },
    onTap: (e) => {
      if (canSelect) {
        e.cancelBubble = true;
        onSelect?.(index, e.evt?.ctrlKey || e.evt?.metaKey);
      }
    },
    onMouseEnter: () => {
      if (canSelect) {
        setIsHovered?.(true);
        onHoverChange?.(true);
      }
    },
    onMouseLeave: () => {
      setIsHovered?.(false);
      onHoverChange?.(false);
    },
  };
};

const SELECTION_STROKE_COLOR = '#00a8ff';

const HighlightBorder = ({ nodeRef, visible, isSelection = false }) => {
  const [bounds, setBounds] = useState(null);
  
  useEffect(() => {
    if (!visible || !nodeRef?.current) {
      setBounds(null);
      return;
    }
    const rect = nodeRef.current.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: false });
    const padding = 3;
    setBounds({
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
  }, [visible, nodeRef]);
  
  if (!visible || !bounds) return null;
  
  return (
    <Rect
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      stroke={isSelection ? SELECTION_STROKE_COLOR : HOVER_STROKE_COLOR}
      strokeWidth={HOVER_STROKE_WIDTH}
      dash={HOVER_DASH}
      listening={false}
    />
  );
};

const HoverHighlight = ({ nodeRef, visible }) => (
  <HighlightBorder nodeRef={nodeRef} visible={visible} isSelection={false} />
);

// 渲染单个形状
export const ShapeRenderer = ({
  shape,
  index,
  shapeRef,
  isSelected,
  activeToolId,
  onSelect,
  onShapeTransform,
  onShapeTransformByIndex,
  onTextEdit,
  isEditing,
  onHoverChange,
  isCreating = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
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
  
  const canSelect = activeToolId === 'select' || activeToolId === shape.tool;
  const commonProps = createCommonProps(isSelected, onSelect, index, activeToolId, shape.tool, setIsHovered, onHoverChange);
  const showHoverHighlight = isHovered && !isSelected && canSelect && !isCreating;

  // 曲线箭头
  if (shape.tool === 'curveArrow') {
    const offsetX = shape.x || 0;
    const offsetY = shape.y || 0;
    const absPoints = shape.points.map((v, i) => i % 2 === 0 ? v + offsetX : v + offsetY);
    
    return (
      <>
        <Arrow
          ref={setRef}
          name={`shape-curveArrow-${index}`}
          points={absPoints}
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
          onDragStart={() => setIsDragging(true)}
          onDragEnd={(e) => {
            setIsDragging(false);
            if (isSelected && onShapeTransform) {
              const node = e.target;
              const dx = node.x();
              const dy = node.y();
              node.position({ x: 0, y: 0 });
              onShapeTransform({ x: offsetX + dx, y: offsetY + dy });
            }
          }}
        />
        {isSelected && !isDragging && [0, 2, 4].map((offset, i) => (
          <Circle
            key={`handle-${index}-${i}`}
            name={`shape-curveArrow-${index}`}
            x={absPoints[offset]}
            y={absPoints[offset + 1]}
            radius={5}
            fill="#fff"
            stroke="#1677ff"
            strokeWidth={1}
            draggable
            onClick={(e) => e.cancelBubble = true}
            onTap={(e) => e.cancelBubble = true}
            onDragMove={(e) => {
              const newPoints = [...shape.points];
              newPoints[offset] = e.target.x() - offsetX;
              newPoints[offset + 1] = e.target.y() - offsetY;
              onShapeTransform?.({ points: newPoints });
            }}
            onDragEnd={(e) => {
              const newPoints = [...shape.points];
              newPoints[offset] = e.target.x() - offsetX;
              newPoints[offset + 1] = e.target.y() - offsetY;
              onShapeTransform?.({ points: newPoints });
            }}
          />
        ))}
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  // 折线工具
  if (shape.tool === 'polyline') {
    const offsetX = shape.offsetX ?? 0;
    const offsetY = shape.offsetY ?? 0;
    const tension = shape.connectionType === 'curve' ? 0.5 : 0;
    const absPoints = shape.points.map((v, i) => i % 2 === 0 ? v + offsetX : v + offsetY);

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
          onDragStart={() => setIsDragging(true)}
          onDragEnd={(e) => {
            setIsDragging(false);
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
        {isSelected && !shape.isDrawing && !isDragging &&
          Array.from({ length: shape.points.length / 2 }).map((_, i) => {
            const offset = i * 2;
            return (
              <Circle
                key={`handle-${index}-${i}`}
                name={`shape-polyline-${index}`}
                x={absPoints[offset]}
                y={absPoints[offset + 1]}
                radius={5}
                fill="#fff"
                stroke="#1890ff"
                strokeWidth={2}
                draggable
                onClick={(e) => e.cancelBubble = true}
                onTap={(e) => e.cancelBubble = true}
                onDragMove={(e) => {
                  const newPoints = [...shape.points];
                  newPoints[offset] = e.target.x() - offsetX;
                  newPoints[offset + 1] = e.target.y() - offsetY;
                  onShapeTransform?.({ points: newPoints });
                }}
                onDragEnd={(e) => {
                  const newPoints = [...shape.points];
                  newPoints[offset] = e.target.x() - offsetX;
                  newPoints[offset + 1] = e.target.y() - offsetY;
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

  // 画笔工具
  if (shape.tool === 'pen') {
    const penProps = createCommonProps(isSelected, onSelect, index, activeToolId, 'select', setIsHovered, onHoverChange);
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

  // 序号标注工具
  if (shape.tool === 'number') {
    return (
      <NumberMarker
        shape={shape}
        index={index}
        isSelected={isSelected}
        canSelect={canSelect}
        onSelect={() => onSelect?.(index, false)}
        onTransform={(updatedShape) => onShapeTransformByIndex?.(index, updatedShape)}
        onHoverChange={onHoverChange}
      />
    );
  }

  // 文本工具
  if (shape.tool === 'text') {
    const fontStyleArray = Array.isArray(shape.fontStyle) ? shape.fontStyle : [];
    let fontStyleString = 'normal';
    if (fontStyleArray.includes('bold') && fontStyleArray.includes('italic')) {
      fontStyleString = 'bold italic';
    } else if (fontStyleArray.includes('italic')) {
      fontStyleString = 'italic';
    } else if (fontStyleArray.includes('bold')) {
      fontStyleString = 'bold';
    }

    return (
      <>
        <Text
          ref={setRef}
          x={shape.x}
          y={shape.y}
          text={shape.text || '双击编辑文本'}
          fontSize={shape.fontSize || 24}
          fontFamily={shape.fontFamily || 'Arial, Microsoft YaHei, sans-serif'}
          fontStyle={fontStyleString}
          fill={shape.fill || '#ff4d4f'}
          align={shape.align || 'left'}
          width={shape.width || 200}
          lineHeight={shape.lineHeight || 1.2}
          skewX={fontStyleArray.includes('italic') ? -0.14 : 0}
          opacity={isEditing ? 0 : (shape.opacity || 1)}
          stroke={shape.stroke || ''}
          strokeWidth={shape.strokeWidth || 0}
          {...commonProps}
          onDblClick={(e) => {
            if (isSelected && onTextEdit) {
              e.cancelBubble = true;
              onTextEdit(index);
            }
          }}
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
                fontSize: Math.max(12, (shape.fontSize || 24) * scaleY),
              });
            }
          }}
        />
        <HoverHighlight nodeRef={internalRef} visible={showHoverHighlight} />
      </>
    );
  }

  // 马赛克工具
  if (shape.tool === 'mosaic') {
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
  }

  // 形状工具
  if (shape.tool === 'shape') {
    const fillColor = applyOpacity(shape.fill, shape.fillOpacity);
    const strokeColor = applyOpacity(shape.stroke, shape.strokeOpacity);

    // 箭头
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

    // 正圆
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

    // 菱形
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

    // 正多边形
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

    // 椭圆
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

    // 矩形
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

  return null;
};

import { useState, useRef } from 'react';
import { Text } from 'react-konva';
import { createCommonProps, HoverHighlight } from './CommonComponents';

export default function TextShape({ shape, index, shapeRef, isSelected, activeToolId, onSelect, onShapeTransform, onTextEdit, isEditing, onHoverChange }) {
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

  const fontStyleArray = Array.isArray(shape.fontStyle) ? shape.fontStyle : [];
  let fontStyleString = 'normal';
  if (fontStyleArray.includes('bold') && fontStyleArray.includes('italic')) {
    fontStyleString = 'bold italic';
  } else if (fontStyleArray.includes('italic')) {
    fontStyleString = 'italic';
  } else if (fontStyleArray.includes('bold')) {
    fontStyleString = 'bold';
  }

  const commonProps = createCommonProps(isSelected, onSelect, index, activeToolId, 'text', setIsHovered, onHoverChange);
  const canSelect = activeToolId === 'select' || activeToolId === 'text';
  const showHoverHighlight = isHovered && !isSelected && canSelect;

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

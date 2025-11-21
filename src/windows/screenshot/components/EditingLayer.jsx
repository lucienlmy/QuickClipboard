import React, { useRef, useEffect } from 'react';
import { Layer, Transformer, Rect } from 'react-konva';
import { ShapeRenderer } from './ShapeRenderer';
import TextEditor from './TextEditor';

const EditingLayer = ({ shapes, listening, selectedShapeIndices = [], onSelectShape, onShapeTransform, isSelectMode, selectionBox, onTextEdit, editingTextIndex, onTextChange, onTextEditClose }) => {
  const transformerRef = useRef(null);
  const shapeRefs = useRef([]);
  const layerRef = useRef(null);
  const mouseDownPosRef = useRef(null);

  useEffect(() => {
    if (transformerRef.current && selectedShapeIndices.length > 0) {
      const selectedNodes = selectedShapeIndices
        .map(index => shapeRefs.current[index])
        .filter(node => node);
      
      if (selectedNodes.length > 0) {
        transformerRef.current.nodes(selectedNodes);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedShapeIndices, shapes]);

  const handleLayerMouseDown = (e) => {
    if (isSelectMode && e.target.name() === 'editingLayerBackground') {
      const pos = e.target.getStage().getPointerPosition();
      mouseDownPosRef.current = pos;
    }
  };

  const handleLayerClick = (e) => {
    if (isSelectMode && e.target.name() === 'editingLayerBackground') {
      const pos = e.target.getStage().getPointerPosition();
      const downPos = mouseDownPosRef.current;
      
      if (downPos && Math.abs(pos.x - downPos.x) < 5 && Math.abs(pos.y - downPos.y) < 5) {
        onSelectShape?.(null, false);
      }
      
      mouseDownPosRef.current = null;
    }
  };

  return (
    <Layer 
      ref={layerRef}
      id="screenshot-editing-layer" 
      listening={listening}
    >
      {/* 透明背景用于捕获空白区域的事件 */}
      {isSelectMode && (
        <Rect
          name="editingLayerBackground"
          x={0}
          y={0}
          width={999999}
          height={999999}
          fill="transparent"
          listening={true}
          onMouseDown={handleLayerMouseDown}
          onClick={handleLayerClick}
          onTap={handleLayerClick}
        />
      )}
      {shapes.map((shape, i) => (
        <ShapeRenderer
          key={i}
          shape={shape}
          index={i}
          shapeRef={(node) => { shapeRefs.current[i] = node; }}
          isSelected={selectedShapeIndices.includes(i)}
          isSelectMode={isSelectMode}
          shapeListening={listening && isSelectMode}
          onSelectShape={onSelectShape}
          onShapeTransform={onShapeTransform}
          onTextEdit={onTextEdit}
          isEditing={editingTextIndex === i}
        />
      ))}
      {isSelectMode && selectedShapeIndices.length > 0 && editingTextIndex === null && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
      {isSelectMode && selectionBox && (
        <Rect
          x={selectionBox.width >= 0 ? selectionBox.x : selectionBox.x + selectionBox.width}
          y={selectionBox.height >= 0 ? selectionBox.y : selectionBox.y + selectionBox.height}
          width={Math.abs(selectionBox.width)}
          height={Math.abs(selectionBox.height)}
          stroke="#1677FF"
          strokeWidth={1}
          dash={[4, 4]}
          fill="rgba(22, 119, 255, 0.1)"
          listening={false}
        />
      )}
      {editingTextIndex !== null && shapes[editingTextIndex] && (
        <TextEditor
          shape={shapes[editingTextIndex]}
          onTextChange={(text) => onTextChange(text, editingTextIndex)}
          onClose={onTextEditClose}
        />
      )}
    </Layer>
  );
};

export default EditingLayer;

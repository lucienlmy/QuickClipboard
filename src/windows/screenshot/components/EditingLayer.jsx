import React, { useRef, useEffect, useMemo } from 'react';
import { Layer, Transformer, Rect, Group } from 'react-konva';
import { ShapeRenderer } from './ShapeRenderer';
import TextEditor from './TextEditor';
import WatermarkRenderer from './WatermarkRenderer';
import BorderRenderer from './BorderRenderer';

const EditingLayer = ({ shapes, listening, selectedShapeIndices = [], onSelectShape, onShapeTransform, onShapeTransformByIndex, isSelectMode, selectionBox, onTextEdit, editingTextIndex, onTextChange, onTextEditClose, watermarkConfig, borderConfig, selection, cornerRadius = 0, stageSize, pinEditMode }) => {
  const transformerRef = useRef(null);
  const shapeRefs = useRef([]);
  const layerRef = useRef(null);
  const mouseDownPosRef = useRef(null);

  useEffect(() => {
    if (transformerRef.current && selectedShapeIndices.length > 0) {
      const hasMosaicShape = selectedShapeIndices.some(index => {
        const shape = shapes[index];
        return shape?.tool === 'mosaic' && shape?.processedImage;
      });
      
      if (hasMosaicShape) {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
        return;
      }
      
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

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.batchDraw();
    }
  }, [watermarkConfig?.enabled]);

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

  const clipFunc = useMemo(() => {
    if (!pinEditMode || !selection) return null;
    return (ctx) => {
      ctx.rect(selection.x, selection.y, selection.width, selection.height);
    };
  }, [pinEditMode, selection]);

  const renderShapes = () => (
    shapes
      .map((shape, i) => ({ shape, originalIndex: i }))
      .sort((a, b) => {
        const aIsBackgroundMosaic = a.shape.tool === 'mosaic' && a.shape.processedImage && a.shape.coverageMode === 'background';
        const bIsBackgroundMosaic = b.shape.tool === 'mosaic' && b.shape.processedImage && b.shape.coverageMode === 'background';
        
        if (aIsBackgroundMosaic && !bIsBackgroundMosaic) return -1;
        if (!aIsBackgroundMosaic && bIsBackgroundMosaic) return 1;
        
        return a.originalIndex - b.originalIndex;
      })
      .map(({ shape, originalIndex }) => (
        <ShapeRenderer
          key={originalIndex}
          shape={shape}
          index={originalIndex}
          shapeRef={(node) => { shapeRefs.current[originalIndex] = node; }}
          isSelected={selectedShapeIndices.includes(originalIndex)}
          isSelectMode={isSelectMode}
          shapeListening={listening && isSelectMode}
          onSelectShape={onSelectShape}
          onShapeTransform={onShapeTransform}
          onShapeTransformByIndex={onShapeTransformByIndex}
          onTextEdit={onTextEdit}
          isEditing={editingTextIndex === originalIndex}
        />
      ))
  );

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
      {/* 按层级顺序渲染：背景模式马赛克在最底层 */}
      {clipFunc ? (
        <Group clipFunc={clipFunc}>
          {renderShapes()}
        </Group>
      ) : (
        renderShapes()
      )}
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
      {/* 边框渲染 */}
      <BorderRenderer
        borderConfig={borderConfig}
        selection={selection}
        cornerRadius={cornerRadius}
      />
      {/* 水印渲染在最上层 */}
      <WatermarkRenderer 
        watermarkConfig={watermarkConfig} 
        selection={selection} 
        stageSize={stageSize}
      />
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

import { useRef, useEffect, useMemo } from 'react';
import { Layer, Transformer, Rect, Group } from 'react-konva';
import { ShapeRenderer } from './ShapeRenderer';
import TextEditor from './TextEditor';
import WatermarkRenderer from './WatermarkRenderer';
import BorderRenderer from './BorderRenderer';

const EditingLayer = ({
  shapes,
  listening,
  selectedShapeIndices = [],
  activeToolId,
  onSelect,
  onShapeTransform,
  onShapeTransformByIndex,
  onTextEdit,
  editingTextIndex,
  onTextChange,
  onTextEditClose,
  watermarkConfig,
  borderConfig,
  selection,
  cornerRadius = 0,
  stageSize,
  pinEditMode,
  selectionBox,
  isSelectToolActive,
  onHoverChange,
  isDrawingShape = false,
}) => {
  const transformerRef = useRef(null);
  const shapeRefs = useRef([]);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!transformerRef.current) return;
    
    if (selectedShapeIndices.length > 0) {
      const transformableTools = ['shape', 'text', 'pen'];
      const selectedNodes = selectedShapeIndices
        .filter(i => transformableTools.includes(shapes[i]?.tool))
        .map(i => shapeRefs.current[i])
        .filter(Boolean);
      transformerRef.current.nodes(selectedNodes);
    } else {
      transformerRef.current.nodes([]);
    }
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedShapeIndices, shapes]);

  useEffect(() => {
    layerRef.current?.batchDraw();
  }, [watermarkConfig?.enabled]);

  const clipFunc = useMemo(() => {
    if (!pinEditMode || !selection) return null;
    return (ctx) => ctx.rect(selection.x, selection.y, selection.width, selection.height);
  }, [pinEditMode, selection]);

  const renderShapes = () => (
    shapes
      .map((shape, i) => ({ shape, originalIndex: i }))
      .sort((a, b) => {
        const aIsBg = a.shape.tool === 'mosaic' && a.shape.processedImage && a.shape.coverageMode === 'background';
        const bIsBg = b.shape.tool === 'mosaic' && b.shape.processedImage && b.shape.coverageMode === 'background';
        if (aIsBg && !bIsBg) return -1;
        if (!aIsBg && bIsBg) return 1;
        return a.originalIndex - b.originalIndex;
      })
      .map(({ shape, originalIndex }) => (
        <ShapeRenderer
          key={originalIndex}
          shape={shape}
          index={originalIndex}
          shapeRef={(node) => { shapeRefs.current[originalIndex] = node; }}
          isSelected={selectedShapeIndices.includes(originalIndex)}
          activeToolId={activeToolId}
          onSelect={onSelect}
          onShapeTransform={onShapeTransform}
          onShapeTransformByIndex={onShapeTransformByIndex}
          onTextEdit={onTextEdit}
          isEditing={editingTextIndex === originalIndex}
          onHoverChange={onHoverChange}
          isCreating={isDrawingShape && originalIndex === shapes.length - 1}
        />
      ))
  );

  return (
    <Layer ref={layerRef} id="screenshot-editing-layer" listening={listening}>
      {clipFunc ? (
        <Group clipFunc={clipFunc}>{renderShapes()}</Group>
      ) : (
        renderShapes()
      )}
      
      {selectedShapeIndices.length > 0 && editingTextIndex === null && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
      {isSelectToolActive && selectionBox && (
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
      
      <BorderRenderer borderConfig={borderConfig} selection={selection} cornerRadius={cornerRadius} />
      <WatermarkRenderer watermarkConfig={watermarkConfig} selection={selection} stageSize={stageSize} />
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

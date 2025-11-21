import React, { useRef, useEffect } from 'react';
import { Layer, Transformer } from 'react-konva';
import { ShapeRenderer } from './ShapeRenderer';

const EditingLayer = ({ shapes, listening, selectedShapeIndex, onSelectShape, onShapeTransform, isSelectMode }) => {
  const transformerRef = useRef(null);
  const shapeRefs = useRef([]);
  const layerRef = useRef(null);

  useEffect(() => {
    if (transformerRef.current && selectedShapeIndex !== null && shapeRefs.current[selectedShapeIndex]) {
      const node = shapeRefs.current[selectedShapeIndex];
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedShapeIndex, shapes]);

  const handleStageClick = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target === layerRef.current;
    if (clickedOnEmpty && isSelectMode) {
      onSelectShape?.(null);
    }
  };

  return (
    <Layer 
      ref={layerRef}
      id="screenshot-editing-layer" 
      listening={listening}
      onClick={handleStageClick}
      onTap={handleStageClick}
    >
      {shapes.map((shape, i) => (
        <ShapeRenderer
          key={i}
          shape={shape}
          index={i}
          shapeRef={(node) => { shapeRefs.current[i] = node; }}
          isSelected={selectedShapeIndex === i}
          isSelectMode={isSelectMode}
          shapeListening={listening && isSelectMode}
          onSelectShape={onSelectShape}
          onShapeTransform={onShapeTransform}
        />
      ))}
      {isSelectMode && selectedShapeIndex !== null && (
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
    </Layer>
  );
};

export default EditingLayer;

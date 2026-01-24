import { useState } from 'react';
import NumberMarker from './shapes/NumberMarker';
import CurveArrow from './shapes/CurveArrow';
import Polyline from './shapes/Polyline';
import Pen from './shapes/Pen';
import TextShape from './shapes/TextShape';
import Mosaic from './shapes/Mosaic';
import Shape from './shapes/Shape';

export const ShapeRenderer = ({
  shape,
  index,
  shapeRef,
  isSelected,
  isSingleSelected = false,
  activeToolId,
  onSelect,
  onShapeTransform,
  onShapeTransformByIndex,
  onTextEdit,
  isEditing,
  onHoverChange,
  isCreating = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const canSelect = activeToolId === 'select' || activeToolId === shape.tool;
  const showHoverHighlight = isHovered && !isSelected && canSelect && !isCreating;

  const handleHoverChange = (hovered) => {
    setIsHovered(hovered);
    onHoverChange?.(hovered);
  };

  if (shape.tool === 'curveArrow') {
    return (
      <CurveArrow
        shape={shape}
        index={index}
        shapeRef={shapeRef}
        isSelected={isSelected}
        isSingleSelected={isSingleSelected}
        activeToolId={activeToolId}
        onSelect={onSelect}
        onShapeTransform={onShapeTransform}
        onHoverChange={handleHoverChange}
        isCreating={isCreating}
      />
    );
  }

  if (shape.tool === 'polyline') {
    return (
      <Polyline
        shape={shape}
        index={index}
        shapeRef={shapeRef}
        isSelected={isSelected}
        activeToolId={activeToolId}
        onSelect={onSelect}
        onShapeTransform={onShapeTransform}
        onHoverChange={handleHoverChange}
      />
    );
  }

  if (shape.tool === 'pen') {
    return (
      <Pen
        shape={shape}
        index={index}
        shapeRef={shapeRef}
        isSelected={isSelected}
        activeToolId={activeToolId}
        onSelect={onSelect}
        onShapeTransform={onShapeTransform}
        onHoverChange={handleHoverChange}
      />
    );
  }

  if (shape.tool === 'number') {
    return (
      <NumberMarker
        shape={shape}
        index={index}
        isSelected={isSelected}
        canSelect={canSelect}
        onSelect={() => onSelect?.(index, false)}
        onTransform={(updatedShape) => onShapeTransformByIndex?.(index, updatedShape)}
        onHoverChange={handleHoverChange}
      />
    );
  }

  if (shape.tool === 'text') {
    return (
      <TextShape
        shape={shape}
        index={index}
        shapeRef={shapeRef}
        isSelected={isSelected}
        activeToolId={activeToolId}
        onSelect={onSelect}
        onShapeTransform={onShapeTransform}
        onTextEdit={onTextEdit}
        isEditing={isEditing}
        onHoverChange={handleHoverChange}
      />
    );
  }

  if (shape.tool === 'mosaic') {
    return (
      <Mosaic
        shape={shape}
        index={index}
        shapeRef={shapeRef}
        isSelected={isSelected}
        activeToolId={activeToolId}
        onSelect={onSelect}
        onHoverChange={handleHoverChange}
        isCreating={isCreating}
      />
    );
  }

  if (shape.tool === 'shape') {
    return (
      <Shape
        shape={shape}
        index={index}
        shapeRef={shapeRef}
        isSelected={isSelected}
        activeToolId={activeToolId}
        onSelect={onSelect}
        onShapeTransform={onShapeTransform}
        onHoverChange={handleHoverChange}
      />
    );
  }

  return null;
};

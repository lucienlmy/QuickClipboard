import React, { useMemo } from 'react';
import { Rect, Text } from 'react-konva';

//水印渲染组件
const WatermarkRenderer = ({ watermarkConfig, selection, stageSize }) => {

  const {
    text = '水印文本',
    mode = 'tile',
    fontSize = 32,
    fill = '#000000',
    fontFamily = 'Arial, Microsoft YaHei, sans-serif',
    opacity = 0.15,
    rotation = -30,
    spacing = 200,
    offsetX = 40,
    offsetY = 40,
  } = watermarkConfig || {};

  const { x: selX, y: selY, width: selWidth, height: selHeight } = selection || {};

  const watermarkPattern = useMemo(() => {
    if (mode !== 'tile') return null;

    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = spacing;
    patternCanvas.height = spacing;
    const ctx = patternCanvas.getContext('2d');

    ctx.clearRect(0, 0, spacing, spacing);

    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = fill;
    ctx.globalAlpha = opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(spacing / 2, spacing / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
    ctx.restore();

    return patternCanvas;
  }, [mode, text, fontSize, fill, fontFamily, opacity, rotation, spacing]);

  if (!watermarkConfig?.enabled || !selection) {
    return null;
  }

  if (mode === 'tile' && watermarkPattern) {
    return (
      <Rect
        x={0}
        y={0}
        width={stageSize?.width || 20000}  
        height={stageSize?.height || 20000}  
        fillPatternImage={watermarkPattern}
        fillPatternOffset={{ x: 0, y: 0 }}
        fillPatternRepeat='repeat'
        clipX={selX}
        clipY={selY}
        clipWidth={selWidth}
        clipHeight={selHeight}
        listening={false}
      />
    );
  }

  const isCornerMode = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(mode);
  const isCenterMode = mode === 'center';
  
  const effectiveRotation = (isCornerMode || isCenterMode) && rotation === -30 ? 0 : rotation;

  let x, y, align, width, textOffsetY;

  switch (mode) {
    case 'center':
      x = selX;                     
      y = selY + selHeight / 2;     
      align = 'center';             
      width = selWidth;             
      textOffsetY = fontSize / 2;   
      break;
    case 'topLeft':
      x = selX + offsetX;
      y = selY + offsetY;
      break;
    case 'topRight':
      x = selX;
      y = selY + offsetY;
      align = 'right';
      width = selWidth - offsetX;
      break;
    case 'bottomLeft':
      x = selX + offsetX;
      y = selY + selHeight - offsetY - fontSize;
      break;
    case 'bottomRight':
      x = selX;
      y = selY + selHeight - offsetY - fontSize;
      align = 'right';
      width = selWidth - offsetX;
      break;
    default:
      return null;
  }

  return (
    <Text
      x={x}
      y={y}
      text={text}
      fontSize={fontSize}
      fontFamily={fontFamily}
      fill={fill}
      opacity={opacity}
      rotation={effectiveRotation}
      align={align || 'left'}
      width={width}
      offsetY={textOffsetY}
      listening={false}
    />
  );
};

export default WatermarkRenderer;

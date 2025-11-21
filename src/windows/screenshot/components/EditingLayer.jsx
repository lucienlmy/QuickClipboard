import React from 'react';
import { Layer, Line } from 'react-konva';

const EditingLayer = ({ shapes, listening }) => {
  return (
    <Layer id="screenshot-editing-layer" listening={listening}>
      {shapes.map((shape, i) => {
        if (shape.tool === 'pen') {
          return (
            <Line
              key={i}
              points={shape.points}
              stroke={shape.stroke}
              strokeWidth={shape.strokeWidth}
              tension={shape.tension}
              lineCap={shape.lineCap}
              lineJoin={shape.lineJoin}
              dash={shape.dash}
              opacity={shape.opacity}
              globalCompositeOperation={shape.globalCompositeOperation}
            />
          );
        }
        return null;
      })}
    </Layer>
  );
};

export default EditingLayer;

import { Layer, Image as KonvaImage } from 'react-konva';

function BackgroundLayer({ screens }) {
  return (
    <Layer id="screenshot-bg-layer">
      {screens.map((s, idx) => (
        <KonvaImage
          key={idx}
          image={s.image}
          x={s.x}
          y={s.y}
          width={s.width}
          height={s.height}
        />
      ))}
    </Layer>
  );
}

export default BackgroundLayer;

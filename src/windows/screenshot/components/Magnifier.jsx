import { useEffect, useState, useRef, useCallback } from 'react';
import { useSnapshot } from 'valtio';
import { Group, Rect, Text, Image } from 'react-konva';
import { mouseStore } from '../store/mouseStore';

const GRID_ROWS = 7;
const GRID_COLS = 11;
const CELL_SIZE = 12;
const GRID_WIDTH = GRID_COLS * CELL_SIZE;
const GRID_HEIGHT = GRID_ROWS * CELL_SIZE;
const INFO_HEIGHT = 60;
const PADDING = 8;
const MAGNIFIER_WIDTH = GRID_WIDTH + PADDING * 2;
const COLOR_BAR_WIDTH = MAGNIFIER_WIDTH - PADDING * 2;

function Magnifier({ screens, visible, stageRegionManager, colorIncludeFormat = true, onMousePosUpdate, isDark = false }) {
  const { position: mousePos } = useSnapshot(mouseStore);
  const [colorFormat, setColorFormat] = useState('hex');
  const screenImageDataRef = useRef(new Map());
  const screenCacheRef = useRef({ screens: null, data: new Map() });
  const groupRef = useRef(null);
  const gridImageRef = useRef(null);
  const gridCanvasRef = useRef(null);
  const colorBgRef = useRef(null);
  const colorTextRef = useRef(null);
  const coordTextRef = useRef(null);
  const centerColorRef = useRef({ r: 0, g: 0, b: 0 });

  useEffect(() => {
    if (!screens?.length || screenCacheRef.current.screens === screens) return;
    screenCacheRef.current.screens = screens;
    const dataMap = new Map();
    screens.forEach((screen, i) => {
      if (!screen.image) return;
      const canvas = document.createElement('canvas');
      const img = screen.image;
      canvas.width = img.width || screen.width;
      canvas.height = img.height || screen.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      dataMap.set(i, {
        imageData,
        screen,
        scaleX: canvas.width / screen.width,
        scaleY: canvas.height / screen.height,
        imageWidth: canvas.width,
        imageHeight: canvas.height,
        bounds: { x1: screen.x, y1: screen.y, x2: screen.x + screen.width, y2: screen.y + screen.height }
      });
    });
    screenImageDataRef.current = dataMap;
    screenCacheRef.current.data = dataMap;
    if (!gridCanvasRef.current) {
      gridCanvasRef.current = document.createElement('canvas');
      gridCanvasRef.current.width = GRID_WIDTH;
      gridCanvasRef.current.height = GRID_HEIGHT;
    }
  }, [screens]);

  const getPixelColor = useCallback((x, y) => {
    for (const [, data] of screenImageDataRef.current) {
      const { imageData, bounds, scaleX, scaleY, imageWidth, imageHeight } = data;
      if (x >= bounds.x1 && x < bounds.x2 && y >= bounds.y1 && y < bounds.y2) {
        const pixelX = Math.floor((x - bounds.x1) * scaleX + 0.05);
        const pixelY = Math.floor((y - bounds.y1) * scaleY + 0.05);
        if (pixelX >= 0 && pixelX < imageWidth && pixelY >= 0 && pixelY < imageHeight) {
          const idx = (pixelY * imageWidth + pixelX) * 4;
          return { r: imageData.data[idx] ?? 0, g: imageData.data[idx + 1] ?? 0, b: imageData.data[idx + 2] ?? 0 };
        }
      }
    }
    return { r: 0, g: 0, b: 0 };
  }, []);

  const drawGridToCanvas = useCallback((pos) => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const centerRow = Math.floor(GRID_ROWS / 2), centerCol = Math.floor(GRID_COLS / 2);
    let centerColor = { r: 0, g: 0, b: 0 };
    
    const step = 1 / (window.devicePixelRatio || 1);

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const color = getPixelColor(
            pos.x + (col - centerCol) * step, 
            pos.y + (row - centerRow) * step
        );
        
        ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
        ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        if (row === centerRow && col === centerCol) centerColor = color;
        if (row !== centerRow || col !== centerCol) {
          ctx.strokeStyle = isDark ? '#4b5563' : '#d1d5db';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        }
      }
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(centerCol * CELL_SIZE, centerRow * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    return centerColor;
  }, [getPixelColor, isDark]);

  const getColorString = useCallback((color, format, includeFormat = true) => {
    const { r = 0, g = 0, b = 0 } = color;
    if (format === 'hex') {
      const hex = [r, g, b].map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('');
      return includeFormat ? `#${hex}` : hex;
    } else {
      const rgb = `${r},${g},${b}`;
      return includeFormat ? `RGB(${rgb})` : rgb;
    }
  }, []);

  const getTextColor = useCallback(({ r = 0, g = 0, b = 0 }) => 
    (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#1f2937' : '#ffffff'
  , []);

  const updateMagnifier = useCallback((pos) => {
    if (!groupRef.current || !gridImageRef.current || screenImageDataRef.current.size === 0) return;
    const totalHeight = GRID_HEIGHT + INFO_HEIGHT + PADDING * 2, offset = 20;
    const positions = [
      { x: pos.x + offset, y: pos.y + offset },
      { x: pos.x - MAGNIFIER_WIDTH - offset, y: pos.y + offset },
      { x: pos.x + offset, y: pos.y - totalHeight - offset },
      { x: pos.x - MAGNIFIER_WIDTH - offset, y: pos.y - totalHeight - offset }
    ];
    const validPos = positions.find(p => stageRegionManager.isRectInBounds({ ...p, width: MAGNIFIER_WIDTH, height: totalHeight })) || positions[0];
    groupRef.current.position(validPos);

    const centerColor = drawGridToCanvas(pos) || centerColorRef.current;
    centerColorRef.current = centerColor;
    gridImageRef.current.getLayer()?.batchDraw();

    let physicalX = Math.floor(pos.x);
    let physicalY = Math.floor(pos.y);
    for (const [, data] of screenImageDataRef.current) {
      const { bounds, scaleX, scaleY, screen } = data;
      if (pos.x >= bounds.x1 && pos.x < bounds.x2 && pos.y >= bounds.y1 && pos.y < bounds.y2) {
        const offsetX = pos.x - screen.x;
        const offsetY = pos.y - screen.y;
        physicalX = Math.floor(screen.physicalX + offsetX * scaleX);
        physicalY = Math.floor(screen.physicalY + offsetY * scaleY);
        break;
      }
    }

    colorBgRef.current?.fill(`rgb(${centerColor.r},${centerColor.g},${centerColor.b})`);
    colorTextRef.current?.text(getColorString(centerColor, colorFormat, true));
    colorTextRef.current?.fill(getTextColor(centerColor));
    coordTextRef.current?.text(`X: ${physicalX}  Y: ${physicalY}`);
    groupRef.current.getLayer()?.batchDraw();
  }, [stageRegionManager, drawGridToCanvas, getColorString, colorFormat, getTextColor]);

  useEffect(() => { onMousePosUpdate?.(updateMagnifier); }, [onMousePosUpdate, updateMagnifier]);

  useEffect(() => {
    const handleKey = (e) => {
      if (!visible) return;
      if (e.key === 'Shift') {
        setColorFormat(p => {
          const newFormat = p === 'hex' ? 'rgb' : 'hex';
          if (colorTextRef.current) {
            colorTextRef.current.text(getColorString(centerColorRef.current, newFormat, true));
            colorTextRef.current.getLayer()?.batchDraw();
          }
          return newFormat;
        });
      } else if (e.key === 'c' || e.key === 'C') {
        navigator.clipboard.writeText(getColorString(centerColorRef.current, colorFormat, colorIncludeFormat));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible, colorFormat, colorIncludeFormat, getColorString]);


  if (!visible || !mousePos) return null;

  const totalHeight = GRID_HEIGHT + INFO_HEIGHT + PADDING * 2, offset = 20;
  const positions = [
    { x: mousePos.x + offset, y: mousePos.y + offset },
    { x: mousePos.x - MAGNIFIER_WIDTH - offset, y: mousePos.y + offset },
    { x: mousePos.x + offset, y: mousePos.y - totalHeight - offset },
    { x: mousePos.x - MAGNIFIER_WIDTH - offset, y: mousePos.y - totalHeight - offset }
  ];
  const { x: magnifierX, y: magnifierY } = positions.find(p => 
    stageRegionManager.isRectInBounds({ ...p, width: MAGNIFIER_WIDTH, height: totalHeight })
  ) || positions[0];

  return (
    <Group ref={groupRef} x={magnifierX} y={magnifierY} listening={false}>
      {/* 背景 */}
      <Rect
        x={0}
        y={0}
        width={MAGNIFIER_WIDTH}
        height={totalHeight}
        fill={isDark ? '#1f2937' : 'white'}
        stroke={isDark ? '#374151' : '#e5e7eb'}
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={10}
        shadowOpacity={isDark ? 0.4 : 0.2}
        cornerRadius={8}
        perfectDrawEnabled={false}
      />

      {/* 网格 */}
      <Image
        ref={gridImageRef}
        x={PADDING}
        y={PADDING}
        image={gridCanvasRef.current}
        listening={false}
      />

      {/* 信息区域 */}
      <Group x={PADDING} y={GRID_HEIGHT + PADDING + 4}>
        {/* 色号显示 */}
        <Group>
          <Rect
            ref={colorBgRef}
            x={0}
            y={-2}
            width={COLOR_BAR_WIDTH}
            height={20}
            fill="rgb(0, 0, 0)"
            stroke={isDark ? '#4b5563' : '#d1d5db'}
            strokeWidth={1}
            cornerRadius={4}
          />
          {/* 色号文本 */}
          <Text
            ref={colorTextRef}
            x={6}
            y={1}
            text="#000000"
            fontSize={13}
            fontFamily="monospace"
            fill="#ffffff"
            fontStyle="bold"
          />
        </Group>

        {/* 坐标显示 */}
        <Text
          ref={coordTextRef}
          x={0}
          y={22}
          text="X: 0  Y: 0"
          fontSize={11}
          fontFamily="monospace"
          fill={isDark ? '#9ca3af' : '#6b7280'}
        />

        {/* 快捷键提示 */}
        <Text
          x={0}
          y={38}
          text="Shift切换 | C复制"
          fontSize={10}
          fontFamily="sans-serif"
          fill={isDark ? '#6b7280' : '#9ca3af'}
        />
      </Group>
    </Group>
  );
}

export default Magnifier;

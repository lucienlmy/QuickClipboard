import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
const TOTAL_HEIGHT = GRID_HEIGHT + INFO_HEIGHT + PADDING * 2;
const CENTER_ROW = 3; 
const CENTER_COL = 5; 

function Magnifier({ screens, visible, stageRegionManager, colorIncludeFormat = true, onMousePosUpdate, isDark = false, getScaleForPosition }) {
  const { position: mousePos } = useSnapshot(mouseStore);
  const [colorFormat, setColorFormat] = useState('hex');
  const screenImageDataRef = useRef([]);
  const screenCacheRef = useRef({ screens: null });
  const groupRef = useRef(null);
  const gridImageRef = useRef(null);
  const gridCanvasRef = useRef(null);
  const gridCtxRef = useRef(null);
  const colorBgRef = useRef(null);
  const colorTextRef = useRef(null);
  const coordTextRef = useRef(null);
  const centerColorRef = useRef({ r: 0, g: 0, b: 0 });
  const uiScaleRef = useRef(1);

  useEffect(() => {
    if (!screens?.length) return;

    const hasAnyImage = screens.some(s => s.image);
    if (!hasAnyImage) return;

    const cachedScreens = screenCacheRef.current.screens;
    if (cachedScreens === screens) return;

    if (cachedScreens?.length === screens.length) {
      const imagesChanged = screens.some((s, i) => s.image !== cachedScreens[i]?.image);
      if (!imagesChanged) return;
    }
    
    screenCacheRef.current.screens = screens;
    const dataArray = [];
    screens.forEach((screen) => {
      if (!screen.image) return;
      const canvas = document.createElement('canvas');
      const img = screen.image;
      canvas.width = img.width || screen.width;
      canvas.height = img.height || screen.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      dataArray.push({
        data: imageData.data,
        screen,
        scaleX: canvas.width / screen.width,
        scaleY: canvas.height / screen.height,
        imageWidth: canvas.width,
        imageHeight: canvas.height,
        x1: screen.x, y1: screen.y,
        x2: screen.x + screen.width, y2: screen.y + screen.height
      });
    });
    screenImageDataRef.current = dataArray;
    if (!gridCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = GRID_WIDTH;
      canvas.height = GRID_HEIGHT;
      gridCanvasRef.current = canvas;
      gridCtxRef.current = canvas.getContext('2d', { willReadFrequently: true });
    }
  }, [screens, isDark]);

  const drawGridToCanvas = useCallback((pos) => {
    const ctx = gridCtxRef.current;
    if (!ctx) return null;
    
    const dataArray = screenImageDataRef.current;
    const len = dataArray.length;
    const dpr = window.devicePixelRatio || 1;
    const step = 1 / dpr;
    const baseX = pos.x - CENTER_COL * step;
    const baseY = pos.y - CENTER_ROW * step;
    
    let centerR = 0, centerG = 0, centerB = 0;
    let lastR = -1, lastG = -1, lastB = -1;

    for (let row = 0; row < GRID_ROWS; row++) {
      const py = baseY + row * step;
      const cellY = row * CELL_SIZE;
      for (let col = 0; col < GRID_COLS; col++) {
        const px = baseX + col * step;
        let r = 0, g = 0, b = 0;

        for (let i = 0; i < len; i++) {
          const d = dataArray[i];
          if (px >= d.x1 && px < d.x2 && py >= d.y1 && py < d.y2) {
            const pixelX = ((px - d.x1) * d.scaleX + 0.5) | 0;
            const pixelY = ((py - d.y1) * d.scaleY + 0.5) | 0;
            if (pixelX >= 0 && pixelX < d.imageWidth && pixelY >= 0 && pixelY < d.imageHeight) {
              const idx = (pixelY * d.imageWidth + pixelX) << 2;
              r = d.data[idx];
              g = d.data[idx + 1];
              b = d.data[idx + 2];
            }
            break;
          }
        }
        
        if (r !== lastR || g !== lastG || b !== lastB) {
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          lastR = r; lastG = g; lastB = b;
        }
        ctx.fillRect(col * CELL_SIZE, cellY, CELL_SIZE, CELL_SIZE);
        
        if (row === CENTER_ROW && col === CENTER_COL) {
          centerR = r; centerG = g; centerB = b;
        }
      }
    }

    const gridColor = isDark ? '#4b5563' : '#d1d5db';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let row = 0; row < GRID_ROWS; row++) {
      const cellY = row * CELL_SIZE;
      for (let col = 0; col < GRID_COLS; col++) {
        if (row !== CENTER_ROW || col !== CENTER_COL) {
          ctx.strokeRect(col * CELL_SIZE, cellY, CELL_SIZE, CELL_SIZE);
        }
      }
    }
    
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(CENTER_COL * CELL_SIZE, CENTER_ROW * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    
    return { r: centerR, g: centerG, b: centerB };
  }, [isDark]);

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
    if (!groupRef.current || !gridImageRef.current) return;
    const dataArray = screenImageDataRef.current;
    if (dataArray.length === 0) return;
    
    const offset = 20;
    const positions = [
      { x: pos.x + offset, y: pos.y + offset },
      { x: pos.x - MAGNIFIER_WIDTH - offset, y: pos.y + offset },
      { x: pos.x + offset, y: pos.y - TOTAL_HEIGHT - offset },
      { x: pos.x - MAGNIFIER_WIDTH - offset, y: pos.y - TOTAL_HEIGHT - offset }
    ];
    const validPos = positions.find(p => stageRegionManager.isRectInBounds({ ...p, width: MAGNIFIER_WIDTH, height: TOTAL_HEIGHT })) || positions[0];
    groupRef.current.position(validPos);

    if (getScaleForPosition) {
      const newScale = getScaleForPosition(validPos.x, validPos.y);
      if (newScale !== uiScaleRef.current) {
        uiScaleRef.current = newScale;
        groupRef.current.scaleX(newScale);
        groupRef.current.scaleY(newScale);
      }
    }

    const centerColor = drawGridToCanvas(pos) || centerColorRef.current;
    centerColorRef.current = centerColor;

    const dpr = window.devicePixelRatio || 1;
    let physicalX = (pos.x * dpr) | 0;
    let physicalY = (pos.y * dpr) | 0;
    const len = dataArray.length;
    for (let i = 0; i < len; i++) {
      const d = dataArray[i];
      if (pos.x >= d.x1 && pos.x < d.x2 && pos.y >= d.y1 && pos.y < d.y2) {
        physicalX = (d.screen.physicalX + (pos.x - d.screen.x) * d.scaleX) | 0;
        physicalY = (d.screen.physicalY + (pos.y - d.screen.y) * d.scaleY) | 0;
        break;
      }
    }

    colorBgRef.current?.fill(`rgb(${centerColor.r},${centerColor.g},${centerColor.b})`);
    colorTextRef.current?.text(getColorString(centerColor, colorFormat, true));
    colorTextRef.current?.fill(getTextColor(centerColor));
    coordTextRef.current?.text(`X: ${physicalX}  Y: ${physicalY}`);

    groupRef.current.getLayer()?.batchDraw();
  }, [stageRegionManager, drawGridToCanvas, getColorString, colorFormat, getTextColor, getScaleForPosition]);

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

  const offset = 20;
  const magnifierPosition = useMemo(() => {
    if (!mousePos || !stageRegionManager) return { x: 0, y: 0 };
    const positions = [
      { x: mousePos.x + offset, y: mousePos.y + offset },
      { x: mousePos.x - MAGNIFIER_WIDTH - offset, y: mousePos.y + offset },
      { x: mousePos.x + offset, y: mousePos.y - TOTAL_HEIGHT - offset },
      { x: mousePos.x - MAGNIFIER_WIDTH - offset, y: mousePos.y - TOTAL_HEIGHT - offset }
    ];
    return positions.find(p => 
      stageRegionManager.isRectInBounds({ ...p, width: MAGNIFIER_WIDTH, height: TOTAL_HEIGHT })
    ) || positions[0];
  }, [mousePos, stageRegionManager]);

  const uiScale = useMemo(() => {
    if (!getScaleForPosition) return 1;
    return getScaleForPosition(magnifierPosition.x, magnifierPosition.y);
  }, [getScaleForPosition, magnifierPosition.x, magnifierPosition.y]);

  if (!visible || !mousePos) return null;

  return (
    <Group ref={groupRef} x={magnifierPosition.x} y={magnifierPosition.y} scaleX={uiScale} scaleY={uiScale} listening={false}>
      {/* 背景 */}
      <Rect
        x={0}
        y={0}
        width={MAGNIFIER_WIDTH}
        height={TOTAL_HEIGHT}
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

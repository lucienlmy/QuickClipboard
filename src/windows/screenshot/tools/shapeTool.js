const buildDiamondShape = (rect) => {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return {
    ...rect,
    centerX,
    centerY,
    points: [
      centerX, rect.y,
      rect.x + rect.width, centerY,
      centerX, rect.y + rect.height,
      rect.x, centerY,
    ],
  };
};
const SHAPE_DEFAULT_STYLE = {
  shapeType: 'rectangle',
  stroke: '#FF4D4F',
  strokeWidth: 6,
  strokeOpacity: 1,
  fill: '#FF4D4F',
  fillOpacity: 0,
  arrowhead: 'block',
};

const SHAPE_OPTIONS = [
  { value: 'rectangle', label: '矩形', icon: 'ti ti-square' },
  { value: 'ellipse', label: '椭圆', icon: 'ti ti-oval' },
  { value: 'circle', label: '正圆', icon: 'ti ti-circle' },
  { value: 'triangle', label: '三角形', icon: 'ti ti-triangle' },
  { value: 'diamond', label: '菱形', icon: 'ti ti-diamonds' },
  { value: 'pentagon', label: '五边形', icon: 'ti ti-pentagon' },
];

const SHAPE_PARAMETERS = [
  {
    id: 'shapeType',
    type: 'segmented',
    label: '形状',
    options: SHAPE_OPTIONS,
    wrap: true,
    iconOnly: true,
    columns: 3,
  },
  {
    id: 'stroke',
    type: 'color',
    label: '边框色',
    icon: 'ti ti-square-rounded',
  },
  {
    id: 'fill',
    type: 'color',
    label: '填充色',
    icon: 'ti ti-color-swatch',
  },
  {
    id: 'strokeWidth',
    type: 'slider',
    label: '边框粗细',
    min: 1,
    max: 64,
    step: 1,
    unit: 'px',
    showInput: true,
  },
  {
    id: 'strokeOpacity',
    type: 'slider',
    label: '边框透明',
    min: 0.1,
    max: 1,
    step: 0.05,
    formatter: (value) => `${Math.round(value * 100)}%`,
  },
  {
    id: 'fillOpacity',
    type: 'slider',
    label: '填充透明',
    min: 0,
    max: 1,
    step: 0.05,
    formatter: (value) => `${Math.round(value * 100)}%`,
  },
];

const normalizeRect = (start, current) => {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  return { x, y, width, height };
};

const polygonConfigs = {
  triangle: { sides: 3, rotation: 0 },
  pentagon: { sides: 5, rotation: 0 },
};

const clampSquareWithinRect = (rect) => {
  const size = Math.min(rect.width, rect.height);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return {
    x: centerX - size / 2,
    y: centerY - size / 2,
    width: size,
    height: size,
    centerX,
    centerY,
    size,
  };
};

export const createShapeTool = () => {
  return {
    id: 'shape',
    name: '形状',
    parameters: SHAPE_PARAMETERS,
    getDefaultStyle: () => ({ ...SHAPE_DEFAULT_STYLE }),

    createShape: (pos, style) => {
      const shapeStyle = { ...SHAPE_DEFAULT_STYLE, ...style };
      const base = {
        tool: 'shape',
        shapeType: shapeStyle.shapeType,
        stroke: shapeStyle.stroke,
        strokeWidth: shapeStyle.strokeWidth,
        strokeOpacity: shapeStyle.strokeOpacity,
        fill: shapeStyle.fill,
        fillOpacity: shapeStyle.fillOpacity,
        _meta: {
          startPoint: { x: pos.x, y: pos.y },
        },
      };

      if (shapeStyle.shapeType === 'arrow') {
        return {
          ...base,
          points: [pos.x, pos.y, pos.x, pos.y],
          pointerLength: 14,
          pointerWidth: 14,
        };
      }

      return {
        ...base,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
      };
    },

    updateShape: (shape, pos) => {
      if (shape.shapeType === 'arrow') {
        const points = [...shape.points];
        points[2] = pos.x;
        points[3] = pos.y;
        return {
          ...shape,
          points,
        };
      }

      const { startPoint } = shape._meta || { startPoint: { x: shape.x, y: shape.y } };
      const rect = normalizeRect(startPoint, pos);

      if (shape.shapeType === 'circle') {
        const square = clampSquareWithinRect(rect);
        return {
          ...shape,
          x: square.x,
          y: square.y,
          width: square.width,
          height: square.height,
          centerX: square.centerX,
          centerY: square.centerY,
          radius: square.size / 2,
        };
      }

      if (shape.shapeType === 'diamond') {
        const diamond = buildDiamondShape(rect);
        return {
          ...shape,
          x: diamond.x,
          y: diamond.y,
          width: diamond.width,
          height: diamond.height,
          centerX: diamond.centerX,
          centerY: diamond.centerY,
          points: diamond.points,
          rotation: shape.rotation ?? 0,
        };
      }

      if (polygonConfigs[shape.shapeType]) {
        const square = clampSquareWithinRect(rect);
        const config = polygonConfigs[shape.shapeType];
        return {
          ...shape,
          x: square.x,
          y: square.y,
          width: square.width,
          height: square.height,
          centerX: square.centerX,
          centerY: square.centerY,
          radius: square.size / 2,
          sides: config.sides,
          rotation: config.rotation,
        };
      }

      return {
        ...shape,
        ...rect,
      };
    },
  };
};

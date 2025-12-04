
const POLYLINE_DEFAULT_STYLE = {
  stroke: '#ff4d4f',
  strokeWidth: 6,
  opacity: 1,
  lineStyle: 'solid',
};

const POLYLINE_PARAMETERS = [
  {
    id: 'stroke',
    type: 'color',
    label: '颜色',
    icon: 'ti ti-droplet',
  },
  {
    id: 'strokeWidth',
    type: 'slider',
    label: '粗细',
    min: 1,
    max: 32,
    step: 1,
    unit: 'px',
    showInput: true,
  },
  {
    id: 'opacity',
    type: 'slider',
    label: '透明度',
    min: 0.1,
    max: 1,
    step: 0.05,
    formatter: (value) => `${Math.round(value * 100)}%`,
  },
  {
    id: 'lineStyle',
    type: 'segmented',
    label: '类型',
    options: [
      { value: 'solid', label: '实线' },
      { value: 'dashed', label: '虚线' },
    ],
  },
];

export const createPolylineTool = () => {
  return {
    id: 'polyline',
    name: '折线',
    parameters: POLYLINE_PARAMETERS,
    getDefaultStyle: () => ({ ...POLYLINE_DEFAULT_STYLE }),
    
    clickMode: true,

    createShape: (pos, style) => {
      const merged = { ...POLYLINE_DEFAULT_STYLE, ...style };
      let dash = undefined;
      if (merged.lineStyle === 'dashed') {
        dash = [Math.max(merged.strokeWidth * 2, 8), Math.max(merged.strokeWidth * 1.2, 4)];
      }

      return {
        tool: 'polyline',
        points: [pos.x, pos.y],
        stroke: merged.stroke,
        strokeWidth: merged.strokeWidth,
        opacity: merged.opacity,
        dash,
        lineCap: 'round',
        lineJoin: 'round',
        offsetX: 0,
        offsetY: 0,
        isDrawing: true,
      };
    },

    addPoint: (shape, pos) => {
      const points = [...shape.points];
      if (points.length >= 4) {
        points[points.length - 2] = pos.x;
        points[points.length - 1] = pos.y;
        points.push(pos.x, pos.y);
      }
      return {
        ...shape,
        points,
      };
    },

    updateShape: (shape, pos) => {
      const points = [...shape.points];
      if (points.length === 2) {
        points.push(pos.x, pos.y);
      } else {
        points[points.length - 2] = pos.x;
        points[points.length - 1] = pos.y;
      }
      return {
        ...shape,
        points,
      };
    },

    finishShape: (shape) => {
      const points = [...shape.points];
      if (points.length > 2) {
        points.splice(-2, 2);
      }
      return {
        ...shape,
        points,
        isDrawing: false,
      };
    },
  };
};

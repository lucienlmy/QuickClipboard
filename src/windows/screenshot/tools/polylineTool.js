import { snapToAngle } from '../utils/angleSnap';

const POLYLINE_DEFAULT_STYLE = {
  stroke: '#ff4d4f',
  strokeWidth: 6,
  opacity: 1,
  lineStyle: 'solid',
  connectionType: 'straight',
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
    id: 'connectionType',
    type: 'segmented',
    label: '连线',
    options: [
      { value: 'straight', label: '直线', icon: 'ti ti-line' },
      { value: 'curve', label: '曲线', icon: 'ti ti-wave-sine' },
    ],
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
        lineStyle: merged.lineStyle,
        dash,
        connectionType: merged.connectionType,
        lineCap: 'round',
        lineJoin: 'round',
        offsetX: 0,
        offsetY: 0,
        isDrawing: true,
      };
    },

    addPoint: (shape, pos, options = {}) => {
      const points = [...shape.points];
      let targetX = pos.x;
      let targetY = pos.y;

      if (options.shiftKey && points.length >= 2) {
        const lastIndex = points.length >= 4 ? points.length - 4 : 0;
        const startX = points[lastIndex];
        const startY = points[lastIndex + 1];
        const snapped = snapToAngle(startX, startY, targetX, targetY);
        targetX = snapped.x;
        targetY = snapped.y;
      }
      
      if (points.length >= 4) {
        points[points.length - 2] = targetX;
        points[points.length - 1] = targetY;
        points.push(targetX, targetY);
      }
      return {
        ...shape,
        points,
      };
    },

    updateShape: (shape, pos, options = {}) => {
      const points = [...shape.points];
      let targetX = pos.x;
      let targetY = pos.y;

      if (options.shiftKey && points.length >= 2) {
        const lastIndex = points.length >= 4 ? points.length - 4 : 0;
        const startX = points[lastIndex];
        const startY = points[lastIndex + 1];
        const snapped = snapToAngle(startX, startY, targetX, targetY);
        targetX = snapped.x;
        targetY = snapped.y;
      }
      
      if (points.length === 2) {
        points.push(targetX, targetY);
      } else {
        points[points.length - 2] = targetX;
        points[points.length - 1] = targetY;
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

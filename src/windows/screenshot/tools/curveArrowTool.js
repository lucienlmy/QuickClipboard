import { snapToAngle } from '../utils/angleSnap';

const CURVE_ARROW_DEFAULT_STYLE = {
  stroke: '#ff4d4f',
  strokeWidth: 6,
  opacity: 1,
  lineStyle: 'solid',
};

const CURVE_ARROW_PARAMETERS = [
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
    max: 64,
    step: 1,
    unit: 'px',
    showInput: true,
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

export const createCurveArrowTool = () => {
  return {
    id: 'curveArrow',
    name: '箭头',
    parameters: CURVE_ARROW_PARAMETERS,
    getDefaultStyle: () => ({ ...CURVE_ARROW_DEFAULT_STYLE }),

    createShape: (pos, style) => {
      const merged = { ...CURVE_ARROW_DEFAULT_STYLE, ...style };
      let dash = undefined;
      if (merged.lineStyle === 'dashed') {
        dash = [Math.max(merged.strokeWidth * 2, 10), Math.max(merged.strokeWidth * 1.5, 8)];
      }

      return {
        tool: 'curveArrow',
        x: pos.x,
        y: pos.y,
        points: [0, 0, 0, 0, 0, 0], 
        stroke: merged.stroke,
        strokeWidth: merged.strokeWidth,
        opacity: merged.opacity,
        lineStyle: merged.lineStyle,
        dash: dash,
        lineCap: 'round',
        lineJoin: 'round',
      };
    },

    updateShape: (shape, pos, options = {}) => {
      const startX = shape.x || 0;
      const startY = shape.y || 0;
      let endX = pos.x;
      let endY = pos.y;

      if (options.shiftKey) {
        const snapped = snapToAngle(startX, startY, endX, endY);
        endX = snapped.x;
        endY = snapped.y;
      }
      
      const relEndX = endX - startX;
      const relEndY = endY - startY;
      const controlX = relEndX / 2;
      const controlY = relEndY / 2;

      return {
        ...shape,
        points: [0, 0, controlX, controlY, relEndX, relEndY],
      };
    },
  };
};

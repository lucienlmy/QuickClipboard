
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
        points: [pos.x, pos.y, pos.x, pos.y, pos.x, pos.y], 
        stroke: merged.stroke,
        strokeWidth: merged.strokeWidth,
        opacity: merged.opacity,
        lineStyle: merged.lineStyle,
        dash: dash,
        lineCap: 'round',
        lineJoin: 'round',
      };
    },

    updateShape: (shape, pos) => {
      const startX = shape.points[0];
      const startY = shape.points[1];
      const endX = pos.x;
      const endY = pos.y;
      
      const controlX = (startX + endX) / 2;
      const controlY = (startY + endY) / 2;

      return {
        ...shape,
        points: [startX, startY, controlX, controlY, endX, endY],
      };
    },
  };
};

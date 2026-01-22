import { snapToAngle } from '../utils/angleSnap';

const PEN_DEFAULT_STYLE = {
  stroke: '#ff4d4f',
  strokeWidth: 6,
  opacity: 1,
  lineStyle: 'solid',
  smoothing: 0.5,
  mode: 'free',
};

const PEN_PARAMETERS = [
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
      { value: 'straight', label: '直线' },
    ],
  },
];

const resolvePenStyle = (style = {}) => {
  const merged = {
    ...PEN_DEFAULT_STYLE,
    ...style,
  };

  const result = {
    ...merged,
    dash: undefined,
    globalCompositeOperation: 'source-over',
    mode: 'free',
  };

  if (merged.lineStyle === 'dashed') {
    const dashLength = Math.max(merged.strokeWidth * 2.2, 2);
    const dashGap = Math.max(merged.strokeWidth * 1.4, 1);
    result.dash = [dashLength, dashGap];
  } else if (merged.lineStyle === 'straight') {
    result.mode = 'straight';
    result.tension = 0;
    result.smoothing = 0;
  }

  return result;
};

export const createPenTool = () => {
  return {
    id: 'pen',
    name: '画笔',
    parameters: PEN_PARAMETERS,
    getDefaultStyle: () => ({ ...PEN_DEFAULT_STYLE }),

    // 创建新形状
    createShape: (pos, style) => {
      const resolved = resolvePenStyle(style);
      const baseShape = {
        tool: 'pen',
        points: [pos.x, pos.y],
        stroke: resolved.stroke,
        strokeWidth: resolved.strokeWidth,
        opacity: resolved.opacity ?? 1,
        tension: resolved.smoothing ?? 0.5,
        lineCap: 'round',
        lineJoin: 'round',
        dash: resolved.dash,
        globalCompositeOperation: resolved.globalCompositeOperation,
        mode: resolved.mode,
        offsetX: 0,
        offsetY: 0,
      };
      if (resolved.mode === 'straight') {
        return {
          ...baseShape,
          points: [pos.x, pos.y, pos.x, pos.y],
        };
      }
      return baseShape;
    },

    // 更新形状
    updateShape: (shape, pos, options = {}) => {
      if (shape.mode === 'straight') {
        const updatedPoints = [...shape.points];
        let targetX = pos.x;
        let targetY = pos.y;

        if (options.shiftKey && updatedPoints.length >= 2) {
          const startX = updatedPoints[0];
          const startY = updatedPoints[1];
          const snapped = snapToAngle(startX, startY, targetX, targetY);
          targetX = snapped.x;
          targetY = snapped.y;
        }
        
        if (updatedPoints.length < 4) {
          updatedPoints.push(targetX, targetY);
        } else {
          updatedPoints[2] = targetX;
          updatedPoints[3] = targetY;
        }
        return {
          ...shape,
          points: updatedPoints,
        };
      }
      const newPoints = shape.points.concat([pos.x, pos.y]);
      return {
        ...shape,
        points: newPoints,
      };
    },
  };
};

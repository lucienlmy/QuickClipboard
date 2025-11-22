const MOSAIC_DEFAULT_STYLE = {
  drawMode: 'brush',
  renderMode: 'mosaic',
  coverageMode: 'background',
  brushSize: 20,
  mosaicSize: 10,
  blurRadius: 10,
  opacity: 1,
};

const MOSAIC_PARAMETERS = [
  {
    id: 'drawMode',
    type: 'segmented',
    label: '绘画模式',
    options: [
      { value: 'brush', label: '画笔', icon: 'ti ti-brush' },
      { value: 'region', label: '区域', icon: 'ti ti-rectangle' },
    ],
    iconOnly: true,
  },
  {
    id: 'renderMode',
    type: 'segmented',
    label: '渲染模式',
    options: [
      { value: 'mosaic', label: '马赛克', icon: 'ti ti-grid-dots' },
      { value: 'blur', label: '模糊', icon: 'ti ti-blur' },
    ],
    iconOnly: true,
  },
  {
    id: 'coverageMode',
    type: 'segmented',
    label: '覆盖模式',
    options: [
      { value: 'background', label: '背景', icon: 'ti ti-photo' },
      { value: 'global', label: '全局', icon: 'ti ti-layers-intersect' },
    ],
    iconOnly: true,
  },
  {
    id: 'brushSize',
    type: 'slider',
    label: '笔刷大小',
    min: 10,
    max: 100,
    step: 5,
    unit: 'px',
    showInput: true,
    visible: (style) => style.drawMode === 'brush',
  },
  {
    id: 'mosaicSize',
    type: 'slider',
    label: '马赛克块大小',
    min: 5,
    max: 50,
    step: 1,
    unit: 'px',
    showInput: true,
    visible: (style) => style.renderMode === 'mosaic',
  },
  {
    id: 'blurRadius',
    type: 'slider',
    label: '模糊半径',
    min: 5,
    max: 50,
    step: 1,
    unit: 'px',
    showInput: true,
    visible: (style) => style.renderMode === 'blur',
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
];

const resolveMosaicStyle = (style = {}) => {
  return {
    ...MOSAIC_DEFAULT_STYLE,
    ...style,
  };
};

export const createMosaicTool = () => {
  return {
    id: 'mosaic',
    name: '马赛克',
    parameters: MOSAIC_PARAMETERS,
    getDefaultStyle: () => ({ ...MOSAIC_DEFAULT_STYLE }),

    // 创建新形状
    createShape: (pos, style) => {
      const resolved = resolveMosaicStyle(style);
      
      // 画笔模式：记录路径点
      if (resolved.drawMode === 'brush') {
        return {
          tool: 'mosaic',
          drawMode: 'brush',
          renderMode: resolved.renderMode,
          coverageMode: resolved.coverageMode,
          brushSize: resolved.brushSize,
          mosaicSize: resolved.mosaicSize,
          blurRadius: resolved.blurRadius,
          opacity: resolved.opacity,
          points: [pos.x, pos.y],
          offsetX: 0,
          offsetY: 0,
        };
      }
      
      // 区域模式：记录矩形区域
      return {
        tool: 'mosaic',
        drawMode: 'region',
        renderMode: resolved.renderMode,
        coverageMode: resolved.coverageMode,
        mosaicSize: resolved.mosaicSize,
        blurRadius: resolved.blurRadius,
        opacity: resolved.opacity,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
        _meta: {
          startPoint: { x: pos.x, y: pos.y },
        },
      };
    },

    // 更新形状
    updateShape: (shape, pos) => {
      // 画笔模式：添加新点
      if (shape.drawMode === 'brush') {
        const newPoints = shape.points.concat([pos.x, pos.y]);
        return {
          ...shape,
          points: newPoints,
        };
      }
      
      // 区域模式：更新矩形
      const { startPoint } = shape._meta || { startPoint: { x: shape.x, y: shape.y } };
      const x = Math.min(startPoint.x, pos.x);
      const y = Math.min(startPoint.y, pos.y);
      const width = Math.abs(pos.x - startPoint.x);
      const height = Math.abs(pos.y - startPoint.y);
      
      return {
        ...shape,
        x,
        y,
        width,
        height,
      };
    },
  };
};

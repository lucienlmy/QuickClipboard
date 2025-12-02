// 序号标注工具

const NUMBER_DEFAULT_STYLE = {
  currentNumber: 1,
  numberType: 'decimal',
  style: 'circle',
  size: 32,
  backgroundColor: '#ff4d4f',
  textColor: '#ffffff',
  borderWidth: 2,
  borderColor: '#ffffff',
  opacity: 1,
  showBorder: true,
  showFill: true,
  fontSize: 16,
  fontWeight: 'bold',
};

const NUMBER_PARAMETERS = [
  {
    id: 'currentNumber',
    type: 'number',
    label: '序号',
    min: 0,
    max: 999999,
    step: 1,
  },
  {
    id: 'numberType',
    type: 'select',
    label: '序号类型',
    searchable: false,
    options: [
      { value: 'decimal', label: '阿拉伯数字 (1, 2, 3)' },
      { value: 'lower-alpha', label: '小写字母 (a, b, c)' },
      { value: 'upper-alpha', label: '大写字母 (A, B, C)' },
      { value: 'lower-roman', label: '小写罗马 (i, ii, iii)' },
      { value: 'upper-roman', label: '大写罗马 (I, II, III)' },
      { value: 'cjk', label: '中文数字 (一, 二, 三)' },
    ],
  },
  {
    id: 'style',
    type: 'segmented',
    label: '样式',
    iconOnly: true,
    wrap: true,
    columns: 4,
    options: [
      { value: 'circle', label: '圆形', icon: 'ti ti-circle' },
      { value: 'square', label: '方形', icon: 'ti ti-square' },
      { value: 'rounded-square', label: '圆角', icon: 'ti ti-square-rounded' },
      { value: 'hexagon', label: '六边形', icon: 'ti ti-hexagon' },
      { value: 'diamond', label: '菱形', icon: 'ti ti-diamonds' },
      { value: 'octagon', label: '八边形', icon: 'ti ti-octagon' },
      { value: 'tag', label: '标签', icon: 'ti ti-tag' },
      { value: 'badge', label: '徽章', icon: 'ti ti-shield' },
    ],
  },
  {
    id: 'size',
    type: 'slider',
    label: '大小',
    min: 20,
    max: 80,
    step: 2,
    unit: 'px',
    showInput: true,
  },
  {
    id: 'showFill',
    type: 'segmented',
    label: '填充',
    options: [
      { value: true, label: '显示' },
      { value: false, label: '隐藏' },
    ],
  },
  {
    id: 'backgroundColor',
    type: 'color',
    label: '背景色',
    icon: 'ti ti-droplet-filled',
    visible: (style) => style.showFill,
  },
  {
    id: 'textColor',
    type: 'color',
    label: '文字色',
    icon: 'ti ti-typography',
  },
  {
    id: 'showBorder',
    type: 'segmented',
    label: '描边',
    options: [
      { value: true, label: '显示' },
      { value: false, label: '隐藏' },
    ],
  },
  {
    id: 'borderWidth',
    type: 'slider',
    label: '描边粗细',
    min: 0,
    max: 8,
    step: 1,
    unit: 'px',
    showInput: true,
    visible: (style) => style.showBorder,
  },
  {
    id: 'borderColor',
    type: 'color',
    label: '描边色',
    icon: 'ti ti-border-outer',
    visible: (style) => style.showBorder,
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

export const createNumberTool = () => {
  return {
    id: 'number',
    name: '序号',
    parameters: NUMBER_PARAMETERS,
    getDefaultStyle: () => ({ ...NUMBER_DEFAULT_STYLE }),

    createShape: (pos, style) => {
      const numberStyle = { ...NUMBER_DEFAULT_STYLE, ...style };
      const number = numberStyle.currentNumber;
      
      // 根据样式计算位置偏移，使序号居中对齐点击位置
      const offset = numberStyle.size / 2;
      
      return {
        tool: 'number',
        x: pos.x - offset,
        y: pos.y - offset,
        number: number,
        numberType: numberStyle.numberType,
        style: numberStyle.style,
        size: numberStyle.size,
        backgroundColor: numberStyle.backgroundColor,
        textColor: numberStyle.textColor,
        borderWidth: numberStyle.showBorder ? numberStyle.borderWidth : 0,
        borderColor: numberStyle.borderColor,
        opacity: numberStyle.opacity,
        showFill: numberStyle.showFill,
        fontSize: numberStyle.fontSize,
        fontWeight: numberStyle.fontWeight,
        draggable: true,
      };
    },

    updateShape: (shape, pos) => {
      return shape;
    },

    afterCreate: (currentStyle) => {
      return {
        ...currentStyle,
        currentNumber: currentStyle.currentNumber + 1,
      };
    },
  };
};

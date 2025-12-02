const TEXT_DEFAULT_STYLE = {
  text: '双击编辑文本',
  fontSize: 24,
  fill: '#ff4d4f',
  fontFamily: 'Arial, Microsoft YaHei, sans-serif',
  fontStyle: [],
  align: 'left',
  lineHeight: 1.2,
  opacity: 1,
  stroke: '',
  strokeWidth: 0,
};

const TEXT_PARAMETERS = [
  {
    id: 'text',
    type: 'textarea',
    label: '文本内容',
    placeholder: '输入文本...',
    rows: 3,
  },
  {
    id: 'fontFamily',
    type: 'select',
    label: '字体',
    defaultValue: 'Arial, Microsoft YaHei, sans-serif',
    preview: true,
    options: [
      { value: 'Arial, Microsoft YaHei, sans-serif', label: 'Arial (推荐)' },
      
      // 中文字体 (Windows)
      { value: 'Microsoft YaHei, sans-serif', label: '微软雅黑' },
      { value: 'Microsoft YaHei UI, sans-serif', label: '微软雅黑 UI' },
      { value: 'SimSun, serif', label: '宋体' },
      { value: 'SimHei, sans-serif', label: '黑体' },
      { value: 'KaiTi, serif', label: '楷体' },
      { value: 'FangSong, serif', label: '仿宋' },
      { value: 'NSimSun, serif', label: '新宋体' },
      { value: 'YouYuan, cursive', label: '幼圆' },
      { value: 'LiSu, cursive', label: '隶书' },
      { value: 'STXihei, sans-serif', label: '华文细黑' },
      { value: 'STKaiti, serif', label: '华文楷体' },
      { value: 'STSong, serif', label: '华文宋体' },
      { value: 'STFangsong, serif', label: '华文仿宋' },
      
      // 中文字体 (macOS)
      { value: 'PingFang SC, sans-serif', label: '苹方-简' },
      { value: 'PingFang TC, sans-serif', label: '苹方-繁' },
      { value: 'Heiti SC, sans-serif', label: '黑体-简' },
      { value: 'Heiti TC, sans-serif', label: '黑体-繁' },
      
      // 等宽/代码字体
      { value: 'Consolas, monospace', label: 'Consolas (代码)' },
      { value: 'Courier New, monospace', label: 'Courier New' },
      { value: 'Monaco, monospace', label: 'Monaco (Mac)' },
      { value: 'Menlo, monospace', label: 'Menlo (Mac)' },
      { value: 'Lucida Console, monospace', label: 'Lucida Console' },
      
      // 英文无衬线字体
      { value: 'Arial, sans-serif', label: 'Arial' },
      { value: 'Helvetica, sans-serif', label: 'Helvetica' },
      { value: 'Helvetica Neue, sans-serif', label: 'Helvetica Neue (Mac)' },
      { value: 'Verdana, sans-serif', label: 'Verdana' },
      { value: 'Tahoma, sans-serif', label: 'Tahoma' },
      { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
      { value: 'Segoe UI, sans-serif', label: 'Segoe UI' },
      { value: 'Calibri, sans-serif', label: 'Calibri' },
      { value: 'Candara, sans-serif', label: 'Candara' },
      { value: 'Century Gothic, sans-serif', label: 'Century Gothic' },
      
      // 英文衬线字体
      { value: 'Times New Roman, serif', label: 'Times New Roman' },
      { value: 'Georgia, serif', label: 'Georgia' },
      { value: 'Palatino, serif', label: 'Palatino' },
      { value: 'Palatino Linotype, serif', label: 'Palatino Linotype' },
      { value: 'Book Antiqua, serif', label: 'Book Antiqua' },
      { value: 'Cambria, serif', label: 'Cambria' },
      { value: 'Garamond, serif', label: 'Garamond' },
      { value: 'Baskerville, serif', label: 'Baskerville' },
      
      // 特殊字体
      { value: 'Impact, sans-serif', label: 'Impact' },
      { value: 'Comic Sans MS, cursive', label: 'Comic Sans MS' },
      { value: 'Papyrus, fantasy', label: 'Papyrus' },
      { value: 'Brush Script MT, cursive', label: 'Brush Script' },
    ],
  },
  {
    id: 'fill',
    type: 'color',
    label: '文字颜色',
    icon: 'ti ti-droplet',
  },
  {
    id: 'fontSize',
    type: 'slider',
    label: '字号',
    min: 12,
    max: 128,
    step: 2,
    unit: 'px',
    showInput: true,
  },
  {
    id: 'lineHeight',
    type: 'slider',
    label: '行高',
    min: 0.8,
    max: 3,
    step: 0.1,
    formatter: (value) => value.toFixed(1),
  },
  {
    id: 'fontStyle',
    type: 'multiToggle',
    label: '样式',
    options: [
      { value: 'bold', label: '加粗', icon: 'ti ti-bold' },
      { value: 'italic', label: '斜体', icon: 'ti ti-italic' },
    ],
    iconOnly: true,
  },
  {
    id: 'align',
    type: 'segmented',
    label: '对齐',
    options: [
      { value: 'left', label: '左对齐', icon: 'ti ti-align-left' },
      { value: 'center', label: '居中', icon: 'ti ti-align-center' },
      { value: 'right', label: '右对齐', icon: 'ti ti-align-right' },
    ],
    iconOnly: true,
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

export const createTextTool = () => {
  return {
    id: 'text',
    name: '文本',
    parameters: TEXT_PARAMETERS,
    getDefaultStyle: () => ({ ...TEXT_DEFAULT_STYLE }),

    createShape: (pos, style) => {
      const textStyle = { ...TEXT_DEFAULT_STYLE, ...style };
      const offsetY = textStyle.fontSize * 0.5;
      
      return {
        tool: 'text',
        x: pos.x,
        y: pos.y - offsetY,
        text: textStyle.text,
        fontSize: textStyle.fontSize,
        fill: textStyle.fill,
        fontFamily: textStyle.fontFamily,
        fontStyle: textStyle.fontStyle,
        align: textStyle.align,
        lineHeight: textStyle.lineHeight,
        opacity: textStyle.opacity,
        stroke: textStyle.stroke,
        strokeWidth: textStyle.strokeWidth,
        width: 200,
        draggable: true,
        _isNew: true,
      };
    },

    updateShape: (shape, pos) => {
      return shape;
    },
  };
};

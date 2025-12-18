// 边框工具

const BORDER_DEFAULT_STYLE = {
  enabled: false,
  width: 4,
  color: '#ff4d4f',
  style: 'solid', // solid, dashed, dotted
  opacity: 1,
  shadow: false,
  shadowColor: '#000000',
  shadowBlur: 10,
  shadowOffsetX: 0,
  shadowOffsetY: 4,
};

const BORDER_PARAMETERS = [
  {
    id: 'enabled',
    type: 'segmented',
    label: '边框状态',
    options: [
      { value: false, label: '关闭', icon: 'ti ti-eye-off' },
      { value: true, label: '开启', icon: 'ti ti-eye' },
    ],
    iconOnly: false,
  },
  {
    id: 'width',
    type: 'slider',
    label: '边框宽度',
    min: 1,
    max: 20,
    step: 1,
    unit: 'px',
    showInput: true,
    visible: (style) => style.enabled,
  },
  {
    id: 'color',
    type: 'color',
    label: '边框颜色',
    icon: 'ti ti-palette',
    visible: (style) => style.enabled,
  },
  {
    id: 'style',
    type: 'select',
    label: '边框样式',
    defaultValue: 'solid',
    options: [
      { value: 'solid', label: '实线' },
      { value: 'dashed', label: '虚线' },
      { value: 'dotted', label: '点线' },
    ],
    visible: (style) => style.enabled,
  },
  {
    id: 'opacity',
    type: 'slider',
    label: '透明度',
    min: 0.1,
    max: 1,
    step: 0.05,
    formatter: (value) => `${Math.round(value * 100)}%`,
    visible: (style) => style.enabled,
  },
  {
    id: 'shadow',
    type: 'segmented',
    label: '阴影',
    options: [
      { value: false, label: '关闭', icon: 'ti ti-shadow-off' },
      { value: true, label: '开启', icon: 'ti ti-shadow' },
    ],
    iconOnly: false,
    visible: (style) => style.enabled,
  },
  {
    id: 'shadowColor',
    type: 'color',
    label: '阴影颜色',
    icon: 'ti ti-droplet',
    visible: (style) => style.enabled && style.shadow,
  },
  {
    id: 'shadowBlur',
    type: 'slider',
    label: '阴影模糊',
    min: 0,
    max: 30,
    step: 1,
    unit: 'px',
    showInput: true,
    visible: (style) => style.enabled && style.shadow,
  },
  {
    id: 'shadowOffsetX',
    type: 'slider',
    label: '阴影水平偏移',
    min: -20,
    max: 20,
    step: 1,
    unit: 'px',
    showInput: true,
    visible: (style) => style.enabled && style.shadow,
  },
  {
    id: 'shadowOffsetY',
    type: 'slider',
    label: '阴影垂直偏移',
    min: -20,
    max: 20,
    step: 1,
    unit: 'px',
    showInput: true,
    visible: (style) => style.enabled && style.shadow,
  },
];

export const createBorderTool = () => {
  return {
    id: 'border',
    name: '边框',
    parameters: BORDER_PARAMETERS,
    getDefaultStyle: () => ({ ...BORDER_DEFAULT_STYLE }),
  };
};

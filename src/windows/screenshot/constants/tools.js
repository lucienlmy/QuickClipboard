// 工具配置

// 绘图工具
export const DRAWING_TOOLS = [
  { id: 'select', icon: 'ti ti-pointer', title: '选择' },
  { id: 'pen', icon: 'ti ti-pencil', title: '画笔' },
  { id: 'text', icon: 'ti ti-typography', title: '文本' },
  { id: 'mosaic', icon: 'ti ti-blur', title: '马赛克' },
  { id: 'number', icon: 'ti ti-circle-number-1', title: '序号' },
  { id: 'polyline', icon: 'ti ti-line', title: '折线' },
  { id: 'curveArrow', icon: 'ti ti-arrow-ramp-right', title: '箭头' },
  { id: 'shape', icon: 'ti ti-triangle-square-circle', title: '形状' },
  { id: 'border', icon: 'ti ti-border-outer', title: '边框' },
  { id: 'watermark', icon: 'ti ti-droplet-half-2', title: '水印' },
  { id: 'ocr', icon: 'ti ti-text-scan-2', title: 'OCR识别' },
];

// 历史操作
export const HISTORY_TOOLS = [
  { id: 'undo', icon: 'ti ti-arrow-back-up', title: '撤销', actionKey: 'undo' },
  { id: 'redo', icon: 'ti ti-arrow-forward-up', title: '重做', actionKey: 'redo' },
  { id: 'clear', icon: 'ti ti-trash', title: '清空画布', actionKey: 'clear' },
];

// 确认操作
export const ACTION_TOOLS = [
  { id: 'confirm', icon: 'ti ti-check', title: '确定', actionKey: 'confirm' },
  { id: 'cancel', icon: 'ti ti-x', title: '取消', actionKey: 'cancel' },
  { id: 'save', icon: 'ti ti-download', title: '保存', actionKey: 'save' },
  { id: 'pin', icon: 'ti ti-pin', title: '贴图', actionKey: 'pin' },
];

export const ALL_TOOLS = [
  ...DRAWING_TOOLS,
  ...HISTORY_TOOLS.map(t => ({ ...t, isAction: true })),
  ...ACTION_TOOLS.map(t => ({ ...t, isAction: true })),
];

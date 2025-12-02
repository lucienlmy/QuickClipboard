// OCR识别工具
const OCR_DEFAULT_STYLE = {
  mode: 'normal',
  recognizedText: '',
};

const OCR_PARAMETERS = [
  {
    id: 'mode',
    type: 'select',
    label: '识别模式',
    defaultValue: 'normal',
    options: [
      { value: 'normal', label: '普通识别' },
      { value: 'advanced', label: '高级识别（开发中）', disabled: true },
    ],
  },
  {
    id: 'recognizedText',
    type: 'textarea',
    label: '识别结果',
    placeholder: '文本识别结果将显示在这里...',
    rows: 3,
    persist: false,
  },
  {
    id: 'copyAll',
    type: 'button',
    label: '复制全部',
    icon: 'ti ti-copy',
    action: 'copyAll',
    variant: 'primary',
  },
  {
    id: 'copySelected',
    type: 'button',
    label: '复制选中',
    icon: 'ti ti-copy',
    action: 'copySelected',
    variant: 'default',
  },
];

export const createOcrTool = () => {
  return {
    id: 'ocr',
    name: 'OCR识别',
    parameters: OCR_PARAMETERS,
    getDefaultStyle: () => ({ ...OCR_DEFAULT_STYLE }),
    createShape: () => null,
    updateShape: (shape) => shape,
  };
};
